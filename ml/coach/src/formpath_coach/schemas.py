from __future__ import annotations

import math
import re
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

EvidenceTier = Literal["A", "A-", "B+", "B", "C", "D", "H"]
Confidence = Literal["very_low", "low", "medium", "high", "very_high"]


# --------------------------------------------------------------------------- legacy scaffold models
#
# The models below are what the SFT dataset, the inference wrapper and the
# FastAPI scaffold were written against. They are kept unchanged so that
# scaffold keeps working; the app talks to the Coach through the V1 contract
# further down, which is the frozen, shared shape.


class PlayerContext(BaseModel):
    age: int | None = Field(default=None, ge=5, le=100)
    sex: Literal["male", "female", "unspecified"] = "unspecified"
    skill_level: str | None = None
    handedness: Literal["left", "right", "mixed", "unknown"] = "unknown"
    height_cm: float | None = Field(default=None, gt=0)
    training_age_years: float | None = Field(default=None, ge=0)


class BasketballContext(BaseModel):
    action: str
    shot_family: str | None = None
    distance_m: float | None = Field(default=None, ge=0)
    defender_present: bool | None = None
    defender_distance_m: float | None = Field(default=None, ge=0)
    fatigue_state: str | None = None
    game_clock_s: float | None = Field(default=None, ge=0)
    shot_clock_s: float | None = Field(default=None, ge=0)
    court_zone: str | None = None
    notes: list[str] = Field(default_factory=list)


class Observation(BaseModel):
    metric: str
    value: float | str | bool | None
    unit: str | None = None
    reference: str | None = None
    measurement_confidence: Confidence
    source: Literal[
        "phone_2d",
        "multi_view_3d",
        "wearable",
        "force_plate",
        "manual_tag",
        "user_report",
        "other",
    ]
    caveats: list[str] = Field(default_factory=list)


class EvidenceItem(BaseModel):
    research_unit_id: int | None = Field(default=None, ge=1)
    claim: str
    evidence_tier: EvidenceTier
    source_title: str | None = None
    supported_inferences: list[str] = Field(default_factory=list)
    forbidden_inferences: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    contradiction_group: str | None = None


class CoachRequest(BaseModel):
    player: PlayerContext
    context: BasketballContext
    observations: list[Observation]
    evidence: list[EvidenceItem] = Field(default_factory=list)
    recent_history: list[str] = Field(default_factory=list)
    user_goal: str | None = None


class Hypothesis(BaseModel):
    statement: str
    confidence: Confidence
    supporting_observations: list[str] = Field(default_factory=list)
    competing_explanations: list[str] = Field(default_factory=list)


class DrillPrescription(BaseModel):
    name: str
    purpose: str
    constraints: list[str] = Field(default_factory=list)
    success_criteria: list[str] = Field(default_factory=list)
    retest: str


class CoachResponse(BaseModel):
    observation_summary: list[str]
    hypotheses: list[Hypothesis]
    confidence: Confidence
    coaching_comment: str
    do_not_infer: list[str]
    drills: list[DrillPrescription] = Field(default_factory=list)
    retest_plan: list[str] = Field(default_factory=list)
    evidence_used: list[int] = Field(default_factory=list)


# --------------------------------------------------------------------------- Coach contract V1
#
# Mirrors lib/coach/contract.ts field for field. Every model is strict and
# closed (no coercion, no unknown keys); categories are literals, free text
# is capped, and the cross-field rules are the same ones the TypeScript
# schema refines. The shared fixtures under contracts/fixtures/coach are the
# proof that both sides accept and reject the same documents.

COACH_SCHEMA_VERSION = 1
REPRESENTATIVE_BOUNDARY = "representative_phase_fused_4d_estimate_not_actual_3d"

