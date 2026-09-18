from __future__ import annotations

import math
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

DecisionHeadV1 = Literal[
    "capture_validity",
    "pose_quality",
    "view_quality",
    "shot_complete",
    "shot_phase",
    "release_event",
    "release_timing",
    "elbow_alignment",
    "lower_body_sequence",
    "balance",
    "left_right_asymmetry",
    "follow_through",
]

DECISION_LABELS_V1: dict[str, tuple[str, ...]] = {
    "capture_validity": ("valid", "invalid"),
    "pose_quality": ("good", "degraded", "poor"),
    "view_quality": ("good", "degraded", "poor"),
    "shot_complete": ("complete", "incomplete"),
    "shot_phase": ("ready", "deepest_dip", "rise", "release", "follow_through"),
    "release_event": ("before", "at", "after", "not_observed"),
    "release_timing": ("early", "good", "late", "unknown"),
    "elbow_alignment": ("good", "minor_issue", "major_issue", "unknown"),
    "lower_body_sequence": ("good", "minor_issue", "major_issue", "unknown"),
    "balance": ("good", "minor_issue", "major_issue", "unknown"),
    "left_right_asymmetry": ("low", "moderate", "high", "unknown"),
    "follow_through": ("good", "minor_issue", "major_issue", "unknown"),
}

_CODE_PATTERN = r"^[a-z][a-z0-9_]{0,79}$"
_REQUEST_ID_PATTERN = r"^dec_[a-z0-9]{8,64}$"
_PROBABILITY_TOLERANCE = 1e-6


class _DecisionContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class DecisionOptionV1(_DecisionContractModel):
    label: Annotated[str, Field(pattern=_CODE_PATTERN, max_length=80)]
    probability: Annotated[
        float,
        Field(strict=True, ge=0.0, le=1.0, allow_inf_nan=False),
    ]


class DecisionDistributionV1(_DecisionContractModel):
    head: DecisionHeadV1
    options: Annotated[list[DecisionOptionV1], Field(min_length=1)]

    @model_validator(mode="after")
    def _validate_options(self) -> DecisionDistributionV1:
        labels = [option.label for option in self.options]
        if len(labels) != len(set(labels)):
            raise ValueError("decision option labels must be unique")

        expected = set(DECISION_LABELS_V1[self.head])
        actual = set(labels)
        if actual != expected:
            missing = sorted(expected - actual)
            extra = sorted(actual - expected)
            raise ValueError(
                f"decision labels must match head vocabulary; missing={missing}, extra={extra}"
            )

        total = math.fsum(option.probability for option in self.options)
        if not math.isclose(total, 1.0, rel_tol=0.0, abs_tol=_PROBABILITY_TOLERANCE):
            raise ValueError("decision probabilities must sum to 1.0")
        return self

    @property
    def top_label(self) -> str:
        return max(self.options, key=lambda option: option.probability).label

    @property
    def top_probability(self) -> float:
        return max(option.probability for option in self.options)


class DecisionPacketV1(_DecisionContractModel):
    schema_version: Literal[1]
    request_id: Annotated[str, Field(pattern=_REQUEST_ID_PATTERN)]
    model_revision: Annotated[str, Field(pattern=_CODE_PATTERN, max_length=80)]
    calibration_revision: Annotated[str, Field(pattern=_CODE_PATTERN, max_length=80)]
    distributions: Annotated[list[DecisionDistributionV1], Field(min_length=1)]

    @model_validator(mode="after")
    def _validate_unique_heads(self) -> DecisionPacketV1:
        heads = [distribution.head for distribution in self.distributions]
        if len(heads) != len(set(heads)):
            raise ValueError("decision heads must be unique within a packet")
        return self
