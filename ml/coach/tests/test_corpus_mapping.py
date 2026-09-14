"""B2-A.1: runtime compatibility between the immutable corpus and the frozen Coach contract."""

from __future__ import annotations

import hashlib
from typing import get_args

import pytest
from pydantic import ValidationError

from formpath_coach.corpus import (
    CORPUS_DIR,
    CorpusUnitCodes,
    controlled_vocabulary,
    corpus_manifest,
    iter_unit_codes,
    open_corpus,
)
from formpath_coach.corpus_mapping import (
    COACH_EVIDENCE_TIERS,
    CORPUS_CODE_STRENGTH,
    CORPUS_EVIDENCE_CODES,
    EVIDENCE_TIER_MAP,
    RUNTIME_FALLBACK_CODES,
    TIER_STRENGTH,
    assert_runtime_codes,
    cap_coach_confidence,
    coach_evidence_item_for_unit,
    coach_evidence_items,
    evidence_set_policy,
    is_runtime_code,
    map_evidence_tier,
    nominal_tier,
    provenance_policy,
    runtime_codes,
    to_coach_evidence_item,
)
from formpath_coach.schemas import CoachEvidenceItemV1, EvidenceTier

OWNER_TABLE = {
    "A+": "A", "A": "A", "A-": "A-", "B+": "B+", "B": "B", "B-": "C", "C+": "C",
    "C": "C", "C-": "D", "D+": "D", "D": "D", "D-": "H", "E": "H", "U": "H",
}


def unit(**overrides) -> CorpusUnitCodes:
    fields = {
        "n": 61, "id": "RU-0061", "effect": "INCREASE", "evidence": "B", "provenance": "ROW_ONLY",
        "domains": ("BIOMECHANICS", "SHOOTING"), "metrics": ("RELEASE_VELOCITY",),
        "policies": ("DO_NOT_OVERINFER",), "sources": (),
    }
    fields.update(overrides)
    return CorpusUnitCodes(**fields)


# --------------------------------------------------------------------------- artifact


def test_vendored_corpus_is_byte_exact_against_the_b2a_manifest():
    manifest = corpus_manifest()
    assert hashlib.sha256((CORPUS_DIR / "formpath_knowledge.sqlite").read_bytes()).hexdigest() == manifest["db_sha256"]
    assert hashlib.sha256((CORPUS_DIR / "units.machine.jsonl").read_bytes()).hexdigest() == manifest["jsonl_sha256"]
    assert manifest["db_sha256"] == "c1e17824b8359e4655ebc664f7df325d3371e4e0e703bcd9bcaf4a63c6f6b039"
    assert manifest["jsonl_sha256"] == "9fd0b467919e15321e4e2ff13343a46aab270e7980a36d7a0aeec49927b9592f"


# --------------------------------------------------------------------------- evidence tiers


def test_every_corpus_evidence_code_maps_to_exactly_one_frozen_tier():
    vocabulary_codes = set(controlled_vocabulary()["evidence_codes"])
    assert set(EVIDENCE_TIER_MAP) == vocabulary_codes == set(CORPUS_EVIDENCE_CODES)
    assert len(EVIDENCE_TIER_MAP) == 14
    assert dict(EVIDENCE_TIER_MAP) == OWNER_TABLE
    for code in vocabulary_codes:
        assert map_evidence_tier(code) == OWNER_TABLE[code]


def test_mapping_never_leaves_the_frozen_enum():
    frozen = set(get_args(EvidenceTier))
    assert frozen == {"A", "A-", "B+", "B", "C", "D", "H"} == set(COACH_EVIDENCE_TIERS)
    assert set(EVIDENCE_TIER_MAP.values()) <= frozen
    for code in CORPUS_EVIDENCE_CODES:
        CoachEvidenceItemV1.model_validate({
            "research_unit_id": 61, "claim": "x", "evidence_tier": map_evidence_tier(code), "source_title": None,
            "supported_inferences": [], "forbidden_inferences": [], "limitations": [], "contradiction_group": None,
        })


