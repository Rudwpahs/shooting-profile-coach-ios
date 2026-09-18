from __future__ import annotations

import math
from typing import Annotated

import torch
from pydantic import BaseModel, ConfigDict, Field, model_validator

from formpath_coach.decision_core.calibration import temperature_scale_logits
from formpath_coach.decision_core.gating import (
    AbstentionPolicyV1,
    GateDecisionV1,
    GateInputV1,
    evaluate_abstention,
)
from formpath_coach.decision_core.schemas import (
    DECISION_LABELS_V1,
    DecisionDistributionV1,
    DecisionOptionV1,
    DecisionPacketV1,
)

_REVISION_PATTERN = r"^[a-z][a-z0-9_]{0,79}$"
_PositiveFiniteFloat = Annotated[
    float,
    Field(strict=True, gt=0.0, allow_inf_nan=False),
]
_UnitFloat = Annotated[
    float,
    Field(strict=True, ge=0.0, le=1.0, allow_inf_nan=False),
]


class _PipelineModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class TemperatureTableV1(_PipelineModel):
    revision: Annotated[str, Field(pattern=_REVISION_PATTERN, max_length=80)]
    by_head: dict[str, _PositiveFiniteFloat]

    @model_validator(mode="after")
    def _validate_head_coverage(self) -> TemperatureTableV1:
        expected = set(DECISION_LABELS_V1)
        actual = set(self.by_head)
        if actual != expected:
            missing = sorted(expected - actual)
            extra = sorted(actual - expected)
            raise ValueError(
                f"temperature table must cover every V1 head; missing={missing}, extra={extra}"
            )
        return self


class GateContextV1(_PipelineModel):
    ood_score: _UnitFloat


class DecisionResultV1(_PipelineModel):
    packet: DecisionPacketV1
    gate: GateDecisionV1


def _validate_logits(logits_by_head: dict[str, torch.Tensor]) -> None:
    expected = set(DECISION_LABELS_V1)
    actual = set(logits_by_head)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise ValueError(f"logits must cover every V1 head; missing={missing}, extra={extra}")

    for head, labels in DECISION_LABELS_V1.items():
        logits = logits_by_head[head]
        if not isinstance(logits, torch.Tensor):
            raise TypeError(f"logits for {head} must be a torch.Tensor")
        if logits.shape != (1, len(labels)):
            raise ValueError(
                f"logits for {head} must have shape (1, {len(labels)}), got {tuple(logits.shape)}"
            )
        if not torch.isfinite(logits).all():
            raise ValueError(f"logits for {head} must be finite")


def _probability_for(distribution: DecisionDistributionV1, label: str) -> float:
    for option in distribution.options:
        if option.label == label:
            return option.probability
    raise RuntimeError(f"label {label!r} is missing from {distribution.head}")


def build_decision_result_v1(
    *,
    request_id: str,
    model_revision: str,
    logits_by_head: dict[str, torch.Tensor],
    temperatures: TemperatureTableV1,
    gate_context: GateContextV1,
    policy: AbstentionPolicyV1 | None = None,
) -> DecisionResultV1:
    _validate_logits(logits_by_head)

    distributions: list[DecisionDistributionV1] = []
    distributions_by_head: dict[str, DecisionDistributionV1] = {}

    for head, labels in DECISION_LABELS_V1.items():
        raw_logits = logits_by_head[head].detach().cpu().to(dtype=torch.float64)[0].tolist()
        probabilities = temperature_scale_logits(raw_logits, temperatures.by_head[head])
        if not all(math.isfinite(probability) for probability in probabilities):
            raise ValueError(f"calibrated probabilities for {head} must be finite")

        distribution = DecisionDistributionV1(
            head=head,
            options=[
                DecisionOptionV1(label=label, probability=float(probability))
                for label, probability in zip(labels, probabilities, strict=True)
            ],
        )
        distributions.append(distribution)
        distributions_by_head[head] = distribution

    packet = DecisionPacketV1(
        schema_version=1,
        request_id=request_id,
        model_revision=model_revision,
        calibration_revision=temperatures.revision,
        distributions=distributions,
    )

    capture_distribution = distributions_by_head["capture_validity"]
    pose_distribution = distributions_by_head["pose_quality"]
    shot_complete_distribution = distributions_by_head["shot_complete"]

    gate_inputs = GateInputV1(
        top_probability=min(distribution.top_probability for distribution in distributions),
        pose_quality=_probability_for(pose_distribution, "good"),
        capture_quality=_probability_for(capture_distribution, "valid"),
        ood_score=gate_context.ood_score,
        shot_complete=shot_complete_distribution.top_label == "complete",
    )
    gate = evaluate_abstention(policy or AbstentionPolicyV1(), gate_inputs)
    return DecisionResultV1(packet=packet, gate=gate)
