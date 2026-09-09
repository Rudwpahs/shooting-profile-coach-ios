"""Coach contract V1 on the Python side, mirroring lib/coach/contract.ts.

Every rule the TypeScript schema enforces is enforced here with the same
outcome, so the shared fixtures under contracts/fixtures/coach can be run by
both sides and must agree.
"""

from __future__ import annotations

import copy
import math
from typing import Any

import pytest
from pydantic import ValidationError

from formpath_coach.schemas import (
    COACH_DO_NOT_INFER_V1,
    COACH_METRIC_UNITS_V1,
    COACH_METRICS_V1,
    COACH_SCHEMA_VERSION,
    REPRESENTATIVE_BOUNDARY,
    CoachObservationV1,
    CoachRequestV1,
    CoachResponseV1,
    PrimaryVisualCueV1,
    resolve_cue_anchor,
    validate_response_for_request,
)

# --------------------------------------------------------------------------- fixtures


def observation_v1(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": "obs_release_elbow_angle",
        "metric": "release_elbow_angle_deg",
        "value": 96.4,
        "unit": "deg",
        "reference": "shooting arm at the release proxy anchor",
        "measurement_confidence": "medium",
        "source": "representative_phase_fused_4d",
        "boundary": REPRESENTATIVE_BOUNDARY,
        "phase_anchor": "releaseProxy",
        "joints": ["rightShoulder", "rightElbow", "rightWrist"],
        "caveats": ["representative phase-fused estimate, not actual 3D"],
    }
    payload.update(overrides)
    return payload


def quality_v1(**overrides: Any) -> dict[str, Any]:
    fields: dict[str, Any] = {
        "id": "obs_capture_quality",
        "metric": "capture_quality",
        "unit": "label",
        "value": "passed",
        "phase_anchor": None,
        "joints": [],
    }
    fields.update(overrides)
    return observation_v1(**fields)


def request_v1(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "schema_version": COACH_SCHEMA_VERSION,
        "request_id": "req_0123456789abcdef",
        "locale": "ko",
        "player": {"handedness": "right", "skill_level": "developing", "training_goal": "consistency"},
        "context": {
            "action": "jump_shot",
            "capture_protocol": "basic_1_plus_1",
            "quality_passed": True,
            "quality_reasons": [],
        },
        "observations": [observation_v1()],
        "evidence": [
            {
                "research_unit_id": 12,
                "claim": "Elbow alignment at release relates to lateral miss in this cohort.",
                "evidence_tier": "B",
                "source_title": None,
                "supported_inferences": ["lateral_alignment"],
                "forbidden_inferences": ["force"],
                "limitations": ["small sample"],
                "contradiction_group": None,
            }
        ],
        "recent_history": ["first_profile"],
    }
    payload.update(overrides)
    return payload


def response_v1(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "schema_version": COACH_SCHEMA_VERSION,
        "request_id": "req_0123456789abcdef",
        "observation_summary": ["릴리스 추정 시점 팔꿈치 각도 96도, 중간 신뢰도"],
        "hypotheses": [
            {
                "statement": "릴리스 시 팔꿈치가 약간 벌어져 좌우 편차가 생길 수 있습니다.",
                "confidence": "medium",
                "supporting_observation_ids": ["obs_release_elbow_angle"],
                "competing_explanations": ["촬영 각도 오차"],
            }
        ],
        "confidence": "medium",
        "coaching_comment": "같은 리듬을 먼저 만드세요",
        "do_not_infer": list(COACH_DO_NOT_INFER_V1),
        "drills": [
            {
                "name": "폼 슈팅 10회",
                "purpose": "릴리스 정렬 감각",
                "constraints": ["림 앞 1m"],
                "success_criteria": ["10회 중 8회 같은 궤적"],
                "retest": "다음 촬영에서 팔꿈치 각도 재확인",
            }
        ],
        "retest_plan": ["3일 후 Basic 1+1 재촬영"],
        "evidence_used": [12],
        "primary_visual_cue": {"observation_id": "obs_release_elbow_angle", "label": "릴리스 팔꿈치"},
        "provider": {"id": "deterministic_v1", "revision": "2026-09-09"},
    }
    payload.update(overrides)
    return payload