COACH_CONFIDENCE = ("very_low", "low", "medium", "high", "very_high")
COACH_PHASE_ANCHORS = ("ready", "deepestDip", "rise", "releaseProxy", "followThrough")
COACH_JOINTS = (
    "leftShoulder",
    "leftElbow",
    "leftWrist",
    "rightShoulder",
    "rightElbow",
    "rightWrist",
    "leftHip",
    "leftKnee",
    "leftAnkle",
    "rightHip",
    "rightKnee",
    "rightAnkle",
)
COACH_METRICS_V1 = (
    "release_elbow_angle_deg",
    "release_wrist_height_sb",
    "release_elbow_lateral_offset_sb",
    "release_shoulder_line_yaw_deg",
    "deepest_dip_knee_angle_deg",
    "follow_through_elbow_angle_deg",
    "follow_through_wrist_over_head_sb",
    "capture_quality",
)
COACH_METRIC_UNITS_V1: dict[str, str] = {
    "release_elbow_angle_deg": "deg",
    "release_wrist_height_sb": "shoulder_breadths",
    "release_elbow_lateral_offset_sb": "shoulder_breadths",
    "release_shoulder_line_yaw_deg": "deg",
    "deepest_dip_knee_angle_deg": "deg",
    "follow_through_elbow_angle_deg": "deg",
    "follow_through_wrist_over_head_sb": "shoulder_breadths",
    "capture_quality": "label",
}
COACH_UNIT_BOUNDS_V1: dict[str, tuple[float, float]] = {
    "deg": (-360.0, 360.0),
    "shoulder_breadths": (-10.0, 10.0),
}
COACH_DO_NOT_INFER_V1 = (
    "ground_reaction_force",
    "joint_torque",
    "muscle_activation",
    "actual_metric_3d_position",
)
COACH_PROVIDER_IDS = ("deterministic_v1", "remote_formpath_coach_v1")

COACH_REQUEST_ID_PATTERN = r"^req_[a-z0-9]{8,64}$"
COACH_OBSERVATION_ID_PATTERN = r"^obs_[a-z0-9]+(?:_[a-z0-9]+)*$"
COACH_CODE_PATTERN = r"^[a-z][a-z0-9_]{0,63}$"

CoachConfidenceV1 = Literal["very_low", "low", "medium", "high", "very_high"]
CoachPhaseAnchorV1 = Literal["ready", "deepestDip", "rise", "releaseProxy", "followThrough"]
CoachJointV1 = Literal[
    "leftShoulder",
    "leftElbow",
    "leftWrist",
    "rightShoulder",
    "rightElbow",
    "rightWrist",
    "leftHip",
    "leftKnee",
    "leftAnkle",
    "rightHip",
    "rightKnee",
    "rightAnkle",
]
CoachMetricV1 = Literal[
    "release_elbow_angle_deg",
    "release_wrist_height_sb",
    "release_elbow_lateral_offset_sb",
    "release_shoulder_line_yaw_deg",
    "deepest_dip_knee_angle_deg",
    "follow_through_elbow_angle_deg",
    "follow_through_wrist_over_head_sb",
    "capture_quality",
]
CoachUnitV1 = Literal["deg", "shoulder_breadths", "label"]
CoachObservationSourceV1 = Literal["representative_phase_fused_4d"]
CoachObservationBoundaryV1 = Literal["representative_phase_fused_4d_estimate_not_actual_3d"]
CoachHandednessV1 = Literal["left", "right", "unknown"]
CoachSkillLevelV1 = Literal["beginner", "developing", "advanced"]
CoachTrainingGoalV1 = Literal["consistency", "range", "release", "rhythm"]
CoachShotActionV1 = Literal["set_shot", "jump_shot", "free_throw", "unknown"]
CoachCaptureProtocolV1 = Literal["basic_1_plus_1", "high_accuracy_3_plus_3"]
CoachLocaleV1 = Literal["ko", "en"]
CoachProviderIdV1 = Literal["deterministic_v1", "remote_formpath_coach_v1"]

Code = Annotated[str, Field(pattern=COACH_CODE_PATTERN)]
ObservationId = Annotated[str, Field(max_length=64, pattern=COACH_OBSERVATION_ID_PATTERN)]
RequestId = Annotated[str, Field(pattern=COACH_REQUEST_ID_PATTERN)]
ObservationValue = (
    Annotated[int, Field(strict=True)]
    | Annotated[float, Field(strict=True, allow_inf_nan=False)]
    | Annotated[str, Field(max_length=64)]
)

_CODE = re.compile(COACH_CODE_PATTERN)


def _unique(items: list[Any], key: Any, what: str) -> list[Any]:
    if len({key(item) for item in items}) != len(items):
        raise ValueError(f"{what} must be unique")
    return items


class _ContractModel(BaseModel):
    """Strict and closed: no coercion, no unknown keys, no defaults that hide an omission."""

    model_config = ConfigDict(extra="forbid", strict=True)


