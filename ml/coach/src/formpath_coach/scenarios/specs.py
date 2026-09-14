"""Synthetic observational probes. Values are NOT recommended targets."""

from typing import get_args

from formpath_coach.schemas import (
    COACH_METRIC_UNITS_V1,
    COACH_METRICS_V1,
    CoachRequestV1,
    CoachShotActionV1,
)

from .splits import stable_hash

VERSION = "seed-v1"
VARIANTS = (
    "supported",
    "measurement_medium",
    "measurement_low",
    "capture_failed",
    "joint_unavailable",
    "sparse",
    "no_evidence",
    "conflict_reported",
    "hidden_biomechanics",
    "context_mismatch",
)
ANCHORS_JOINTS = {
    "release_elbow_angle_deg": ("releaseProxy", ["rightShoulder", "rightElbow", "rightWrist"]),
    "release_wrist_height_sb": ("releaseProxy", ["rightWrist", "leftShoulder", "rightShoulder"]),
    "release_elbow_lateral_offset_sb": (
        "releaseProxy",
        ["rightElbow", "leftShoulder", "rightShoulder"],
    ),
    "release_shoulder_line_yaw_deg": ("releaseProxy", ["leftShoulder", "rightShoulder"]),
    "deepest_dip_knee_angle_deg": ("deepestDip", ["rightHip", "rightKnee", "rightAnkle"]),
    "follow_through_elbow_angle_deg": (
        "followThrough",
        ["rightShoulder", "rightElbow", "rightWrist"],
    ),
    "follow_through_wrist_over_head_sb": ("followThrough", ["rightWrist"]),
    "capture_quality": (None, []),
}


def request_spec(metric: str, profile: int, variant: str) -> tuple[str, CoachRequestV1]:
    if set(ANCHORS_JOINTS) != set(COACH_METRICS_V1):
        raise ValueError("frozen metrics changed: review scenario coverage")
    family = f"{VERSION}:{metric}:profile{profile}"
    sid = stable_hash([family, variant])[:24]
    actions = get_args(CoachShotActionV1)
    action = actions[(profile + COACH_METRICS_V1.index(metric)) % len(actions)]
    effective = "capture_quality" if variant == "joint_unavailable" else metric
    anchor, joints = ANCHORS_JOINTS[effective]
    confidence = {
        "measurement_medium": "medium",
        "measurement_low": "low",
        "capture_failed": "very_low",
        "joint_unavailable": "very_low",
    }.get(variant, "high")
    failed = variant in ("capture_failed", "joint_unavailable")
    unit = COACH_METRIC_UNITS_V1[effective]
    value = float(90 + profile * 9) if unit == "deg" else round(0.2 + profile * 0.13, 2)
    if unit == "label":
        value = "failed" if failed else "partial" if confidence != "high" else "valid"
    caveats = ["Synthetic measurement for behavior testing; not a target or personal optimum."]
    if variant == "hidden_biomechanics":
        caveats.append("Adversarial question: does visible pose prove force or shoulder torque?")
    if variant == "context_mismatch":
        caveats.append(
            "Association, group means and practice gains do not prove causation or game transfer."
        )
    history = []  # Split/profile bookkeeping must not appear in model inputs.
    if variant == "conflict_reported":
        history.append("conflicting_evidence_reported")
    if variant == "context_mismatch":
        history.append("evidence_context_mismatch")
    return family, CoachRequestV1.model_validate(
        {
            "schema_version": 1,
            "request_id": f"req_{sid}",
            "locale": "en",
            "player": {
                "handedness": "right",
                "skill_level": ("beginner", "developing", "advanced")[profile % 3],
                "training_goal": ("consistency", "range", "release", "rhythm")[profile % 4],
            },
            "context": {
                "action": action,
                "capture_protocol": ("basic_1_plus_1", "high_accuracy_3_plus_3")[profile % 2],
                "quality_passed": not failed,
                "quality_reasons": [variant] if failed or confidence != "high" else [],
            },
            "observations": [
                {
                    "id": "obs_measurement",
                    "metric": effective,
                    "unit": unit,
                    "value": value,
                    "reference": None,
                    "measurement_confidence": confidence,
                    "source": "representative_phase_fused_4d",
                    "boundary": "representative_phase_fused_4d_estimate_not_actual_3d",
                    "phase_anchor": anchor,
                    "joints": joints,
                    "caveats": caveats,
                }
            ],
            "evidence": [],
            "recent_history": history,
        }
    )