def locs(exc: ValidationError) -> set[str]:
    return {".".join(str(part) for part in error["loc"]) for error in exc.errors()}


def rejects(model: type, payload: Any, path: str | None = None) -> None:
    with pytest.raises(ValidationError) as info:
        model.model_validate(payload)
    if path is not None:
        assert any(loc.startswith(path) for loc in locs(info.value)), locs(info.value)


def with_extra(payload: dict[str, Any], *path: str, value: Any) -> dict[str, Any]:
    target = copy.deepcopy(payload)
    node: Any = target
    for key in path[:-1]:
        node = node[int(key)] if isinstance(node, list) else node[key]
    node[path[-1]] = value
    return target


# --------------------------------------------------------------------------- request


def test_request_round_trips_unchanged():
    assert COACH_SCHEMA_VERSION == 1
    payload = request_v1()
    assert CoachRequestV1.model_validate(payload).model_dump(mode="json") == payload


@pytest.mark.parametrize(
    ("mutation", "path"),
    [
        (lambda p: with_extra(p, "frames", value=[]), "frames"),
        (lambda p: with_extra(p, "player", "age", value=17), "player.age"),
        (lambda p: with_extra(p, "context", "fileName", value="clip.mov"), "context.fileName"),
        (lambda p: with_extra(p, "observations", "0", "covariance", value=[1, 0, 0, 1, 0, 1]), "observations.0.covariance"),
        (lambda p: {**p, "schema_version": 2}, "schema_version"),
        (lambda p: {**p, "request_id": "0123456789abcdef"}, "request_id"),
        (lambda p: {**p, "request_id": "req_" + "a" * 65}, "request_id"),
        (lambda p: {**p, "locale": "fr"}, "locale"),
        (lambda p: {k: v for k, v in p.items() if k != "request_id"}, "request_id"),
        (lambda p: with_extra(p, "player", "handedness", value="both"), "player.handedness"),
        (lambda p: with_extra(p, "player", "skill_level", value="pro"), "player.skill_level"),
        (lambda p: with_extra(p, "player", "training_goal", value="dunk"), "player.training_goal"),
        (lambda p: with_extra(p, "context", "capture_protocol", value="single_view"), "context.capture_protocol"),
        (lambda p: with_extra(p, "context", "action", value="layup"), "context.action"),
        (lambda p: with_extra(p, "context", "quality_reasons", value=["clip C:/Users/me/shot.mov failed"]), "context.quality_reasons"),
        (lambda p: with_extra(p, "context", "quality_reasons", value=[f"r{i}" for i in range(9)]), "context.quality_reasons"),
        (lambda p: {**p, "observations": []}, "observations"),
        (lambda p: {**p, "observations": [observation_v1(), observation_v1()]}, "observations"),
        (lambda p: {**p, "observations": [observation_v1(id=f"obs_{i}") for i in range(33)]}, "observations"),
        (lambda p: {**p, "evidence": [p["evidence"][0], dict(p["evidence"][0])]}, "evidence"),
        (lambda p: with_extra(p, "evidence", "0", "evidence_tier", value="Z"), "evidence.0.evidence_tier"),
        (lambda p: with_extra(p, "evidence", "0", "research_unit_id", value=0), "evidence.0.research_unit_id"),
        (lambda p: with_extra(p, "evidence", "0", "research_unit_id", value=1.5), "evidence.0.research_unit_id"),
        (lambda p: {**p, "recent_history": ["Missed 7 of 10 from the wing yesterday"]}, "recent_history"),
        (lambda p: {**p, "recent_history": [f"h{i}" for i in range(11)]}, "recent_history"),
    ],
)
def test_request_rejections(mutation, path):
    rejects(CoachRequestV1, mutation(request_v1()), path)


