"""Deterministic machine-code evidence retrieval for Coach contract V1.

B2-B.1 never loads the 940-unit corpus as natural language. It turns a frozen
Coach request into a machine-code query plan, gathers bounded code-only corpus
candidates, ranks them deterministically, then loads text only for the final
selected research-unit ids before frozen-contract validation.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from formpath_coach.corpus import (
    CANONICAL_UNIT_COUNT,
    CORPUS_DIR,
    CorpusError,
    CorpusUnitCodes,
    search_units,
    units_by_domain,
    units_by_metric,
    units_by_policy,
)
from formpath_coach.corpus_mapping import (
    TIER_STRENGTH,
    coach_evidence_items,
    map_evidence_tier,
)
from formpath_coach.schemas import CoachEvidenceItemV1, CoachRequestV1

COACH_EVIDENCE_MAX = 16


@dataclass(frozen=True)
class EvidenceQueryPlan:
    domains: tuple[str, ...]
    metrics: tuple[str, ...]
    policies: tuple[str, ...]
    fts_terms: tuple[str, ...]


@dataclass(frozen=True)
class RankedEvidenceCandidate:
    unit: CorpusUnitCodes
    score: int
    metric_matches: tuple[str, ...]
    domain_matches: tuple[str, ...]
    policy_matches: tuple[str, ...]
    lexical_match: bool


# Frozen Coach metric -> Knowledge Machine v2 codes. Only direct, defensible
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

# Safety evidence is part of the retrieval intent, not an afterthought. These
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


def rank_evidence_candidates(
    plan: EvidenceQueryPlan,
    candidates: Iterable[CorpusUnitCodes],
    lexical_hit_ids: frozenset[int] = frozenset(),
) -> list[RankedEvidenceCandidate]:
    """Rank code-only units with fixed weights and a stable research-unit tie break."""
    ranked: list[RankedEvidenceCandidate] = []
    plan_metrics = set(plan.metrics)
    plan_domains = set(plan.domains)
    plan_policies = set(plan.policies)
    seen: set[int] = set()

    for unit in candidates:
        if unit.n in seen:
            continue
        seen.add(unit.n)
        metric_matches = tuple(code for code in unit.metrics if code in plan_metrics)
        domain_matches = tuple(code for code in unit.domains if code in plan_domains)
        policy_matches = tuple(code for code in unit.policies if code in plan_policies)
        lexical_match = unit.n in lexical_hit_ids
        evidence_strength = TIER_STRENGTH[map_evidence_tier(unit.evidence)]
        linked_bonus = 4 if unit.provenance == "LINKED" else 0
        score = (
            100 * len(metric_matches)
            + 30 * len(domain_matches)
            + 10 * len(policy_matches)
            + 2 * evidence_strength
            + linked_bonus
            + (8 if lexical_match else 0)
        )
        ranked.append(
            RankedEvidenceCandidate(
                unit=unit,
                score=score,
                metric_matches=metric_matches,
                domain_matches=domain_matches,
                policy_matches=policy_matches,
                lexical_match=lexical_match,
            )
        )

    ranked.sort(
        key=lambda item: (
            -item.score,
            -(1 if item.unit.provenance == "LINKED" else 0),
            -TIER_STRENGTH[map_evidence_tier(item.unit.evidence)],
            item.unit.n,
        )
    )
    return ranked


def retrieve_candidate_units(
    plan: EvidenceQueryPlan,
    candidate_limit: int = 40,
    corpus_dir: Path = CORPUS_DIR,
) -> list[CorpusUnitCodes]:
    """Gather and rank a bounded set without touching any natural-language payload."""
    if candidate_limit < 1:
        raise ValueError("candidate_limit must be >= 1")

    by_id: dict[int, CorpusUnitCodes] = {}

    def add(units: Iterable[CorpusUnitCodes]) -> None:
        for unit in units:
            by_id.setdefault(unit.n, unit)

    for code in plan.metrics:
        add(units_by_metric(code, CANONICAL_UNIT_COUNT, corpus_dir))
    for code in plan.domains:
        add(units_by_domain(code, CANONICAL_UNIT_COUNT, corpus_dir))
    for code in plan.policies:
        add(units_by_policy(code, CANONICAL_UNIT_COUNT, corpus_dir))

    lexical_ids: set[int] = set()
    for term in plan.fts_terms:
        hits = search_units(
            term,
            min(CANONICAL_UNIT_COUNT, max(candidate_limit * 2, 20)),
            corpus_dir,
        )
        lexical_ids.update(unit.n for unit in hits)
        add(hits)

    ranked = rank_evidence_candidates(plan, by_id.values(), frozenset(lexical_ids))
    return [item.unit for item in ranked[:candidate_limit]]


def _is_safety_unit(unit: CorpusUnitCodes, plan: EvidenceQueryPlan) -> bool:
    plan_policies = set(plan.policies)
    return any(policy in plan_policies for policy in unit.policies)


def _select_final_units(
    plan: EvidenceQueryPlan,
    candidates: list[CorpusUnitCodes],
    limit: int,
) -> list[CorpusUnitCodes]:
    selected = list(candidates[:limit])
    if not selected or any(_is_safety_unit(unit, plan) for unit in selected):
        return selected

    safety = next(
        (unit for unit in candidates[limit:] if _is_safety_unit(unit, plan)),
        None,
    )
    if safety is not None:
        selected[-1] = safety
    return selected


def select_coach_evidence(
    request: CoachRequestV1,
    limit: int = 8,
    candidate_limit: int = 40,
    corpus_dir: Path = CORPUS_DIR,
) -> list[dict[str, Any]]:
    """Return frozen Coach evidence; corpus unavailability degrades to no evidence.

    Candidate search and ranking use machine codes only. Natural-language claims
    are loaded by ``coach_evidence_items`` only after final research-unit ids are
    selected. Unexpected schema/code errors remain strict rather than being
    hidden as availability failures.
    """
    if limit < 0:
        raise ValueError("limit must be >= 0")
    if limit > COACH_EVIDENCE_MAX:
        raise ValueError(f"limit must be <= {COACH_EVIDENCE_MAX}")
    if limit == 0:
        return []

    plan = build_evidence_query_plan(request)
    try:
        candidates = retrieve_candidate_units(plan, candidate_limit, corpus_dir)
        selected = _select_final_units(plan, candidates, limit)
        unit_nos = [unit.n for unit in selected]
        items = coach_evidence_items(unit_nos, corpus_dir)
    except (CorpusError, OSError, sqlite3.Error):
        return []

    return [
        CoachEvidenceItemV1.model_validate(item).model_dump(mode="json")
        for item in items
    ]