def test_mapping_is_a_conservative_downgrade_never_an_upgrade():
    for code in CORPUS_EVIDENCE_CODES:
        mapped = map_evidence_tier(code)
        assert TIER_STRENGTH[mapped] <= TIER_STRENGTH[nominal_tier(code)], code
    for code in ("B-", "C-", "D-", "E", "U"):
        assert TIER_STRENGTH[map_evidence_tier(code)] < TIER_STRENGTH[nominal_tier(code)] or nominal_tier(code) == "H", code
    assert map_evidence_tier("B-") == "C" and TIER_STRENGTH["C"] < TIER_STRENGTH["B"]
    assert map_evidence_tier("C-") == "D" and TIER_STRENGTH["D"] < TIER_STRENGTH["C"]
    assert map_evidence_tier("D-") == "H" and TIER_STRENGTH["H"] < TIER_STRENGTH["D"]
    assert map_evidence_tier("E") == "H" and map_evidence_tier("U") == "H"
    # Monotone: a weaker corpus code never maps to a stronger tier than a stronger corpus code.
    ordered = [TIER_STRENGTH[map_evidence_tier(code)] for code in sorted(CORPUS_EVIDENCE_CODES, key=lambda c: -CORPUS_CODE_STRENGTH[c])]
    assert ordered == sorted(ordered, reverse=True)


@pytest.mark.parametrize("code", ["Z", "b", "", "A++", "AA", " A", "H", "A-,"])
def test_unknown_evidence_codes_are_rejected(code: str):
    with pytest.raises(ValueError):
        map_evidence_tier(code)
    with pytest.raises(ValueError):
        nominal_tier(code)


# --------------------------------------------------------------------------- fallback sentinels


def test_the_three_fallback_sentinels_are_official_runtime_codes():
    assert RUNTIME_FALLBACK_CODES == {"domains": {"UNCLASSIFIED"}, "metrics": {"UNMAPPED_METRIC"}, "policies": {"GENERAL_GUIDANCE"}}
    vocabulary = controlled_vocabulary()
    assert "UNCLASSIFIED" not in vocabulary["domains"] and is_runtime_code("domains", "UNCLASSIFIED")
    assert "UNMAPPED_METRIC" not in vocabulary["metrics"] and is_runtime_code("metrics", "UNMAPPED_METRIC")
    assert "GENERAL_GUIDANCE" not in vocabulary["policies"] and is_runtime_code("policies", "GENERAL_GUIDANCE")
    assert runtime_codes("domains") == frozenset(vocabulary["domains"]) | {"UNCLASSIFIED"}
    assert_runtime_codes(unit(domains=("UNCLASSIFIED",), metrics=("UNMAPPED_METRIC",), policies=("GENERAL_GUIDANCE",)))


@pytest.mark.parametrize(("dimension", "code"), [("domains", "SPACE"), ("metrics", "FORCE_N"), ("policies", "TRUST_ME"), ("domains", "unclassified")])
def test_unknown_dimension_codes_are_strictly_rejected(dimension: str, code: str):
    assert not is_runtime_code(dimension, code)
    with pytest.raises(ValueError, match="unknown"):
        assert_runtime_codes(unit(**{dimension: (code,)}))


# --------------------------------------------------------------------------- provenance


def test_provenance_policies():
    linked = provenance_policy("LINKED")
    row_only = provenance_policy("ROW_ONLY")
    assert linked.retrieval_candidate and linked.evidence_candidate and linked.may_be_sole_prescription_evidence
    assert linked.max_coach_confidence == "very_high" and linked.source_title_allowed
    assert row_only.retrieval_candidate and row_only.evidence_candidate
    assert not row_only.may_be_sole_prescription_evidence
    assert row_only.max_coach_confidence == "medium" and not row_only.source_title_allowed
    with pytest.raises(ValueError):
        provenance_policy("SCRAPED")


def test_row_only_evidence_caps_coach_confidence_and_cannot_prescribe_alone():
    only_rows = evidence_set_policy(["ROW_ONLY", "ROW_ONLY"])
    assert only_rows.max_coach_confidence == "medium" and not only_rows.may_prescribe_from_sole_evidence
    assert only_rows.reasons == ("row_only_evidence_only",)
    assert cap_coach_confidence("very_high", only_rows) == "medium"
    assert cap_coach_confidence("high", only_rows) == "medium"
    assert cap_coach_confidence("medium", only_rows) == "medium"
    assert cap_coach_confidence("low", only_rows) == "low"
    mixed = evidence_set_policy(["ROW_ONLY", "LINKED"])
    assert mixed.max_coach_confidence == "very_high" and mixed.may_prescribe_from_sole_evidence and mixed.linked == 1
    assert cap_coach_confidence("high", mixed) == "high"
    none = evidence_set_policy([])
    assert none.max_coach_confidence == "medium" and none.reasons == ("no_evidence",)
    with pytest.raises(ValueError):
        cap_coach_confidence("certain", only_rows)


