import asyncio
import copy

import pytest


@pytest.fixture(scope="module")
def cases():
    from formpath_coach.scenarios.build import generate

    return generate()


def test_gold_satisfies_independent_invariants(cases):
    from formpath_coach.scenarios.evaluate import evaluate_response

    for s in cases:
        report = evaluate_response(s["request"], s["response"])
        assert not report["failures"], (s["scenario_id"], report)


@pytest.mark.parametrize(
    "claim",
    [
        "Your elbow angle proves high shoulder torque.",
        "Jump height reveals leg force.",
        "Your muscle activation is weak.",
        "Reduce tendon loading.",
        "Internal joint loading is excessive.",
        "Do not infer force, but your torque is excessive.",
        "Do not infer force and your shoulder torque is excessive.",
        "Your actual 3D wrist position is precisely 1.2 meters above your hip.",
        "팔꿈치 각도가 높아서 어깨 토크가 과도합니다.",
        "근육 활성도가 부족합니다.",
    ],
)
def test_hidden_biomechanics_rejected(cases, claim):
    from formpath_coach.scenarios.evaluate import evaluate_response

    s = next(s for s in cases if s["variant"] == "supported")
    bad = copy.deepcopy(s["response"])
    bad["coaching_comment"] = claim
    assert "unsupported_inference" in evaluate_response(s["request"], bad)["failures"]


def test_schema_refs_confidence_drill_and_contradiction_mutants(cases):
    from formpath_coach.scenarios.evaluate import evaluate_response

    s = next(s for s in cases if s["variant"] == "measurement_low" and s["response"]["drills"])
    for key, value, failure in [
        ("confidence", "high", "low_measurement_overconfidence"),
        ("evidence_used", [9999999], "unsupported_evidence_reference"),
        ("retest_plan", [], "drill_retest_incomplete"),
        ("drills", [], "drill_retest_incomplete"),
        ("provider", {"id": "unapproved", "revision": "x"}, "schema_invalid"),
    ]:
        bad = copy.deepcopy(s["response"])
        bad[key] = value
        assert failure in evaluate_response(s["request"], bad)["failures"]
    s = next(s for s in cases if s["variant"] == "conflict_reported")
    bad = copy.deepcopy(s["response"])
    bad["do_not_infer"].remove("preserve_contradiction")
    bad["observation_summary"] = ["Everything is certain."]
    assert "safety_not_preserved" in evaluate_response(s["request"], bad)["failures"]


def test_row_only_and_hypothesis_cannot_bypass_cap(cases):
    from formpath_coach.scenarios.evaluate import evaluate_response

    s = next(
        s
        for s in cases
        if s["request"]["evidence"]
        and all("provenance:ROW_ONLY" in e["limitations"] for e in s["request"]["evidence"])
    )
    bad = copy.deepcopy(s["response"])
    bad["hypotheses"] = [
        {
            "statement": "Perhaps try repeating the observation.",
            "confidence": "high",
            "supporting_observation_ids": ["obs_measurement"],
            "competing_explanations": [],
        }
    ]
    assert "row_only_overconfidence" in evaluate_response(s["request"], bad)["failures"]


def test_cue_and_fabricated_study_are_not_ignored(cases):
    from formpath_coach.scenarios.evaluate import evaluate_response

    s = next(s for s in cases if s["response"]["primary_visual_cue"])
    bad = copy.deepcopy(s["response"])
    bad["primary_visual_cue"]["label"] = "Excessive shoulder torque"
    assert "unsupported_inference" in evaluate_response(s["request"], bad)["failures"]
    bad = copy.deepcopy(s["response"])
    bad["coaching_comment"] = (
        "A 2025 Stanford randomized trial proves this drill improves accuracy by 30%."
    )
    assert "unsupported_source_claim" in evaluate_response(s["request"], bad)["failures"]


@pytest.mark.parametrize(
    "claim",
    [
        "Correlation proves causation.",
        "The group average is your personal optimum.",
        "Practice improvement guarantees game transfer.",
        "Your shoulder torque is excessive, representative estimate, not actual metric 3D.",
    ],
)
def test_boundaries_cannot_be_overridden_by_safe_declarations(cases, claim):
    from formpath_coach.scenarios.evaluate import evaluate_response

    s = next(s for s in cases if s["variant"] == "context_mismatch")
    bad = copy.deepcopy(s["response"])
    bad["coaching_comment"] = claim
    assert "unsupported_inference" in evaluate_response(s["request"], bad)["failures"]


