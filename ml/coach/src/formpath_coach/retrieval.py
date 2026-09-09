"""Deterministic machine-code evidence retrieval for Coach contract V1.

B2-B.1 never loads the 940-unit corpus as natural language.  The first stage
turns the frozen Coach request into a small query plan expressed only in the
Knowledge Machine v2 DOMAIN / METRIC / POLICY vocabulary.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from formpath_coach.schemas import CoachRequestV1


@dataclass(frozen=True)
class EvidenceQueryPlan:
    domains: tuple[str, ...]
    metrics: tuple[str, ...]
    policies: tuple[str, ...]
    fts_terms: tuple[str, ...]


# Frozen Coach metric -> Knowledge Machine v2 codes.  Only direct, defensible
# correspondences are included; a missing metric code is safer than inventing
# one that changes the meaning of the observation.
_METRIC_QUERY_CODES: Mapping[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "release_elbow_angle_deg": (("SHOOTING", "BIOMECHANICS"), ("JOINT_ANGLE",)),
    "release_wrist_height_sb": (("SHOOTING", "RELEASE_BALLISTICS"), ("RELEASE_HEIGHT",)),
    "release_elbow_lateral_offset_sb": (("SHOOTING", "BIOMECHANICS"), ()),
    "release_shoulder_line_yaw_deg": (("SHOOTING", "BIOMECHANICS"), ("JOINT_ANGLE",)),
    "deepest_dip_knee_angle_deg": (("SHOOTING", "BIOMECHANICS"), ("JOINT_ANGLE",)),
    "follow_through_elbow_angle_deg": (("SHOOTING", "BIOMECHANICS"), ("JOINT_ANGLE",)),
    "follow_through_wrist_over_head_sb": (("SHOOTING", "BIOMECHANICS"), ()),
    "capture_quality": (("POSE_VALIDATION",), ("POSE_ERROR",)),
}

_ACTION_FTS_TERMS: Mapping[str, tuple[str, ...]] = {
    "set_shot": ("set shot",),
    "jump_shot": ("jump shot",),
    "free_throw": ("free throw",),
    "unknown": (),
}

# Safety evidence is part of the retrieval intent, not an afterthought.  These
# codes already exist in the immutable corpus and are therefore safe query keys.
_SAFETY_POLICIES = (
    "DO_NOT_OVERINFER",
    "DO_NOT_INFER_UNOBSERVABLE",
    "REQUIRE_CONTEXT",
    "CONFIDENCE_GATE",
    "HYPOTHESIS_ONLY",
    "USE_PERSONAL_BASELINE",
)


def _ordered_unique(values: list[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(values))


def build_evidence_query_plan(request: CoachRequestV1) -> EvidenceQueryPlan:
    """Translate a frozen Coach request into deterministic corpus machine codes."""
    domains: list[str] = []
    metrics: list[str] = []
    for observation in request.observations:
        observation_domains, observation_metrics = _METRIC_QUERY_CODES[observation.metric]
        domains.extend(observation_domains)
        metrics.extend(observation_metrics)

    if request.context.action in {"set_shot", "jump_shot", "free_throw"}:
        domains.append("SHOOTING")

    # A failed capture should bias retrieval toward measurement limitations.
    if not request.context.quality_passed:
        domains.append("POSE_VALIDATION")

    return EvidenceQueryPlan(
        domains=_ordered_unique(domains),
        metrics=_ordered_unique(metrics),
        policies=_SAFETY_POLICIES,
        fts_terms=_ACTION_FTS_TERMS[request.context.action],
    )
