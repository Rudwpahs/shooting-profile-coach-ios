from __future__ import annotations

import pytest
from pydantic import ValidationError

from formpath_coach.decision_core.gating import (
    AbstentionPolicyV1,
    GateInputV1,
    evaluate_abstention,
)


def _clean_input(**overrides: object) -> GateInputV1:
    values: dict[str, object] = {
        "top_probability": 0.90,
        "pose_quality": 0.85,
        "capture_quality": 0.80,
        "ood_score": 0.10,
        "shot_complete": True,
    }
    values.update(overrides)
    return GateInputV1(**values)


def test_gate_accepts_clean_input() -> None:
    decision = evaluate_abstention(AbstentionPolicyV1(), _clean_input())

    assert decision.accepted is True
    assert decision.reason_codes == []


def test_gate_returns_all_triggered_reasons_in_stable_order() -> None:
    decision = evaluate_abstention(
        AbstentionPolicyV1(),
        _clean_input(
            top_probability=0.50,
            pose_quality=0.40,
            capture_quality=0.30,
            ood_score=0.90,
            shot_complete=False,
        ),
    )

    assert decision.accepted is False
    assert decision.reason_codes == [
        "low_prediction_confidence",
        "low_pose_quality",
        "low_capture_quality",
        "ood_detected",
        "incomplete_shot",
    ]


def test_gate_threshold_boundaries_are_inclusive() -> None:
    policy = AbstentionPolicyV1()
    decision = evaluate_abstention(
        policy,
        _clean_input(
            top_probability=policy.min_prediction_probability,
            pose_quality=policy.min_pose_quality,
            capture_quality=policy.min_capture_quality,
            ood_score=policy.max_ood_score,
        ),
    )

    assert decision.accepted is True
    assert decision.reason_codes == []


def test_policy_can_allow_incomplete_shot() -> None:
    decision = evaluate_abstention(
        AbstentionPolicyV1(require_complete_shot=False),
        _clean_input(shot_complete=False),
    )

    assert decision.accepted is True
    assert decision.reason_codes == []


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("top_probability", -0.01),
        ("pose_quality", 1.01),
        ("capture_quality", float("nan")),
        ("ood_score", float("inf")),
    ],
)
def test_gate_input_rejects_out_of_range_or_non_finite_values(
    field: str,
    value: float,
) -> None:
    values = {
        "top_probability": 0.90,
        "pose_quality": 0.85,
        "capture_quality": 0.80,
        "ood_score": 0.10,
        "shot_complete": True,
    }
    values[field] = value

    with pytest.raises(ValidationError):
        GateInputV1(**values)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("min_prediction_probability", -0.01),
        ("min_pose_quality", 1.01),
        ("min_capture_quality", float("nan")),
        ("max_ood_score", float("inf")),
    ],
)
def test_policy_rejects_out_of_range_or_non_finite_thresholds(
    field: str,
    value: float,
) -> None:
    with pytest.raises(ValidationError):
        AbstentionPolicyV1(**{field: value})
