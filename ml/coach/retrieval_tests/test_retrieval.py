"""B2-B.1 deterministic structured retrieval tests."""

from __future__ import annotations

import pytest

from formpath_coach.corpus import CorpusUnitCodes
from formpath_coach.schemas import CoachEvidenceItemV1, CoachRequestV1


def request_with_metrics(*metrics: str, quality_passed: bool = True) -> CoachRequestV1:
    observations = []
    for index, metric in enumerate(metrics):
        is_quality = metric == "capture_quality"
        observations.append(
            {
                "id": f"obs_test_{index}",
                "metric": metric,
                "value": "good" if is_quality else 90.0,
                "unit": "label" if is_quality else ("shoulder_breadths" if metric.endswith("_sb") else "deg"),
                "reference": None,
                "measurement_confidence": "high",
                "source": "representative_phase_fused_4d",
                "boundary": "representative_phase_fused_4d_estimate_not_actual_3d",
                "phase_anchor": None if is_quality else "releaseProxy",
                "joints": [] if is_quality else ["rightElbow"],
                "caveats": [],
            }
        )
    return CoachRequestV1.model_validate(
        {
            "schema_version": 1,
            "request_id": "req_test1234",
            "locale": "ko",
            "player": {"handedness": "right", "skill_level": "advanced", "training_goal": "consistency"},
            "context": {
                "action": "jump_shot",
                "capture_protocol": "basic_1_plus_1",
                "quality_passed": quality_passed,
                "quality_reasons": [],
            },
            "observations": observations,
            "evidence": [],
            "recent_history": [],
        }
    )


def synthetic_unit(
    n: int,
    *,
    provenance: str = "ROW_ONLY",
    domains: tuple[str, ...] = ("SHOOTING",),
    metrics: tuple[str, ...] = (),
    policies: tuple[str, ...] = (),
    evidence: str = "B",
) -> CorpusUnitCodes:
    return CorpusUnitCodes(
        n=n,
        id=f"RU-{n:04d}",
        effect="ASSOCIATION",
        evidence=evidence,
        provenance=provenance,
        domains=domains,
        metrics=metrics,
        policies=policies,
        sources=("SRC-TEST",) if provenance == "LINKED" else (),
    )


def test_query_plan_maps_frozen_metrics_to_machine_codes():
    try:
        from formpath_coach.retrieval import build_evidence_query_plan
    except ImportError:
        pytest.fail("B2-B.1 retrieval module is not implemented yet")

    plan = build_evidence_query_plan(
        request_with_metrics("release_elbow_angle_deg", "capture_quality")
    )

    assert {"SHOOTING", "BIOMECHANICS", "POSE_VALIDATION"} <= set(plan.domains)
    assert {"JOINT_ANGLE", "POSE_ERROR"} <= set(plan.metrics)
    assert "DO_NOT_OVERINFER" in plan.policies
    assert "CONFIDENCE_GATE" in plan.policies


def test_rank_prefers_exact_metric_then_linked_provenance_and_is_deterministic():
    from formpath_coach.retrieval import (
        build_evidence_query_plan,
        rank_evidence_candidates,
    )

    plan = build_evidence_query_plan(request_with_metrics("release_elbow_angle_deg"))
    domain_only_linked = synthetic_unit(901, provenance="LINKED", domains=("SHOOTING",))
    exact_row = synthetic_unit(902, metrics=("JOINT_ANGLE",), domains=("SHOOTING",))
    exact_linked = synthetic_unit(
        903,
        provenance="LINKED",
        metrics=("JOINT_ANGLE",),
        domains=("SHOOTING",),
    )
    candidates = [domain_only_linked, exact_row, exact_linked]

    first = rank_evidence_candidates(plan, candidates)
    second = rank_evidence_candidates(plan, list(reversed(candidates)))

    assert [item.unit.n for item in first] == [903, 902, 901]
    assert [item.unit.n for item in second] == [903, 902, 901]
    assert first[0].metric_matches == ("JOINT_ANGLE",)
    assert first[0].score > first[1].score > first[2].score


def test_candidate_retrieval_is_bounded_machine_code_only_and_relevant():
    from formpath_coach.retrieval import (
        build_evidence_query_plan,
        retrieve_candidate_units,
    )

    plan = build_evidence_query_plan(request_with_metrics("capture_quality"))
    first = retrieve_candidate_units(plan, candidate_limit=30)
    second = retrieve_candidate_units(plan, candidate_limit=30)

    assert 0 < len(first) <= 30
    assert [unit.n for unit in first] == [unit.n for unit in second]
    assert len({unit.n for unit in first}) == len(first)
    assert all(isinstance(unit, CorpusUnitCodes) for unit in first)
    assert all(not hasattr(unit, "claim") for unit in first)
    assert any("POSE_ERROR" in unit.metrics for unit in first[:10])
    assert any("POSE_VALIDATION" in unit.domains for unit in first[:10])


