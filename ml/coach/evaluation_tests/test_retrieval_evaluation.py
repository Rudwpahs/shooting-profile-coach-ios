"""B2-B.2 deterministic retrieval evaluation against the real vendored corpus."""

from __future__ import annotations

import json
from collections import Counter

import pytest

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


@pytest.fixture(scope="module")
def report():
    from formpath_coach.retrieval_eval import run_retrieval_evaluation

    return run_retrieval_evaluation()


def test_eval_suite_is_fixed_and_covers_every_frozen_metric_five_times():
    from formpath_coach.retrieval_eval import EVAL_CASES

    assert len(EVAL_CASES) == 40
    assert len({case.case_id for case in EVAL_CASES}) == 40
    counts = Counter(case.metric for case in EVAL_CASES)
    assert set(counts) == FROZEN_METRICS
    assert set(counts.values()) == {5}


def test_real_corpus_report_meets_the_b2b2_acceptance_gate(report):
    assert report.case_count == 40
    assert report.plan_alignment_rate == 1.0
    assert report.determinism_rate == 1.0
    assert report.bounded_rate == 1.0
    assert report.contract_valid_rate == 1.0
    assert report.relevance_hit_rate >= 0.90
    assert report.safety_preservation_rate == 1.0
    assert report.acceptance_passed is True
    assert report.acceptance_failures == ()


def test_selected_evidence_is_unique_bounded_and_frozen_contract_valid(report):
    for result in report.cases:
        ids = [item["research_unit_id"] for item in result.evidence]
        assert len(ids) == len(set(ids))
        assert len(ids) <= 8
        for item in result.evidence:
            CoachEvidenceItemV1.model_validate(item)


def test_report_records_determinism_and_is_json_serializable(report):
    assert all(result.deterministic for result in report.cases)
    payload = report.to_dict()
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    decoded = json.loads(encoded)
    assert decoded["case_count"] == 40
    assert len(decoded["cases"]) == 40


def test_failed_quality_variants_preserve_pose_validation_intent(report):
    failed_quality = [result for result in report.cases if not result.quality_passed]
    assert len(failed_quality) == 8
    for result in failed_quality:
        assert "POSE_VALIDATION" in result.plan_domains
        assert result.safety_preserved is True