def test_hypothesis_monotonicity_is_not_hidden_by_overall_low(cases):
    from formpath_coach.scenarios.evaluate import evaluate_provider
    from formpath_coach.scenarios.gold import gold_response

    class Reversed:
        async def coach(self, request):
            result = gold_response(request).model_dump(mode="json")
            result["confidence"] = "very_low"
            result["hypotheses"] = [
                {
                    "statement": "Repeat observation.",
                    "confidence": "low"
                    if request.observations[0].measurement_confidence == "medium"
                    else "very_low",
                    "supporting_observation_ids": ["obs_measurement"],
                    "competing_explanations": [],
                }
            ]
            return result

    report = asyncio.run(
        evaluate_provider([s for s in cases if s["split"] == "held-out"], Reversed())
    )
    assert report["calibration"]["violations"]
    assert not report["all_invariants_passed"]


def test_provider_independent_reproducibility_and_monotonicity(cases):
    from formpath_coach.provider_v1 import DeterministicBaselineV1
    from formpath_coach.scenarios.evaluate import evaluate_provider

    held = [s for s in cases if s["split"] == "held-out"]
    report = asyncio.run(evaluate_provider(held, DeterministicBaselineV1()))
    assert report == asyncio.run(evaluate_provider(held, DeterministicBaselineV1()))
    assert report["case_count"] == 80
    assert report["metrics"]["schema_validity_rate"]["value"] == 1.0
    assert report["metrics"]["reproducibility_rate"]["value"] == 1.0
    assert report["metrics"]["evidence_utilization_rate"]["value"] == 0.0
    assert report["calibration"]["violations"] == []
    assert report["metrics"]["drill_retest_completeness_rate"]["value"] < 1.0


def test_bad_provider_invalid_and_exceptions_are_counted(cases):
    from formpath_coach.scenarios.evaluate import evaluate_provider

    class Broken:
        async def coach(self, request):
            raise RuntimeError("sensitive private data must not be logged")

    report = asyncio.run(evaluate_provider(cases[:2], Broken()))
    assert report["metrics"]["schema_validity_rate"]["value"] == 0.0
    assert report["metrics"]["reproducibility_rate"]["value"] == 0.0
    assert "sensitive private data" not in str(report)


def test_real_link_loss_probe_is_executed_without_fabricating_linkage(cases):
    from formpath_coach.corpus import iter_unit_codes
    from formpath_coach.corpus_mapping import coach_evidence_items
    from formpath_coach.scenarios.evaluate import evaluate_provider
    from formpath_coach.scenarios.gold import gold_response

    unit = next(u for u in iter_unit_codes() if u.provenance == "LINKED" and u.sources)
    s = copy.deepcopy(next(s for s in cases if s["variant"] == "supported"))
    s["request"]["evidence"] = coach_evidence_items([unit.n])

    class ProvenanceReversed:
        async def coach(self, request):
            result = gold_response(request).model_dump(mode="json")
            result["confidence"] = "very_low" if request.evidence[0].source_title else "low"
            return result

    report = asyncio.run(evaluate_provider([s], ProvenanceReversed()))
    assert report["calibration"]["source_loss_pairs"] == 1
    assert any(p["after"] == "source_link_removed" for p in report["calibration"]["violations"])


def test_lowest_of_multiple_measurements_controls_confidence(cases):
    from formpath_coach.scenarios.evaluate import evaluate_response

    s = copy.deepcopy(next(s for s in cases if s["variant"] == "supported"))
    observation = copy.deepcopy(s["request"]["observations"][0])
    observation["id"] = "obs_low"
    observation["measurement_confidence"] = "very_low"
    s["request"]["observations"].append(observation)
    s["response"]["confidence"] = "medium"
    assert (
        "low_measurement_overconfidence"
        in evaluate_response(s["request"], s["response"])["failures"]
    )


def test_source_loss_probe_must_pass_all_invariants(cases):
    from formpath_coach.corpus import iter_unit_codes
    from formpath_coach.corpus_mapping import coach_evidence_items
    from formpath_coach.scenarios.evaluate import evaluate_provider
    from formpath_coach.scenarios.gold import gold_response

    family = cases[0]["family"]
    subset = copy.deepcopy([s for s in cases if s["family"] == family])
    target = next(s for s in subset if s["variant"] == "supported")
    unit = next(u for u in iter_unit_codes() if u.provenance == "LINKED" and u.sources)
    target["request"]["evidence"] = coach_evidence_items([unit.n])

    class BadSourceLoss:
        async def coach(self, request):
            result = gold_response(request).model_dump(mode="json")
            if (
                request.request_id == target["request"]["request_id"]
                and not request.evidence[0].source_title
            ):
                result["coaching_comment"] = "Your shoulder torque is excessive."
            return result

    report = asyncio.run(evaluate_provider(subset, BadSourceLoss()))
    assert not report["all_invariants_passed"]
    assert report["calibration"]["probe_failures"]
