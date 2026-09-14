"""Deterministic B2-B.2 evaluation for the structured evidence retriever.

The benchmark never asks an LLM to judge the corpus. Forty fixed scenarios cover
each frozen Coach metric across five action/capture variants. Relevance is
measured against the immutable Knowledge Machine codes, while the final evidence
is still validated against the frozen CoachEvidenceItemV1 contract.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Literal

from formpath_coach.retrieval import (
    EvidenceQueryPlan,
    build_evidence_query_plan,
    retrieve_candidate_units,
    select_coach_evidence,
)
from formpath_coach.schemas import CoachEvidenceItemV1, CoachRequestV1

EVAL_TOP_K = 8
EVAL_CANDIDATE_LIMIT = 40
MIN_RELEVANCE_HIT_RATE = 0.90

_SAFETY_POLICIES = frozenset(
    {
        "DO_NOT_OVERINFER",
        "DO_NOT_INFER_UNOBSERVABLE",
        "REQUIRE_CONTEXT",
        "CONFIDENCE_GATE",
        "HYPOTHESIS_ONLY",
        "USE_PERSONAL_BASELINE",
    }
)

MetricName = Literal[
    "release_elbow_angle_deg",
    "release_wrist_height_sb",
    "release_elbow_lateral_offset_sb",
    "release_shoulder_line_yaw_deg",
    "deepest_dip_knee_angle_deg",
    "follow_through_elbow_angle_deg",
    "follow_through_wrist_over_head_sb",
    "capture_quality",
]
ActionName = Literal["set_shot", "jump_shot", "free_throw", "unknown"]


@dataclass(frozen=True)
class _MetricExpectation:
    metric: MetricName
    domains: tuple[str, ...]
    metrics: tuple[str, ...]
    relevance_domains: tuple[str, ...]


_METRIC_EXPECTATIONS = (
    _MetricExpectation(
        "release_elbow_angle_deg",
        ("SHOOTING", "BIOMECHANICS"),
        ("JOINT_ANGLE",),
        ("BIOMECHANICS",),
    ),
    _MetricExpectation(
        "release_wrist_height_sb",
        ("SHOOTING", "RELEASE_BALLISTICS"),
        ("RELEASE_HEIGHT",),
        ("RELEASE_BALLISTICS",),
    ),
    _MetricExpectation(
        "release_elbow_lateral_offset_sb",
        ("SHOOTING", "BIOMECHANICS"),
        (),
        ("BIOMECHANICS",),
    ),
    _MetricExpectation(
        "release_shoulder_line_yaw_deg",
        ("SHOOTING", "BIOMECHANICS"),
        ("JOINT_ANGLE",),
        ("BIOMECHANICS",),
    ),
    _MetricExpectation(
        "deepest_dip_knee_angle_deg",
        ("SHOOTING", "BIOMECHANICS"),
        ("JOINT_ANGLE",),
        ("BIOMECHANICS",),
    ),
    _MetricExpectation(
        "follow_through_elbow_angle_deg",
        ("SHOOTING", "BIOMECHANICS"),
        ("JOINT_ANGLE",),
        ("BIOMECHANICS",),
    ),
    _MetricExpectation(
        "follow_through_wrist_over_head_sb",
        ("SHOOTING", "BIOMECHANICS"),
        (),
        ("BIOMECHANICS",),
    ),
    _MetricExpectation(
        "capture_quality",
        ("POSE_VALIDATION",),
        ("POSE_ERROR",),
        ("POSE_VALIDATION",),
    ),
)

# Five deliberately different contexts per metric. The last row is the negative
# capture-quality variant and must bias the plan toward POSE_VALIDATION.
_VARIANTS: tuple[tuple[str, ActionName, bool], ...] = (
    ("jump", "jump_shot", True),
    ("set", "set_shot", True),
    ("free", "free_throw", True),
    ("unknown", "unknown", True),
    ("failed_capture", "jump_shot", False),
)


def _ordered_unique(values: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(values))


@dataclass(frozen=True)
class RetrievalEvalCase:
    case_id: str
    metric: MetricName
    action: ActionName
    quality_passed: bool
    expected_domains: tuple[str, ...]
    expected_metrics: tuple[str, ...]
    relevance_domains: tuple[str, ...]


@dataclass(frozen=True)
class RetrievalCaseResult:
    case_id: str
    metric: str
    action: str
    quality_passed: bool
    plan_domains: tuple[str, ...]
    plan_metrics: tuple[str, ...]
    selected_unit_ids: tuple[int, ...]
    evidence: tuple[dict[str, Any], ...]
    plan_aligned: bool
    relevance_hit: bool
    safety_opportunity: bool
    safety_preserved: bool
    deterministic: bool
    bounded: bool
    contract_valid: bool
    linked_selected: int
    row_only_selected: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "case_id": self.case_id,
            "metric": self.metric,
            "action": self.action,
            "quality_passed": self.quality_passed,
            "plan_domains": list(self.plan_domains),
            "plan_metrics": list(self.plan_metrics),
            "selected_unit_ids": list(self.selected_unit_ids),
            "selected_tiers": [item["evidence_tier"] for item in self.evidence],
            "linked_selected": self.linked_selected,
            "row_only_selected": self.row_only_selected,
            "plan_aligned": self.plan_aligned,
            "relevance_hit": self.relevance_hit,
            "safety_opportunity": self.safety_opportunity,
            "safety_preserved": self.safety_preserved,
            "deterministic": self.deterministic,
            "bounded": self.bounded,
            "contract_valid": self.contract_valid,
        }


@dataclass(frozen=True)
class RetrievalEvalReport:
    case_count: int
    plan_alignment_rate: float
    relevance_hit_rate: float
    safety_preservation_rate: float
    determinism_rate: float
    bounded_rate: float
    contract_valid_rate: float
    linked_selection_count: int
    row_only_selection_count: int
    acceptance_passed: bool
    acceptance_failures: tuple[str, ...]
    cases: tuple[RetrievalCaseResult, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "benchmark": "B2-B.2 structured retrieval evaluation",
            "case_count": self.case_count,
            "top_k": EVAL_TOP_K,
            "candidate_limit": EVAL_CANDIDATE_LIMIT,
            "plan_alignment_rate": self.plan_alignment_rate,
            "relevance_hit_rate": self.relevance_hit_rate,
            "safety_preservation_rate": self.safety_preservation_rate,
            "determinism_rate": self.determinism_rate,
            "bounded_rate": self.bounded_rate,
            "contract_valid_rate": self.contract_valid_rate,
            "linked_selection_count": self.linked_selection_count,
            "row_only_selection_count": self.row_only_selection_count,
            "acceptance_passed": self.acceptance_passed,
            "acceptance_failures": list(self.acceptance_failures),
            "cases": [case.to_dict() for case in self.cases],
        }


def _build_cases() -> tuple[RetrievalEvalCase, ...]:
    cases: list[RetrievalEvalCase] = []
    for expectation in _METRIC_EXPECTATIONS:
        for variant_name, action, quality_passed in _VARIANTS:
            domains = expectation.domains
            if action != "unknown":
                domains = (*domains, "SHOOTING")
            if not quality_passed:
                domains = (*domains, "POSE_VALIDATION")
            cases.append(
                RetrievalEvalCase(
                    case_id=f"{expectation.metric}:{variant_name}",
                    metric=expectation.metric,
                    action=action,
                    quality_passed=quality_passed,
                    expected_domains=_ordered_unique(domains),
                    expected_metrics=expectation.metrics,
                    relevance_domains=expectation.relevance_domains,
                )
            )
    return tuple(cases)


EVAL_CASES = _build_cases()


def _request_for_case(case: RetrievalEvalCase) -> CoachRequestV1:
    index = EVAL_CASES.index(case) + 1
    is_quality = case.metric == "capture_quality"
    if is_quality:
        unit = "label"
        value: float | str = "good" if case.quality_passed else "degraded"
        phase_anchor = None
        joints: list[str] = []
    else:
        unit = "shoulder_breadths" if case.metric.endswith("_sb") else "deg"
        value = 1.0 if unit == "shoulder_breadths" else 90.0
        phase_anchor = "releaseProxy"
        joints = ["rightElbow"]

    return CoachRequestV1.model_validate(
        {
            "schema_version": 1,
            "request_id": f"req_eval{index:04d}",
            "locale": "ko",
            "player": {
                "handedness": "right",
                "skill_level": "advanced",
                "training_goal": "consistency",
            },
            "context": {
                "action": case.action,
                "capture_protocol": "basic_1_plus_1",
                "quality_passed": case.quality_passed,
                "quality_reasons": [] if case.quality_passed else ["capture_quality_failed"],
            },
            "observations": [
                {
                    "id": f"obs_eval_{index:03d}",
                    "metric": case.metric,
                    "unit": unit,
                    "value": value,
                    "reference": None,
                    "measurement_confidence": "high" if case.quality_passed else "low",
                    "source": "representative_phase_fused_4d",
                    "boundary": "representative_phase_fused_4d_estimate_not_actual_3d",
                    "phase_anchor": phase_anchor,
                    "joints": joints,
                    "caveats": [],
                }
            ],
            "evidence": [],
            "recent_history": [],
        }
    )


def _plan_aligned(case: RetrievalEvalCase, plan: EvidenceQueryPlan) -> bool:
    return set(case.expected_domains) <= set(plan.domains) and set(case.expected_metrics) <= set(
        plan.metrics
    )


def _selected_relevant(case: RetrievalEvalCase, selected_units: list[Any]) -> bool:
    if case.expected_metrics:
        expected = set(case.expected_metrics)
        return any(expected.intersection(unit.metrics) for unit in selected_units)
    expected_domains = set(case.relevance_domains)
    return any(expected_domains.intersection(unit.domains) for unit in selected_units)


def evaluate_case(case: RetrievalEvalCase) -> RetrievalCaseResult:
    request = _request_for_case(case)
    plan = build_evidence_query_plan(request)
    candidates = retrieve_candidate_units(plan, candidate_limit=EVAL_CANDIDATE_LIMIT)

    first = select_coach_evidence(
        request,
        limit=EVAL_TOP_K,
        candidate_limit=EVAL_CANDIDATE_LIMIT,
    )
    second = select_coach_evidence(
        request,
        limit=EVAL_TOP_K,
        candidate_limit=EVAL_CANDIDATE_LIMIT,
    )
    first_ids = tuple(item["research_unit_id"] for item in first)
    second_ids = tuple(item["research_unit_id"] for item in second)

    by_id = {unit.n: unit for unit in candidates}
    selected_units = [by_id[unit_id] for unit_id in first_ids if unit_id in by_id]
    safety_opportunity = any(
        _SAFETY_POLICIES.intersection(unit.policies) for unit in candidates
    )
    safety_preserved = (not safety_opportunity) or any(
        _SAFETY_POLICIES.intersection(unit.policies) for unit in selected_units
    )

    contract_valid = True
    try:
        for item in first:
            CoachEvidenceItemV1.model_validate(item)
    except ValueError:
        contract_valid = False

    bounded = len(first_ids) <= EVAL_TOP_K and len(first_ids) == len(set(first_ids))
    linked_selected = sum(1 for unit in selected_units if unit.provenance == "LINKED")
    row_only_selected = sum(1 for unit in selected_units if unit.provenance == "ROW_ONLY")

    return RetrievalCaseResult(
        case_id=case.case_id,
        metric=case.metric,
        action=case.action,
        quality_passed=case.quality_passed,
        plan_domains=plan.domains,
        plan_metrics=plan.metrics,
        selected_unit_ids=first_ids,
        evidence=tuple(first),
        plan_aligned=_plan_aligned(case, plan),
        relevance_hit=_selected_relevant(case, selected_units),
        safety_opportunity=safety_opportunity,
        safety_preserved=safety_preserved,
        deterministic=first_ids == second_ids,
        bounded=bounded,
        contract_valid=contract_valid,
        linked_selected=linked_selected,
        row_only_selected=row_only_selected,
    )


def _rate(values: list[bool]) -> float:
    return sum(values) / len(values) if values else 1.0


def run_retrieval_evaluation() -> RetrievalEvalReport:
    results = tuple(evaluate_case(case) for case in EVAL_CASES)
    safety_cases = [result for result in results if result.safety_opportunity]

    plan_alignment_rate = _rate([result.plan_aligned for result in results])
    relevance_hit_rate = _rate([result.relevance_hit for result in results])
    safety_preservation_rate = _rate([result.safety_preserved for result in safety_cases])
    determinism_rate = _rate([result.deterministic for result in results])
    bounded_rate = _rate([result.bounded for result in results])
    contract_valid_rate = _rate([result.contract_valid for result in results])

    failures: list[str] = []
    if plan_alignment_rate != 1.0:
        failures.append("plan_alignment_rate_below_1.0")
    if relevance_hit_rate < MIN_RELEVANCE_HIT_RATE:
        failures.append(f"relevance_hit_rate_below_{MIN_RELEVANCE_HIT_RATE:.2f}")
    if safety_preservation_rate != 1.0:
        failures.append("safety_preservation_rate_below_1.0")
    if determinism_rate != 1.0:
        failures.append("determinism_rate_below_1.0")
    if bounded_rate != 1.0:
        failures.append("bounded_rate_below_1.0")
    if contract_valid_rate != 1.0:
        failures.append("contract_valid_rate_below_1.0")

    return RetrievalEvalReport(
        case_count=len(results),
        plan_alignment_rate=plan_alignment_rate,
        relevance_hit_rate=relevance_hit_rate,
        safety_preservation_rate=safety_preservation_rate,
        determinism_rate=determinism_rate,
        bounded_rate=bounded_rate,
        contract_valid_rate=contract_valid_rate,
        linked_selection_count=sum(result.linked_selected for result in results),
        row_only_selection_count=sum(result.row_only_selected for result in results),
        acceptance_passed=not failures,
        acceptance_failures=tuple(failures),
        cases=results,
    )


def main() -> None:
    print(json.dumps(run_retrieval_evaluation().to_dict(), ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
