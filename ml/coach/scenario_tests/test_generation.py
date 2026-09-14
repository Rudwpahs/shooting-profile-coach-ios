import copy
from collections import Counter

import pytest

from formpath_coach.schemas import (
    COACH_METRICS_V1,
    CoachRequestV1,
    CoachResponseV1,
    validate_response_for_request,
)


@pytest.fixture(scope="module")
def seed():
    from formpath_coach.scenarios.build import generate

    return generate()


def test_grouped_sources_and_canonical_claims():
    from formpath_coach.scenarios.splits import partition_records

    rows = [
        {"n": 1, "source_ids": ["s1"], "payload": {"claim": "A"}},
        {"n": 2, "source_ids": ["s1"], "payload": {"claim": "B"}},
        {"n": 3, "source_ids": [], "payload": {"claim": " b  "}},
    ]
    result = partition_records(rows)
    assert len(set(result.values())) == 1
    assert result == partition_records(list(reversed(rows)))
    with pytest.raises(ValueError, match="empty"):
        partition_records([])


def test_seed_deterministic_and_schema_valid(seed):
    from formpath_coach.scenarios.build import generate

    assert seed == generate()
    assert len(seed) == 560
    assert len({s["scenario_id"] for s in seed}) == len(seed)
    assert {s["metric"] for s in seed} == set(COACH_METRICS_V1)
    assert Counter(s["split"] for s in seed) == {"train": 400, "dev": 80, "held-out": 80}
    for scenario in seed:
        req = CoachRequestV1.model_validate(scenario["request"])
        resp = CoachResponseV1.model_validate(scenario["response"])
        assert not validate_response_for_request(req, resp)
        assert set(resp.evidence_used) <= {e.research_unit_id for e in req.evidence}
        assert resp.confidence in ("very_low", "low", "medium")
        if not req.context.quality_passed:
            assert resp.confidence in ("very_low", "low")
            assert not resp.drills
        if scenario["variant"] == "conflict_reported":
            assert resp.confidence in ("very_low", "low")
            assert "preserve_contradiction" in resp.do_not_infer


def test_no_leakage_and_detector_rejects_injected_leak(seed):
    from formpath_coach.scenarios.splits import leakage_audit

    report = leakage_audit(seed)
    assert report["passed"], report
    assert all(
        not p["unit_ids"] and not p["source_ids"] and not p["exact_pairs"] and not p["families"]
        for p in report["pairs"].values()
    )
    assert report["shared_behavior_templates"]  # Not unseen-template generalization.
    dirty = copy.deepcopy(seed)
    first = next(s for s in dirty if s["split"] == "train" and s["request"]["evidence"])
    leaked = copy.deepcopy(first)
    leaked["split"] = "held-out"
    dirty.append(leaked)
    assert not leakage_audit(dirty)["passed"]


def test_no_fabricated_sources_or_conflicts(seed):
    from formpath_coach.corpus_mapping import coach_evidence_items

    ids = sorted({e["research_unit_id"] for s in seed for e in s["request"]["evidence"]})
    original = {e["research_unit_id"]: e for e in coach_evidence_items(ids)}
    for s in seed:
        for e in s["request"]["evidence"]:
            assert e == original[e["research_unit_id"]]
        assert s["evaluation_metadata"]["synthetic_measurements"] is True
        if s["variant"] == "joint_unavailable":
            assert s["request"]["observations"][0]["metric"] == "capture_quality"
        if s["variant"] == "no_evidence":
            assert not s["request"]["evidence"]


def test_independent_claim_leakage_detection(seed):
    from formpath_coach.scenarios.splits import leakage_audit

    dirty = copy.deepcopy(seed)
    train = next(s for s in dirty if s["split"] == "train" and s["request"]["evidence"])
    held = next(s for s in dirty if s["split"] == "held-out" and s["request"]["evidence"])
    held["request"]["evidence"][0]["claim"] = train["request"]["evidence"][0]["claim"]
    assert not leakage_audit(dirty)["passed"]
