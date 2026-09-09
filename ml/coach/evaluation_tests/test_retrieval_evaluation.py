"""B2-B.2 deterministic retrieval evaluation against the real vendored corpus."""

from __future__ import annotations

import json
from collections import Counter

from formpath_coach.schemas import CoachEvidenceItemV1


FROZEN_METRICS = {
    "release_elbow_angle_deg",
    "release_wrist_height_sb",
    "release_elbow_lateral_offset_sb",
    "release_shoulder_line_yaw_deg",
    "deepest_dip_knee_angle_deg",
    "follow_through_elbow_angle_deg",
    "follow_through_wrist_over_head_sb",
    "capture_quality",
}


def test_eval_suite_is_fixed_and_covers_every_frozen_metric_five_times():
    from formpath_coach.retrieval_eval import EVAL_CASES

    assert len(EVAL_CASES) == 40
    assert len({case.case_id for case in EVAL_CASES}) == 40
    counts = Counter(case.metric for case in EVAL_CASES)
    assert set(counts) == FROZEN_METRICS
    assert set(counts.values()) == {5}


def test_real_corpus_report_meets_the_b2b2_acceptance_gate():
    from formpath_coach.retrieval_eval import run_retrieval_evaluation

    report = run_retrieval_evaluation()

    assert report.case_count == 40
    assert report.plan_alignment_rate == 1.0
    assert report.determinism_rate == 1.0
    assert report.bounded_rate == 1.0
    assert report.contract_valid_rate == 1.0
    assert report.relevance_hit_rate >= 0.90
    assert report.safety_preservation_rate == 1.0
    assert report.acceptance_passed is True
    assert report.acceptance_failures == ()


def test_selected_evidence_is_unique_bounded_and_frozen_contract_valid():
    from formpath_coach.retrieval_eval import EVAL_CASES, evaluate_case

    for case in EVAL_CASES:
        result = evaluate_case(case)
        ids = [item["research_unit_id"] for item in result.evidence]
        assert len(ids) == len(set(ids))
        assert len(ids) <= 8
        for item in result.evidence:
            CoachEvidenceItemV1.model_validate(item)


def test_evaluation_is_repeatable_and_json_serializable():
    from formpath_coach.retrieval_eval import run_retrieval_evaluation

    first = run_retrieval_evaluation().to_dict()
    second = run_retrieval_evaluation().to_dict()

    assert first == second
    encoded = json.dumps(first, ensure_ascii=False, sort_keys=True)
    decoded = json.loads(encoded)
    assert decoded["case_count"] == 40
    assert len(decoded["cases"]) == 40


def test_failed_quality_variants_preserve_pose_validation_intent():
    from formpath_coach.retrieval_eval import EVAL_CASES, evaluate_case

    failed_quality = [case for case in EVAL_CASES if not case.quality_passed]
    assert len(failed_quality) == 8
    for case in failed_quality:
        result = evaluate_case(case)
        assert "POSE_VALIDATION" in result.plan_domains
        assert result.safety_preserved is True