class CoachObservationV1(_ContractModel):
    id: ObservationId
    metric: CoachMetricV1
    unit: CoachUnitV1
    value: ObservationValue
    reference: Annotated[str, Field(max_length=120)] | None
    measurement_confidence: CoachConfidenceV1
    source: CoachObservationSourceV1
    boundary: CoachObservationBoundaryV1
    phase_anchor: CoachPhaseAnchorV1 | None
    joints: Annotated[list[CoachJointV1], Field(max_length=12)]
    caveats: Annotated[list[Annotated[str, Field(max_length=160)]], Field(max_length=8)]

    @field_validator("unit")
    @classmethod
    def _unit_matches_metric(cls, unit: str, info: ValidationInfo) -> str:
        metric = info.data.get("metric")
        if metric is not None and COACH_METRIC_UNITS_V1[metric] != unit:
            raise ValueError(f"{metric} is measured in {COACH_METRIC_UNITS_V1[metric]}")
        return unit

    @field_validator("value")
    @classmethod
    def _value_matches_unit(cls, value: float | str, info: ValidationInfo) -> float | str:
        unit = info.data.get("unit")
        if unit is None:
            return value
        if unit == "label":
            if not isinstance(value, str) or not _CODE.match(value):
                raise ValueError("a label value is a stable code")
            return value
        low, high = COACH_UNIT_BOUNDS_V1[unit]
        if isinstance(value, (str, bool)) or math.isnan(value) or not low <= value <= high:
            raise ValueError(f"{unit} values are numbers within {low}..{high}")
        return value

    @field_validator("phase_anchor")
    @classmethod
    def _phase_anchor_matches_metric(cls, anchor: str | None, info: ValidationInfo) -> str | None:
        metric = info.data.get("metric")
        if metric == "capture_quality" and anchor is not None:
            raise ValueError("the quality label is not a pose and has no phase anchor")
        if metric is not None and metric != "capture_quality" and anchor is None:
            raise ValueError("a measurement names the phase anchor it was taken at")
        return anchor

    @field_validator("joints")
    @classmethod
    def _joints_match_metric(cls, joints: list[str], info: ValidationInfo) -> list[str]:
        _unique(joints, lambda joint: joint, "joints")
        metric = info.data.get("metric")
        if metric == "capture_quality" and joints:
            raise ValueError("the quality label is not a pose and names no joints")
        if metric is not None and metric != "capture_quality" and not joints:
            raise ValueError("a measurement names at least one joint it was taken from")
        return joints


class CoachPlayerContextV1(_ContractModel):
    handedness: CoachHandednessV1
    skill_level: CoachSkillLevelV1 | None
    training_goal: CoachTrainingGoalV1 | None


class CoachShotContextV1(_ContractModel):
    action: CoachShotActionV1
    capture_protocol: CoachCaptureProtocolV1
    quality_passed: bool
    quality_reasons: Annotated[list[Code], Field(max_length=8)]


class CoachEvidenceItemV1(_ContractModel):
    research_unit_id: Annotated[int, Field(ge=1)]
    claim: Annotated[str, Field(min_length=1, max_length=300)]
    evidence_tier: EvidenceTier
    source_title: Annotated[str, Field(max_length=200)] | None
    supported_inferences: Annotated[list[Annotated[str, Field(max_length=120)]], Field(max_length=8)]
    forbidden_inferences: Annotated[list[Annotated[str, Field(max_length=120)]], Field(max_length=8)]
    limitations: Annotated[list[Annotated[str, Field(max_length=160)]], Field(max_length=8)]
    contradiction_group: Annotated[str, Field(max_length=64)] | None


class CoachRequestV1(_ContractModel):
    schema_version: Literal[1]
    request_id: RequestId
    locale: CoachLocaleV1
    player: CoachPlayerContextV1
    context: CoachShotContextV1
    observations: Annotated[list[CoachObservationV1], Field(min_length=1, max_length=32)]
    evidence: Annotated[list[CoachEvidenceItemV1], Field(max_length=16)]
    recent_history: Annotated[list[Code], Field(max_length=10)]

    @field_validator("observations")
    @classmethod
    def _unique_observation_ids(cls, items: list[CoachObservationV1]) -> list[CoachObservationV1]:
        return _unique(items, lambda item: item.id, "observation ids")

    @field_validator("evidence")
    @classmethod
    def _unique_research_units(cls, items: list[CoachEvidenceItemV1]) -> list[CoachEvidenceItemV1]:
        return _unique(items, lambda item: item.research_unit_id, "research unit ids")


class CoachHypothesisV1(_ContractModel):
    statement: Annotated[str, Field(min_length=1, max_length=240)]
    confidence: CoachConfidenceV1
    supporting_observation_ids: Annotated[list[ObservationId], Field(min_length=1, max_length=8)]
    competing_explanations: Annotated[list[Annotated[str, Field(max_length=160)]], Field(max_length=4)]

    @field_validator("supporting_observation_ids")
    @classmethod
    def _unique_ids(cls, items: list[str]) -> list[str]:
        return _unique(items, lambda item: item, "observation ids")