def test_request_accepts_the_edges():
    CoachRequestV1.model_validate(request_v1(player={"handedness": "unknown", "skill_level": None, "training_goal": None}))
    CoachRequestV1.model_validate(
        request_v1(
            context={
                "action": "unknown",
                "capture_protocol": "high_accuracy_3_plus_3",
                "quality_passed": False,
                "quality_reasons": ["uncertainty_exceeds_limit"],
            }
        )
    )
    CoachRequestV1.model_validate(request_v1(observations=[observation_v1(id=f"obs_{i}") for i in range(32)]))
    CoachRequestV1.model_validate(request_v1(evidence=[], recent_history=[]))


# --------------------------------------------------------------------------- observation


def test_observation_metrics_and_units_are_closed():
    assert list(COACH_METRICS_V1) == [
        "release_elbow_angle_deg",
        "release_wrist_height_sb",
        "release_elbow_lateral_offset_sb",
        "release_shoulder_line_yaw_deg",
        "deepest_dip_knee_angle_deg",
        "follow_through_elbow_angle_deg",
        "follow_through_wrist_over_head_sb",
        "capture_quality",
    ]
    assert COACH_METRIC_UNITS_V1 == {
        "release_elbow_angle_deg": "deg",
        "release_wrist_height_sb": "shoulder_breadths",
        "release_elbow_lateral_offset_sb": "shoulder_breadths",
        "release_shoulder_line_yaw_deg": "deg",
        "deepest_dip_knee_angle_deg": "deg",
        "follow_through_elbow_angle_deg": "deg",
        "follow_through_wrist_over_head_sb": "shoulder_breadths",
        "capture_quality": "label",
    }
    for metric in ["ground_reaction_force_n", "joint_torque_nm", "muscle_activation", "actual_3d_wrist_position_m", "rise_to_release_phase_span"]:
        rejects(CoachObservationV1, observation_v1(metric=metric), "metric")


@pytest.mark.parametrize(
    ("payload", "path"),
    [
        (observation_v1(id="elbow"), "id"),
        (observation_v1(id="obs_Release"), "id"),
        (observation_v1(source="phone_2d"), "source"),
        (observation_v1(boundary="actual_optical_mocap_3d"), "boundary"),
        (observation_v1(unit="shoulder_breadths"), "unit"),
        (observation_v1(unit=None), "unit"),
        (observation_v1(unit="phase_fraction"), "unit"),
        (observation_v1(value="ninety"), "value"),
        (observation_v1(value=361), "value"),
        (observation_v1(value=True), "value"),
        (observation_v1(value=math.nan), "value"),
        (observation_v1(metric="release_wrist_height_sb", unit="shoulder_breadths", value=11), "value"),
        (quality_v1(value=3), "value"),
        (quality_v1(value="Not a code"), "value"),
        (quality_v1(unit="deg", value=1), "unit"),
        (observation_v1(phase_anchor=None), "phase_anchor"),
        (observation_v1(phase_anchor="release"), "phase_anchor"),
        (observation_v1(joints=[]), "joints"),
        (observation_v1(joints=["rightElbow", "rightElbow"]), "joints"),
        (observation_v1(joints=["nose"]), "joints.0"),
        (quality_v1(phase_anchor="ready"), "phase_anchor"),
        (quality_v1(joints=["rightElbow"]), "joints"),
        (observation_v1(measurement_confidence="certain"), "measurement_confidence"),
        (observation_v1(caveats=["c"] * 9), "caveats"),
        (observation_v1(caveats=["x" * 161]), "caveats.0"),
        (observation_v1(reference="x" * 121), "reference"),
        (observation_v1(timestampMs=1240), "timestampMs"),
        (observation_v1(z=0.4), "z"),
    ],
)
def test_observation_rejections(payload, path):
    rejects(CoachObservationV1, payload, path)


