"""B2-A: the vendored FormPath Knowledge Machine v2 is integrated and validated.

These tests check structure, checksums, vocabulary and counts. They do not
read the machine JSONL content, do not dump the database, and never touch
RU-0001..RU-0060.
"""

from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import fields

import pytest

from formpath_coach import corpus
from formpath_coach.corpus import (
    CANONICAL_UNIT_COUNT,
    CORPUS_DIR,
    CorpusError,
    CorpusUnitCodes,
    controlled_vocabulary,
    corpus_manifest,
    corpus_stats,
    iter_unit_codes,
    search_units,
    unit_codes,
    unit_text,
    units_by_domain,
    units_by_metric,
    units_by_policy,
    validate_corpus,
)


def test_package_is_vendored_byte_exact_and_validates():
    for name in ("formpath_knowledge.sqlite", "units.machine.jsonl", "manifest.json", "controlled-vocabulary.json", "SCHEMA.sql", "validate.py", "query_corpus.py", "sources.jsonl", "CLAUDE_HANDOFF.md"):
        assert (CORPUS_DIR / name).is_file(), name
    report = validate_corpus()
    manifest = corpus_manifest()
    assert report["status"] == "OK"
    assert report["units"] == CANONICAL_UNIT_COUNT == 940
    assert report["range"] == "RU-0061..RU-1000" == manifest["canonical_unit_range"]
    assert report["db_sha256"] == manifest["db_sha256"]
    assert report["jsonl_sha256"] == manifest["jsonl_sha256"]
    assert report["sources"] == 6
    assert manifest["ru_0001_0060_policy"] == "DISCARDED_BY_OWNER_DO_NOT_RECOVER"
    # The package ships three fallback codes the vocabulary lists omit; they are reported, not hidden.
    assert report["fallback_codes"] == {"domains": ["UNCLASSIFIED"], "metrics": ["UNMAPPED_METRIC"], "policies": ["GENERAL_GUIDANCE"]}


def test_stats_match_the_canonical_range_and_the_shipped_scripts_agree():
    assert corpus_stats() == {"units": 940, "min": 61, "max": 1000, "sources": 6}
    shipped_validate = subprocess.run([sys.executable, str(CORPUS_DIR / "validate.py")], capture_output=True, text=True, check=True)
    assert json.loads(shipped_validate.stdout)["status"] == "OK"
    shipped_stats = subprocess.run([sys.executable, str(CORPUS_DIR / "query_corpus.py"), "stats"], capture_output=True, text=True, check=True)
    assert json.loads(shipped_stats.stdout) == corpus_stats()


def test_discarded_units_are_absent_and_numbering_is_canonical():
    with corpus.open_corpus() as db:
        assert db.execute("select count(*) from units where unit_no < 61").fetchone()[0] == 0
        assert db.execute("select count(*) from units where unit_no > 1000").fetchone()[0] == 0
    assert unit_codes(60) is None
    assert unit_codes(1001) is None
    first = unit_codes(61)
    last = unit_codes(1000)
    assert first is not None and first.id == "RU-0061"
    assert last is not None and last.id == "RU-1000"


def test_every_code_is_in_the_controlled_vocabulary_and_counts_match_the_manifest():
    vocabulary = controlled_vocabulary()
    manifest = corpus_manifest()
    known = {
        "domains": set(vocabulary["domains"]) | set(manifest["domain_counts"]),
        "metrics": set(vocabulary["metrics"]) | set(manifest["metric_counts"]),
        "policies": set(vocabulary["policies"]) | set(manifest["policy_counts"]),
    }
    domains: dict[str, int] = {}
    metrics: dict[str, int] = {}
    policies: dict[str, int] = {}
    evidence: dict[str, int] = {}
    seen = 0
    for unit in iter_unit_codes():
        seen += 1
        assert unit.effect in vocabulary["effects"], unit.id
        assert unit.evidence in vocabulary["evidence_codes"], unit.id
        assert unit.provenance in vocabulary["provenance_codes"], unit.id
        for code in unit.domains:
            assert code in known["domains"], (unit.id, code)
            domains[code] = domains.get(code, 0) + 1
        for code in unit.metrics:
            assert code in known["metrics"], (unit.id, code)
            metrics[code] = metrics.get(code, 0) + 1
        for code in unit.policies:
            assert code in known["policies"], (unit.id, code)
            policies[code] = policies.get(code, 0) + 1
        evidence[unit.evidence] = evidence.get(unit.evidence, 0) + 1
    assert seen == 940
    assert domains == manifest["domain_counts"]
    assert metrics == manifest["metric_counts"]
    assert policies == manifest["policy_counts"]
    assert evidence == manifest["evidence_counts"]


def test_queries_answer_with_machine_codes_only():
    shooting = units_by_domain("SHOOTING", limit=20)
    assert 0 < len(shooting) <= 20
    assert all("SHOOTING" in unit.domains for unit in shooting)
    assert [unit.n for unit in shooting] == sorted(unit.n for unit in shooting)
    timing = units_by_metric("RELEASE_TIMING", limit=20)
    assert len(timing) == corpus_manifest()["metric_counts"]["RELEASE_TIMING"]
    assert all("RELEASE_TIMING" in unit.metrics for unit in timing)
    policy = units_by_policy("DO_NOT_OVERINFER", limit=20)
    assert len(policy) == 20 and all("DO_NOT_OVERINFER" in unit.policies for unit in policy)
    code_fields = {field.name for field in fields(CorpusUnitCodes)}
    assert code_fields == {"n", "id", "effect", "evidence", "provenance", "domains", "metrics", "policies", "sources"}
    assert not code_fields & {"claim", "context_metric", "coaching_implication", "evidence_raw"}
    assert units_by_domain("NOT_A_DOMAIN") == []
    with pytest.raises(ValueError):
        units_by_domain("SHOOTING", limit=0)


def test_text_is_available_only_for_one_explicitly_named_unit():
    text = unit_text(61)
    assert text is not None and text.id == "RU-0061" and isinstance(text.claim, str) and text.claim
    assert unit_text(60) is None
    hits = search_units("release", limit=3)
    assert 0 < len(hits) <= 3
    assert all(isinstance(hit, CorpusUnitCodes) for hit in hits)


def test_connection_is_read_only():
    import sqlite3

    with corpus.open_corpus() as db:
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            db.execute("delete from units where unit_no = 61")
        assert db.execute("select count(*) from units").fetchone()[0] == 940


def test_validation_detects_tampering(tmp_path):
    import shutil

    tampered = tmp_path / "corpus"
    shutil.copytree(CORPUS_DIR, tampered)
    manifest = json.loads((tampered / "manifest.json").read_text(encoding="utf-8"))
    manifest["db_sha256"] = "0" * 64
    (tampered / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(CorpusError, match="database checksum"):
        validate_corpus(tampered)


def test_cli_validate_and_stats():
    result = subprocess.run([sys.executable, "-m", "formpath_coach.corpus", "validate"], capture_output=True, text=True, check=True)
    assert json.loads(result.stdout)["status"] == "OK"
    result = subprocess.run([sys.executable, "-m", "formpath_coach.corpus", "domain", "SHOOTING", "--limit", "2"], capture_output=True, text=True, check=True)
    lines = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
    assert len(lines) == 2 and all("claim" not in line for line in lines)