class CoachDrillV1(_ContractModel):
    name: Annotated[str, Field(min_length=1, max_length=80)]
    purpose: Annotated[str, Field(min_length=1, max_length=200)]
    constraints: Annotated[list[Annotated[str, Field(max_length=120)]], Field(max_length=6)]
    success_criteria: Annotated[list[Annotated[str, Field(max_length=120)]], Field(max_length=6)]
    retest: Annotated[str, Field(min_length=1, max_length=200)]


class PrimaryVisualCueV1(_ContractModel):
    """The only way a reply may point at the body: one observation id the request contained."""

    observation_id: ObservationId
    label: Annotated[str, Field(min_length=1, max_length=40)]


class CoachProviderStampV1(_ContractModel):
    id: CoachProviderIdV1
    revision: Annotated[str, Field(min_length=1, max_length=64)]


class CoachResponseV1(_ContractModel):
    schema_version: Literal[1]
    request_id: RequestId
    observation_summary: Annotated[
        list[Annotated[str, Field(min_length=1, max_length=160)]], Field(min_length=1, max_length=6)
    ]
    hypotheses: Annotated[list[CoachHypothesisV1], Field(max_length=3)]
    confidence: CoachConfidenceV1
    coaching_comment: Annotated[str, Field(min_length=1, max_length=140)]
    do_not_infer: Annotated[list[Code], Field(min_length=1, max_length=12)]
    drills: Annotated[list[CoachDrillV1], Field(max_length=2)]
    retest_plan: Annotated[list[Annotated[str, Field(min_length=1, max_length=160)]], Field(max_length=4)]
    evidence_used: Annotated[list[Annotated[int, Field(ge=1)]], Field(max_length=16)]
    primary_visual_cue: PrimaryVisualCueV1 | None
    provider: CoachProviderStampV1

    @field_validator("coaching_comment")
    @classmethod
    def _one_line(cls, comment: str) -> str:
        if "\n" in comment or "\r" in comment:
            raise ValueError("must be one line")
        return comment

    @field_validator("do_not_infer")
    @classmethod
    def _declares_the_core(cls, items: list[str]) -> list[str]:
        missing = [item for item in COACH_DO_NOT_INFER_V1 if item not in items]
        if missing:
            raise ValueError(
                "must include ground_reaction_force, joint_torque, muscle_activation and "
                "actual_metric_3d_position"
            )
        return items

    @field_validator("evidence_used")
    @classmethod
    def _unique_evidence(cls, items: list[int]) -> list[int]:
        return _unique(items, lambda item: item, "research unit ids")


def validate_response_for_request(
    request: CoachRequestV1, response: CoachResponseV1
) -> list[dict[str, Any]]:
    """Grounding, in the same order and with the same codes as the TypeScript side.

    Returns an empty list when the response points only into its request.
    """
    reasons: list[dict[str, Any]] = []
    if response.request_id != request.request_id:
        reasons.append(
            {"code": "request_id_mismatch", "expected": request.request_id, "received": response.request_id}
        )
    known = {observation.id for observation in request.observations}
    cue = response.primary_visual_cue
    if cue is not None and cue.observation_id not in known:
        reasons.append({"code": "cue_observation_unknown", "observation_id": cue.observation_id})
    for index, hypothesis in enumerate(response.hypotheses):
        for observation_id in hypothesis.supporting_observation_ids:
            if observation_id not in known:
                reasons.append(
                    {
                        "code": "hypothesis_observation_unknown",
                        "hypothesis_index": index,
                        "observation_id": observation_id,
                    }
                )
    evidence = {item.research_unit_id for item in request.evidence}
    for research_unit_id in response.evidence_used:
        if research_unit_id not in evidence:
            reasons.append({"code": "evidence_unknown", "research_unit_id": research_unit_id})
    return reasons


def resolve_cue_anchor(request: CoachRequestV1, cue: PrimaryVisualCueV1) -> dict[str, Any] | None:
    """Where a cue lives: the joints and phase anchor of the observation the app measured."""
    observation = next((item for item in request.observations if item.id == cue.observation_id), None)
    if observation is None:
        return None
    if not observation.joints or observation.phase_anchor is None:
        return {"kind": "text_only", "observation_id": cue.observation_id, "label": cue.label}
    return {
        "kind": "joints",
        "observation_id": cue.observation_id,
        "label": cue.label,
        "joints": list(observation.joints),
        "phase_anchor": observation.phase_anchor,
    }
