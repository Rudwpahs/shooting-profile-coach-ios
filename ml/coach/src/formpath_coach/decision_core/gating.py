from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

GateReasonV1 = Literal[
    "low_prediction_confidence",
    "low_pose_quality",
    "low_capture_quality",
    "ood_detected",
    "incomplete_shot",
]

_UnitInterval = Annotated[
    float,
    Field(strict=True, ge=0.0, le=1.0, allow_inf_nan=False),
]


class _GateModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class AbstentionPolicyV1(_GateModel):
    min_prediction_probability: _UnitInterval = 0.70
    min_pose_quality: _UnitInterval = 0.70
    min_capture_quality: _UnitInterval = 0.70
    max_ood_score: _UnitInterval = 0.30
    require_complete_shot: bool = True


class GateInputV1(_GateModel):
    top_probability: _UnitInterval
    pose_quality: _UnitInterval
    capture_quality: _UnitInterval
    ood_score: _UnitInterval
    shot_complete: bool


class GateDecisionV1(_GateModel):
    accepted: bool
    reason_codes: list[GateReasonV1]


def evaluate_abstention(
    policy: AbstentionPolicyV1,
    inputs: GateInputV1,
) -> GateDecisionV1:
    reasons: list[GateReasonV1] = []

    if inputs.top_probability < policy.min_prediction_probability:
        reasons.append("low_prediction_confidence")
    if inputs.pose_quality < policy.min_pose_quality:
        reasons.append("low_pose_quality")
    if inputs.capture_quality < policy.min_capture_quality:
        reasons.append("low_capture_quality")
    if inputs.ood_score > policy.max_ood_score:
        reasons.append("ood_detected")
    if policy.require_complete_shot and not inputs.shot_complete:
        reasons.append("incomplete_shot")

    return GateDecisionV1(accepted=not reasons, reason_codes=reasons)