# --------------------------------------------------------------------------- conversion


def test_row_only_unit_converts_with_a_null_source_title_and_a_valid_frozen_document():
    item = to_coach_evidence_item(unit(), "Release velocity rises with movement speed.", source_titles=["A title that must be dropped"])
    CoachEvidenceItemV1.model_validate(item)
    assert item["research_unit_id"] == 61
    assert item["evidence_tier"] == "B"
    assert item["source_title"] is None
    assert item["supported_inferences"] == ["RELEASE_VELOCITY:INCREASE"]
    assert item["forbidden_inferences"] == ["DO_NOT_OVERINFER"]
    assert item["limitations"][:2] == ["provenance:ROW_ONLY", "evidence_code:B"]
    assert item["contradiction_group"] is None


def test_linked_unit_carries_its_source_title():
    linked = unit(n=961, id="RU-0961", provenance="LINKED", evidence="A-", sources=("S1",))
    item = to_coach_evidence_item(linked, "A linked claim.", source_titles=["", "  Peer-reviewed study  "])
    assert item["source_title"] == "Peer-reviewed study"
    assert item["evidence_tier"] == "A-"
    assert item["limitations"][0] == "provenance:LINKED"
    long_title = to_coach_evidence_item(linked, "A linked claim.", source_titles=["t" * 500])
    assert len(long_title["source_title"]) == 200


def test_conversion_is_strict_about_codes_claims_and_contract_limits():
    with pytest.raises(ValueError):
        to_coach_evidence_item(unit(evidence="Z"), "claim")
    with pytest.raises(ValueError):
        to_coach_evidence_item(unit(provenance="SCRAPED"), "claim")
    with pytest.raises(ValueError):
        to_coach_evidence_item(unit(domains=("SPACE",)), "claim")
    with pytest.raises(ValueError):
        to_coach_evidence_item(unit(), "   ")
    truncated = to_coach_evidence_item(unit(), "x" * 400)
    assert len(truncated["claim"]) == 300 and truncated["claim"].endswith("…")
    assert "claim_truncated" in truncated["limitations"]
    many = unit(metrics=tuple(f"M{i}" for i in range(12)))
    with pytest.raises(ValueError):
        to_coach_evidence_item(many, "claim")
    ok_many = unit(policies=("DO_NOT_OVERINFER", "HYPOTHESIS_ONLY", "REQUIRE_CONTEXT", "CONFIDENCE_GATE", "PREFER_LONGITUDINAL", "USE_PERSONAL_BASELINE", "PRESERVE_CONTRADICTION", "PROGRESSION", "GENERAL_GUIDANCE", "SEPARATE_DIMENSIONS"))
    item = to_coach_evidence_item(ok_many, "claim")
    assert len(item["limitations"]) <= 8 and len(item["forbidden_inferences"]) <= 8
    with pytest.raises(ValidationError):
        CoachEvidenceItemV1.model_validate({**item, "evidence_tier": "E"})


def test_real_corpus_codes_all_map_without_reading_any_text():
    vocabulary = controlled_vocabulary()
    seen = {"LINKED": 0, "ROW_ONLY": 0}
    for codes in iter_unit_codes():
        assert map_evidence_tier(codes.evidence) in COACH_EVIDENCE_TIERS
        assert_runtime_codes(codes, vocabulary)
        seen[provenance_policy(codes.provenance).provenance] += 1
    assert sum(seen.values()) == 940
    assert seen["LINKED"] == 40 and seen["ROW_ONLY"] == 900


def test_two_explicit_units_convert_end_to_end():
    row_only = coach_evidence_item_for_unit(61)
    assert row_only is not None and row_only["source_title"] is None and row_only["research_unit_id"] == 61
    CoachEvidenceItemV1.model_validate(row_only)
    with open_corpus() as db:
        linked_no = int(db.execute("select min(unit_no) from units where provenance_code = 'LINKED'").fetchone()[0])
    linked = coach_evidence_item_for_unit(linked_no)
    assert linked is not None and linked["research_unit_id"] == linked_no
    assert isinstance(linked["source_title"], str) and 0 < len(linked["source_title"]) <= 200
    CoachEvidenceItemV1.model_validate(linked)
    assert coach_evidence_item_for_unit(60) is None
    assert [item["research_unit_id"] for item in coach_evidence_items([61, 60, linked_no])] == [61, linked_no]
