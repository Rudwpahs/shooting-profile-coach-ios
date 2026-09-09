"""B2-B.1 deterministic structured retrieval tests."""

from __future__ import annotations

import pytest

from formpath_coach.schemas import CoachRequestV1


def request_with_metrics(*metrics: str, quality_passed: bool = True) -> CoachRequestV1:
    observations = []
    for index, metric in enumerate(metrics):
        is_quality = metric == "capture_quality"
        observations.append(
            {
                "id": f"obs_test_{index}",
                "metric": metric,
                "value": "good" if is_quality else 90.0,
                "unit": "label" if is_quality else ("shoulder_breadths" if metric.endswith("_sb") else "deg"),
                "reference": None,
                "measurement_confidence": "high",
                "source": "representative_phase_fused_4d",
                "boundary": "representative_phase_fused_4d_estimate_not_actual_3d",
                "phase_anchor": None if is_quality else "releaseProxy",
                "joints": [] if is_quality else ["rightElbow"],
                "caveats": [],
            }
        )
    return CoachRequestV1.model_validate(
        {
            "schema_version": 1,
            "request_id": "req_test1234",
            "locale": "ko",
            "player": {"handedness": "right", "skill_level": "advanced", "training_goal": "consistency"},
            "context": {
                "action": "jump_shot",
                "capture_protocol": "basic_1_plus_1",
                "quality_passed": quality_passed,
                "quality_reasons": [],
            },
            "observations": observations,
            "evidence": [],
            "recent_history": [],
        }
    )


def test_query_plan_maps_frozen_metrics_to_machine_codes():
    try:
        from formpath_coach.retrieval import build_evidence_query_plan
    except ImportError:
        pytest.fail("B2-B.1 retrieval module is not implemented yet")

    plan = build_evidence_query_plan(
        request_with_metrics("release_elbow_angle_deg", "capture_quality")
    )

    assert {"SHOOTING", "BIOMECHANICS", "POSE_VALIDATION"} <= set(plan.domains)
    assert {"JOINT_ANGLE", "POSE_ERROR"} <= set(plan.metrics)
    assert "DO_NOT_OVERINFER" in plan.policies
    assert "CONFIDENCE_GATE" in plan.policies
