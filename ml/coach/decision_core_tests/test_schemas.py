from __future__ import annotations

import math

import pytest
from pydantic import ValidationError

from formpath_coach.decision_core.schemas import (
    DecisionDistributionV1,
    DecisionOptionV1,
    DecisionPacketV1,
)


def _elbow_distribution(**overrides: float) -> DecisionDistributionV1:
    probabilities = {
        "good": 0.70,
        "minor_issue": 0.20,
        "major_issue": 0.05,
        "unknown": 0.05,
    }
    probabilities.update(overrides)
    return DecisionDistributionV1(
        head="elbow_alignment",
        options=[
            DecisionOptionV1(label=label, probability=probability)
            for label, probability in probabilities.items()
        ],
    )


def test_valid_distribution_derives_top_label_and_probability() -> None:
    distribution = _elbow_distribution()

    assert distribution.top_label == "good"
    assert math.isclose(distribution.top_probability, 0.70)


@pytest.mark.parametrize(
    "options",
    [
        [
            DecisionOptionV1(label="good", probability=0.80),
            DecisionOptionV1(label="minor_issue", probability=0.10),
            DecisionOptionV1(label="major_issue", probability=0.10),
        ],
        [
            DecisionOptionV1(label="good", probability=0.70),
            DecisionOptionV1(label="minor_issue", probability=0.10),
            DecisionOptionV1(label="major_issue", probability=0.10),
            DecisionOptionV1(label="unknown", probability=0.05),
            DecisionOptionV1(label="perfect", probability=0.05),
        ],
        [
            DecisionOptionV1(label="good", probability=0.60),
            DecisionOptionV1(label="minor_issue", probability=0.20),
            DecisionOptionV1(label="major_issue", probability=0.10),
            DecisionOptionV1(label="unknown", probability=0.05),
            DecisionOptionV1(label="good", probability=0.05),
        ],
    ],
)
def test_distribution_rejects_missing_unknown_and_duplicate_labels(
    options: list[DecisionOptionV1],
) -> None:
    with pytest.raises(ValidationError):
        DecisionDistributionV1(head="elbow_alignment", options=options)


def test_distribution_rejects_probability_sum_outside_tolerance() -> None:
    with pytest.raises(ValidationError):
        _elbow_distribution(unknown=0.10)


def test_packet_rejects_duplicate_heads() -> None:
    distribution = _elbow_distribution()

    with pytest.raises(ValidationError):
        DecisionPacketV1(
            schema_version=1,
            request_id="dec_12345678",
            model_revision="decision_core_v1",
            calibration_revision="uncalibrated",
            distributions=[distribution, distribution],
        )
