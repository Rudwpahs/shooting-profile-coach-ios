"""Runtime compatibility between the vendored Knowledge Machine v2 and Coach contract V1.

The corpus package is an immutable, byte-exact artifact and the Coach
contract is frozen; neither side is edited. Everything that has to give
lives here, applied at runtime:

* the three fallback sentinels the corpus uses but its vocabulary lists omit
  (``UNCLASSIFIED``, ``UNMAPPED_METRIC``, ``GENERAL_GUIDANCE``) are accepted
  as official runtime codes;
* the fourteen corpus evidence codes map onto the seven frozen tiers by a
  conservative downgrade, never an upgrade;
* provenance decides what a unit may be used for: ``LINKED`` is a normal
  evidence candidate, ``ROW_ONLY`` is a retrieval candidate that carries no
  source title, must not be the sole evidence for a strong prescription, and
  caps downstream Coach confidence at ``medium``;
* a unit becomes a ``CoachEvidenceItemV1`` only through
  :func:`to_coach_evidence_item`, which validates the result against the
  frozen model before returning it.

Nothing here reads the corpus wholesale: text is touched only for the unit
being converted.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, get_args

from formpath_coach.corpus import (
    CORPUS_DIR,
    CorpusUnitCodes,
    controlled_vocabulary,
    open_corpus,
    unit_codes,
    unit_text,
)
from formpath_coach.schemas import COACH_CONFIDENCE, CoachEvidenceItemV1, EvidenceTier

# --------------------------------------------------------------------------- fallback sentinels

CodeDimension = Literal["domains", "metrics", "policies"]

RUNTIME_FALLBACK_CODES: Mapping[CodeDimension, frozenset[str]] = {
    "domains": frozenset({"UNCLASSIFIED"}),
    "metrics": frozenset({"UNMAPPED_METRIC"}),
    "policies": frozenset({"GENERAL_GUIDANCE"}),
}


def runtime_codes(dimension: CodeDimension, vocabulary: Mapping[str, Any] | None = None) -> frozenset[str]:
    """The vocabulary list for a dimension plus its runtime fallback sentinel."""
    vocab = vocabulary if vocabulary is not None else controlled_vocabulary()
    return frozenset(vocab[dimension]) | RUNTIME_FALLBACK_CODES[dimension]


def is_runtime_code(dimension: CodeDimension, code: str, vocabulary: Mapping[str, Any] | None = None) -> bool:
    return code in runtime_codes(dimension, vocabulary)


def assert_runtime_codes(unit: CorpusUnitCodes, vocabulary: Mapping[str, Any] | None = None) -> None:
    """Strict: every domain, metric and policy code must be a vocabulary code or a sentinel."""
    vocab = vocabulary if vocabulary is not None else controlled_vocabulary()
    for dimension, codes in (("domains", unit.domains), ("metrics", unit.metrics), ("policies", unit.policies)):
        allowed = runtime_codes(dimension, vocab)
        unknown = [code for code in codes if code not in allowed]
        if unknown:
            raise ValueError(f"{unit.id}: unknown {dimension} code(s) {unknown}")


# --------------------------------------------------------------------------- evidence tiers

COACH_EVIDENCE_TIERS: tuple[str, ...] = tuple(get_args(EvidenceTier))

# Corpus evidence code -> frozen Coach tier. A conservative downgrade: a minus
# grade falls to the next letter, and E / U (no or unknown evidence) fall to H.
EVIDENCE_TIER_MAP: Mapping[str, str] = {
    "A+": "A",
    "A": "A",
    "A-": "A-",
    "B+": "B+",
    "B": "B",
    "B-": "C",
    "C+": "C",
    "C": "C",
    "C-": "D",
    "D+": "D",
    "D": "D",
    "D-": "H",
    "E": "H",
    "U": "H",
}

CORPUS_EVIDENCE_CODES: tuple[str, ...] = tuple(EVIDENCE_TIER_MAP)

# Strength orders used only to prove the mapping never upgrades.
TIER_STRENGTH: Mapping[str, int] = {"A": 6, "A-": 5, "B+": 4, "B": 3, "C": 2, "D": 1, "H": 0}
CORPUS_CODE_STRENGTH: Mapping[str, int] = {code: len(CORPUS_EVIDENCE_CODES) - index for index, code in enumerate(CORPUS_EVIDENCE_CODES)}


def map_evidence_tier(code: str) -> str:
    """The frozen tier for a corpus evidence code; anything else is rejected."""
    try:
        return EVIDENCE_TIER_MAP[code]
    except KeyError:
        raise ValueError(f"unknown corpus evidence code: {code!r}") from None


def nominal_tier(code: str) -> str:
    """The letter a corpus code names before any downgrade; used to prove conservativeness."""
    if code not in EVIDENCE_TIER_MAP:
        raise ValueError(f"unknown corpus evidence code: {code!r}")
    if code in TIER_STRENGTH:
        return code
    letter = code[0]
    return letter if letter in TIER_STRENGTH else "H"


# --------------------------------------------------------------------------- provenance

PROVENANCE_CODES: tuple[str, ...] = ("LINKED", "ROW_ONLY")
CoachConfidence = Literal["very_low", "low", "medium", "high", "very_high"]


@dataclass(frozen=True)
class ProvenancePolicy:
    provenance: str
    retrieval_candidate: bool
    evidence_candidate: bool
    may_be_sole_prescription_evidence: bool
    max_coach_confidence: CoachConfidence
    source_title_allowed: bool


_PROVENANCE_POLICIES: Mapping[str, ProvenancePolicy] = {
    "LINKED": ProvenancePolicy("LINKED", True, True, True, "very_high", True),
    "ROW_ONLY": ProvenancePolicy("ROW_ONLY", True, True, False, "medium", False),
}


def provenance_policy(code: str) -> ProvenancePolicy:
    try:
        return _PROVENANCE_POLICIES[code]
    except KeyError:
        raise ValueError(f"unknown corpus provenance code: {code!r}") from None


@dataclass(frozen=True)
class EvidenceSetPolicy:
    """Downstream policy for a set of evidence units, for the Coach to honour."""

    linked: int
    row_only: int
    max_coach_confidence: CoachConfidence
    may_prescribe_from_sole_evidence: bool
    reasons: tuple[str, ...]


def evidence_set_policy(provenances: Iterable[str]) -> EvidenceSetPolicy:
    policies = [provenance_policy(code) for code in provenances]
    linked = sum(1 for policy in policies if policy.provenance == "LINKED")
    row_only = sum(1 for policy in policies if policy.provenance == "ROW_ONLY")
    if linked > 0:
        return EvidenceSetPolicy(linked, row_only, "very_high", True, ())
    reason = "row_only_evidence_only" if row_only > 0 else "no_evidence"
    return EvidenceSetPolicy(linked, row_only, "medium", False, (reason,))


def cap_coach_confidence(confidence: str, policy: EvidenceSetPolicy) -> str:
    """Never raises a band; lowers it to the policy cap when the evidence cannot carry more."""
    order = list(COACH_CONFIDENCE)
    if confidence not in order:
        raise ValueError(f"unknown coach confidence: {confidence!r}")
    return confidence if order.index(confidence) <= order.index(policy.max_coach_confidence) else policy.max_coach_confidence


# --------------------------------------------------------------------------- CorpusUnit -> CoachEvidenceItemV1

CLAIM_MAX_LENGTH = 300
SOURCE_TITLE_MAX_LENGTH = 200
LIST_MAX = 8
FORBIDDEN_INFERENCE_POLICIES: tuple[str, ...] = ("DO_NOT_OVERINFER", "DO_NOT_INFER_UNOBSERVABLE", "HYPOTHESIS_ONLY", "SEPARATE_DIMENSIONS")
LIMITATION_POLICIES: tuple[str, ...] = (
    "REQUIRE_CONTEXT",
    "CONFIDENCE_GATE",
    "PREFER_LONGITUDINAL",
    "USE_PERSONAL_BASELINE",
    "PRESERVE_CONTRADICTION",
    "PROGRESSION",
    "GENERAL_GUIDANCE",
)


def _bounded_claim(claim: str) -> tuple[str, bool]:
    text = " ".join(claim.split())
    if not text:
        raise ValueError("a unit claim must not be empty")
    if len(text) <= CLAIM_MAX_LENGTH:
        return text, False
    return text[: CLAIM_MAX_LENGTH - 1].rstrip() + "…", True


def to_coach_evidence_item(
    unit: CorpusUnitCodes,
    claim: str,
    source_titles: Sequence[str] = (),
    vocabulary: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """One corpus unit as a frozen ``CoachEvidenceItemV1`` document, validated before it is returned.

    Codes are carried as codes: supported inferences are ``METRIC:EFFECT`` pairs,
    forbidden inferences and limitations are policy codes plus the provenance and
    evidence code. ``ROW_ONLY`` never carries a source title.
    """
    assert_runtime_codes(unit, vocabulary)
    tier = map_evidence_tier(unit.evidence)
    policy = provenance_policy(unit.provenance)
    text, truncated = _bounded_claim(claim)

    source_title: str | None = None
    if policy.source_title_allowed:
        for candidate in source_titles:
            title = " ".join(str(candidate).split())
            if title:
                source_title = title[:SOURCE_TITLE_MAX_LENGTH]
                break

    supported: list[str] = []
    for metric in unit.metrics:
        pair = f"{metric}:{unit.effect}"
        if pair not in supported:
            supported.append(pair)
    forbidden = [code for code in unit.policies if code in FORBIDDEN_INFERENCE_POLICIES]
    limitations = [f"provenance:{unit.provenance}", f"evidence_code:{unit.evidence}"]
    if truncated:
        limitations.append("claim_truncated")
    limitations.extend(f"policy:{code}" for code in unit.policies if code in LIMITATION_POLICIES)

    item = {
        "research_unit_id": unit.n,
        "claim": text,
        "evidence_tier": tier,
        "source_title": source_title,
        "supported_inferences": supported[:LIST_MAX],
        "forbidden_inferences": forbidden[:LIST_MAX],
        "limitations": limitations[:LIST_MAX],
        "contradiction_group": None,
    }
    return CoachEvidenceItemV1.model_validate(item).model_dump(mode="json")


def _source_titles(unit_no: int, corpus_dir: Path) -> list[str]:
    with open_corpus(corpus_dir) as db:
        return [
            str(row[0])
            for row in db.execute(
                "select s.title from unit_sources us join sources s on s.source_id = us.source_id where us.unit_no = ? order by s.source_id",
                (unit_no,),
            )
            if row[0]
        ]


def coach_evidence_item_for_unit(unit_no: int, corpus_dir: Path = CORPUS_DIR) -> dict[str, Any] | None:
    """The frozen evidence document for one explicitly named unit, or ``None`` when it does not exist."""
    codes = unit_codes(unit_no, corpus_dir)
    text = unit_text(unit_no, corpus_dir)
    if codes is None or text is None:
        return None
    return to_coach_evidence_item(codes, text.claim, _source_titles(unit_no, corpus_dir))


def coach_evidence_items(unit_nos: Iterable[int], corpus_dir: Path = CORPUS_DIR) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for unit_no in unit_nos:
        item = coach_evidence_item_for_unit(unit_no, corpus_dir)
        if item is not None:
            items.append(item)
    return items
