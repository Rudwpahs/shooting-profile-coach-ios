"""Deterministic, read-only corpus integrity and provenance audit."""

from __future__ import annotations

import hashlib
import json
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from formpath_coach.corpus import (
    CORPUS_DIR,
    CorpusError,
    iter_unit_codes,
    open_corpus,
    validate_corpus,
)
from formpath_coach.corpus_mapping import map_evidence_tier

SAFETY = frozenset(
    {
        "DO_NOT_OVERINFER",
        "DO_NOT_INFER_UNOBSERVABLE",
        "REQUIRE_CONTEXT",
        "CONFIDENCE_GATE",
        "HYPOTHESIS_ONLY",
        "USE_PERSONAL_BASELINE",
        "PRESERVE_CONTRADICTION",
        "SEPARATE_DIMENSIONS",
    }
)
REQUIRED = (
    "id",
    "n",
    "domain_codes",
    "metric_codes",
    "effect_code",
    "policy_codes",
    "evidence_code",
    "evidence_method",
    "provenance_code",
    "source_ids",
    "payload",
    "origin",
)


def canonical_claim(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())


def separate_output(output: Path, corpus_dir: Path):
    if output.resolve().is_relative_to(corpus_dir.resolve()):
        raise ValueError("output must be outside the immutable corpus")


def audit_records(records: list[dict]) -> dict:
    claims = defaultdict(list)
    missing = []
    for row in records:
        fields = [key for key in REQUIRED if key not in row or row[key] is None]
        for key in ("domain_codes", "metric_codes", "policy_codes"):
            if key in row and not row[key]:
                fields.append(key)
        claim = row.get("payload", {}).get("claim", "")
        if not isinstance(claim, str) or not claim.strip():
            fields.append("payload.claim")
        else:
            claims[canonical_claim(claim)].append(row["n"])
        if fields:
            missing.append({"unit_id": row.get("id"), "fields": sorted(set(fields))})
    return {
        "duplicate_ids": sorted(
            key for key, n in Counter(r.get("id") for r in records).items() if n > 1
        ),
        "duplicate_canonical_claims": [
            {"claim_sha256": hashlib.sha256(text.encode()).hexdigest(), "unit_ids": sorted(ids)}
            for text, ids in sorted(claims.items())
            if len(ids) > 1
        ],
        "missing_required_fields": missing,
    }


def audit_corpus(corpus_dir: Path = CORPUS_DIR) -> dict:
    integrity = validate_corpus(corpus_dir)
    records = [
        json.loads(line)
        for line in (corpus_dir / "units.machine.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    units = list(iter_unit_codes(corpus_dir))
    if not units:
        raise CorpusError("empty corpus")
    # Compare machine JSONL to the database rather than trusting its line count.
    by_id = {u.n: u for u in units}
    for row in records:
        unit = by_id.get(row["n"])
        if unit is None or any(
            row[key] != value
            for key, value in {
                "id": unit.id,
                "domain_codes": list(unit.domains),
                "metric_codes": list(unit.metrics),
                "policy_codes": list(unit.policies),
                "source_ids": list(unit.sources),
                "effect_code": unit.effect,
                "evidence_code": unit.evidence,
                "provenance_code": unit.provenance,
            }.items()
        ):
            raise CorpusError("JSONL/database code mismatch")
    with open_corpus(corpus_dir) as db:
        db_claims = {
            r["unit_no"]: r["claim"] for r in db.execute("select unit_no, claim from units")
        }
        sources = [dict(r) for r in db.execute("select * from sources order by source_id")]
    if any(row["payload"]["claim"] != db_claims[row["n"]] for row in records):
        raise CorpusError("JSONL/database claim mismatch")
    diagnostics = audit_records(records)
    domains = Counter(c for u in units for c in u.domains)
    metrics = Counter(c for u in units for c in u.metrics)
    policies = Counter(c for u in units for c in u.policies)
    coverage = {}
    for name, counts, attr in [("domain", domains, "domains"), ("metric", metrics, "metrics")]:
        coverage[name] = {
            code: {
                "total": counts[code],
                "linked": sum(
                    u.provenance == "LINKED" and bool(u.sources)
                    for u in units
                    if code in getattr(u, attr)
                ),
            }
            for code in sorted(counts)
        }
    return {
        "audit_version": "b2c-v1",
        "total_units": len(units),
        "integrity": integrity,
        "evidence_codes": dict(sorted(Counter(u.evidence for u in units).items())),
        "evidence_tiers": dict(
            sorted(Counter(map_evidence_tier(u.evidence) for u in units).items())
        ),
        "domains": dict(sorted(domains.items())),
        "metric_mapping": dict(sorted(metrics.items())),
        "provenance": {p: sum(u.provenance == p for u in units) for p in ["LINKED", "ROW_ONLY"]},
        "unmapped_count": metrics["UNMAPPED_METRIC"],
        "sentinels": {
            "UNCLASSIFIED": domains["UNCLASSIFIED"],
            "UNMAPPED_METRIC": metrics["UNMAPPED_METRIC"],
            "GENERAL_GUIDANCE": policies["GENERAL_GUIDANCE"],
        },
        "safety_related_count": sum(bool(SAFETY.intersection(u.policies)) for u in units),
        "linked_source_coverage": coverage,
        "source_count": len(sources),
        "provenance_inconsistencies": [
            u.n for u in units if (u.provenance == "LINKED") != bool(u.sources)
        ],
        **diagnostics,
    }


def markdown_summary(report: dict) -> str:
    lines = [
        "# B2-C corpus audit",
        "",
        f"Total units: {report['total_units']}",
        f"Provenance: {report['provenance']}",
        f"Unmapped metric units: {report['unmapped_count']}",
        f"Safety-related units: {report['safety_related_count']}",
        f"Duplicate IDs: {report['duplicate_ids']}",
        f"Duplicate canonical claims: {len(report['duplicate_canonical_claims'])}",
        f"Missing required fields: {len(report['missing_required_fields'])}",
        "",
        "Machine codes are heuristic classifications, not verified scientific labels.",
        "LINKED denotes existing source linkage only; it does not establish claim validity.",
        "Canonical duplicate detection uses Unicode NFKC, case folding and whitespace only.",
        "Full distributions and coverage are in corpus-audit.json.",
        "",
    ]
    return "\n".join(lines)