def test_candidate_limit_is_strict():
    from formpath_coach.retrieval import build_evidence_query_plan, retrieve_candidate_units

    plan = build_evidence_query_plan(request_with_metrics("release_elbow_angle_deg"))
    with pytest.raises(ValueError, match="candidate_limit"):
        retrieve_candidate_units(plan, candidate_limit=0)
    assert len(retrieve_candidate_units(plan, candidate_limit=7)) <= 7


def test_final_selection_is_deterministic_bounded_and_contract_valid():
    from formpath_coach.retrieval import select_coach_evidence

    request = request_with_metrics("release_elbow_angle_deg")
    first = select_coach_evidence(request, limit=8, candidate_limit=40)
    second = select_coach_evidence(request, limit=8, candidate_limit=40)

    assert 0 < len(first) <= 8
    assert [item["research_unit_id"] for item in first] == [
        item["research_unit_id"] for item in second
    ]
    assert len({item["research_unit_id"] for item in first}) == len(first)
    for item in first:
        CoachEvidenceItemV1.model_validate(item)


def test_selection_loads_text_only_for_final_ids(monkeypatch: pytest.MonkeyPatch):
    import formpath_coach.retrieval as retrieval

    candidates = [
        synthetic_unit(903, provenance="LINKED", metrics=("JOINT_ANGLE",)),
        synthetic_unit(902, metrics=("JOINT_ANGLE",)),
        synthetic_unit(901),
    ]
    loaded: list[int] = []

    monkeypatch.setattr(retrieval, "retrieve_candidate_units", lambda *args, **kwargs: candidates)

    def fake_convert(unit_nos, corpus_dir):
        loaded.extend(unit_nos)
        return [
            {
                "research_unit_id": n,
                "claim": f"claim {n}",
                "evidence_tier": "B",
                "source_title": None,
                "supported_inferences": [],
                "forbidden_inferences": [],
                "limitations": [],
                "contradiction_group": None,
            }
            for n in unit_nos
        ]

    monkeypatch.setattr(retrieval, "coach_evidence_items", fake_convert)
    items = retrieval.select_coach_evidence(
        request_with_metrics("release_elbow_angle_deg"), limit=2, candidate_limit=3
    )

    assert loaded == [903, 902]
    assert [item["research_unit_id"] for item in items] == loaded


def test_selection_preserves_a_safety_unit_when_candidates_have_one(
    monkeypatch: pytest.MonkeyPatch,
):
    import formpath_coach.retrieval as retrieval

    candidates = [
        synthetic_unit(903, provenance="LINKED", metrics=("JOINT_ANGLE",)),
        synthetic_unit(902, metrics=("JOINT_ANGLE",)),
        synthetic_unit(901, policies=("DO_NOT_OVERINFER",), evidence="C"),
    ]
    loaded: list[int] = []
    monkeypatch.setattr(retrieval, "retrieve_candidate_units", lambda *args, **kwargs: candidates)

    def fake_convert(unit_nos, corpus_dir):
        loaded.extend(unit_nos)
        return [
            {
                "research_unit_id": n,
                "claim": f"claim {n}",
                "evidence_tier": "C",
                "source_title": None,
                "supported_inferences": [],
                "forbidden_inferences": ["DO_NOT_OVERINFER"] if n == 901 else [],
                "limitations": [],
                "contradiction_group": None,
            }
            for n in unit_nos
        ]

    monkeypatch.setattr(retrieval, "coach_evidence_items", fake_convert)
    retrieval.select_coach_evidence(
        request_with_metrics("release_elbow_angle_deg"), limit=2, candidate_limit=3
    )

    assert loaded == [903, 901]


def test_selection_fails_open_to_empty_evidence_when_corpus_is_unavailable(tmp_path):
    from formpath_coach.retrieval import select_coach_evidence

    missing = tmp_path / "no-corpus-here"
    assert select_coach_evidence(
        request_with_metrics("release_elbow_angle_deg"), corpus_dir=missing
    ) == []


def test_final_limit_respects_frozen_contract_maximum():
    from formpath_coach.retrieval import select_coach_evidence

    request = request_with_metrics("release_elbow_angle_deg")
    assert select_coach_evidence(request, limit=0) == []
    with pytest.raises(ValueError, match="limit"):
        select_coach_evidence(request, limit=-1)
    with pytest.raises(ValueError, match="16"):
        select_coach_evidence(request, limit=17)