def test_observation_accepts_the_edges():
    CoachObservationV1.model_validate(observation_v1(id="obs_a_b1"))
    CoachObservationV1.model_validate(observation_v1(metric="release_wrist_height_sb", unit="shoulder_breadths", value=-0.4))
    CoachObservationV1.model_validate(
        observation_v1(metric="follow_through_elbow_angle_deg", unit="deg", value=171.5, phase_anchor="followThrough")
    )
    CoachObservationV1.model_validate(observation_v1(value=96))
    CoachObservationV1.model_validate(quality_v1(value="recapture_needed"))


# --------------------------------------------------------------------------- response


def test_response_round_trips_unchanged():
    payload = response_v1()
    assert CoachResponseV1.model_validate(payload).model_dump(mode="json") == payload
    CoachResponseV1.model_validate(response_v1(primary_visual_cue=None, hypotheses=[], drills=[], retest_plan=[]))
    CoachResponseV1.model_validate(response_v1(do_not_infer=[*COACH_DO_NOT_INFER_V1, "ball_flight_outcome"]))
    CoachResponseV1.model_validate(response_v1(provider={"id": "remote_formpath_coach_v1", "revision": "adapter-2026-09"}))


@pytest.mark.parametrize(
    ("mutation", "path"),
    [
        (lambda p: {**p, "schema_version": 2}, "schema_version"),
        (lambda p: {**p, "request_id": "nope"}, "request_id"),
        (lambda p: {**p, "provider": {"id": "gpt", "revision": "1"}}, "provider.id"),
        (lambda p: {**p, "provider": {"id": "deterministic_v1", "revision": ""}}, "provider.revision"),
        (lambda p: {**p, "provider": {"id": "deterministic_v1"}}, "provider.revision"),
        (lambda p: {**p, "coordinates": {"x": 0.4, "y": 0.2}}, "coordinates"),
        (lambda p: with_extra(p, "primary_visual_cue", "x", value=0.4), "primary_visual_cue.x"),
        (lambda p: with_extra(p, "hypotheses", "0", "joint_position", value=[1, 2, 3]), "hypotheses.0.joint_position"),
        (lambda p: {**p, "observation_summary": []}, "observation_summary"),
        (lambda p: {**p, "observation_summary": ["x"] * 7}, "observation_summary"),
        (lambda p: {**p, "observation_summary": ["x" * 161]}, "observation_summary.0"),
        (lambda p: {**p, "coaching_comment": ""}, "coaching_comment"),
        (lambda p: {**p, "coaching_comment": "x" * 141}, "coaching_comment"),
        (lambda p: {**p, "coaching_comment": "first line\nsecond line"}, "coaching_comment"),
        (lambda p: {**p, "hypotheses": [p["hypotheses"][0]] * 4}, "hypotheses"),
        (lambda p: with_extra(p, "hypotheses", "0", "supporting_observation_ids", value=[]), "hypotheses.0.supporting_observation_ids"),
        (lambda p: with_extra(p, "hypotheses", "0", "supporting_observation_ids", value=["elbow"]), "hypotheses.0.supporting_observation_ids.0"),
        (lambda p: with_extra(p, "hypotheses", "0", "supporting_observation_ids", value=["obs_a", "obs_a"]), "hypotheses.0.supporting_observation_ids"),
        (lambda p: with_extra(p, "hypotheses", "0", "confidence", value="certain"), "hypotheses.0.confidence"),
        (lambda p: with_extra(p, "hypotheses", "0", "statement", value="x" * 241), "hypotheses.0.statement"),
        (lambda p: with_extra(p, "hypotheses", "0", "competing_explanations", value=["a"] * 5), "hypotheses.0.competing_explanations"),
        (lambda p: {**p, "do_not_infer": []}, "do_not_infer"),
        (lambda p: {**p, "do_not_infer": ["joint_torque", "muscle_activation", "actual_metric_3d_position"]}, "do_not_infer"),
        (lambda p: {**p, "do_not_infer": [*COACH_DO_NOT_INFER_V1, "This is a sentence, not a code"]}, "do_not_infer"),
        (lambda p: {**p, "do_not_infer": [*COACH_DO_NOT_INFER_V1, *[f"extra_{i}" for i in range(9)]]}, "do_not_infer"),
        (lambda p: {**p, "drills": [p["drills"][0]] * 3}, "drills"),
        (lambda p: with_extra(p, "drills", "0", "name", value=""), "drills.0.name"),
        (lambda p: with_extra(p, "drills", "0", "purpose", value="x" * 201), "drills.0.purpose"),
        (lambda p: with_extra(p, "drills", "0", "constraints", value=["c"] * 7), "drills.0.constraints"),
        (lambda p: with_extra(p, "drills", "0", "retest", value=""), "drills.0.retest"),
        (lambda p: {**p, "retest_plan": ["r"] * 5}, "retest_plan"),
        (lambda p: {**p, "evidence_used": [0]}, "evidence_used.0"),
        (lambda p: {**p, "evidence_used": [12, 12]}, "evidence_used"),
        (lambda p: {**p, "evidence_used": ["12"]}, "evidence_used.0"),
        (lambda p: {**p, "evidence_used": list(range(1, 18))}, "evidence_used"),
        (lambda p: {**p, "primary_visual_cue": {"observation_id": "elbow", "label": "팔꿈치"}}, "primary_visual_cue.observation_id"),
        (lambda p: {**p, "primary_visual_cue": {"observation_id": "obs_release_elbow_angle", "label": ""}}, "primary_visual_cue.label"),
        (lambda p: {**p, "primary_visual_cue": {"observation_id": "obs_release_elbow_angle", "label": "x" * 41}}, "primary_visual_cue.label"),
        (lambda p: {**p, "primary_visual_cue": {"observation_id": "obs_release_elbow_angle"}}, "primary_visual_cue.label"),
    ],
)
def test_response_rejections(mutation, path):
    rejects(CoachResponseV1, mutation(response_v1()), path)


