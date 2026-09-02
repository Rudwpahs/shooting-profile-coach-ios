from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


EvidenceTier = Literal["A", "A-", "B+", "B", "C", "D", "H"]
Confidence = Literal["very_low", "low", "medium", "high", "very_high"]


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