# --------------------------------------------------------------------------- grounding


def test_grounding_accepts_a_reply_that_points_into_its_request():
    request = CoachRequestV1.model_validate(request_v1())
    response = CoachResponseV1.model_validate(response_v1())
    assert validate_response_for_request(request, response) == []


def test_grounding_lists_every_failure_in_a_stable_order():
    request = CoachRequestV1.model_validate(request_v1())
    response = CoachResponseV1.model_validate(
        response_v1(
            request_id="req_ffffffffffffffff",
            evidence_used=[99],
            primary_visual_cue={"observation_id": "obs_ghost", "label": "?"},
            hypotheses=[
                response_v1()["hypotheses"][0],
                {**response_v1()["hypotheses"][0], "supporting_observation_ids": ["obs_release_elbow_angle", "obs_ghost"]},
            ],
        )
    )
    assert validate_response_for_request(request, response) == [
        {"code": "request_id_mismatch", "expected": "req_0123456789abcdef", "received": "req_ffffffffffffffff"},
        {"code": "cue_observation_unknown", "observation_id": "obs_ghost"},
        {"code": "hypothesis_observation_unknown", "hypothesis_index": 1, "observation_id": "obs_ghost"},
        {"code": "evidence_unknown", "research_unit_id": 99},
    ]


def test_cue_anchor_resolves_from_the_measured_observation():
    request = CoachRequestV1.model_validate(request_v1(observations=[observation_v1(), quality_v1()]))
    cue = PrimaryVisualCueV1(observation_id="obs_release_elbow_angle", label="릴리스 팔꿈치")
    assert resolve_cue_anchor(request, cue) == {
        "kind": "joints",
        "observation_id": "obs_release_elbow_angle",
        "label": "릴리스 팔꿈치",
        "joints": ["rightShoulder", "rightElbow", "rightWrist"],
        "phase_anchor": "releaseProxy",
    }
    assert resolve_cue_anchor(request, PrimaryVisualCueV1(observation_id="obs_capture_quality", label="촬영 품질")) == {
        "kind": "text_only",
        "observation_id": "obs_capture_quality",
        "label": "촬영 품질",
    }
    assert resolve_cue_anchor(request, PrimaryVisualCueV1(observation_id="obs_ghost", label="?")) is None
