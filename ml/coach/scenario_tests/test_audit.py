import hashlib
import importlib
import shutil

import pytest

from formpath_coach.corpus import CORPUS_DIR, CorpusError


def audit_module():
    return importlib.import_module("formpath_coach.scenarios.audit")


def test_audit_counts_and_never_mutates_corpus():
    before = {
        p.name: hashlib.sha256(p.read_bytes()).hexdigest()
        for p in CORPUS_DIR.iterdir()
        if p.is_file()
    }
    report = audit_module().audit_corpus()
    assert report["total_units"] == 940
    assert sum(report["provenance"].values()) == 940
    assert report["sentinels"]["UNMAPPED_METRIC"] == 524
    assert report["duplicate_ids"] == []
    assert report["missing_required_fields"] == []
    assert report == audit_module().audit_corpus()
    assert before == {
        p.name: hashlib.sha256(p.read_bytes()).hexdigest()
        for p in CORPUS_DIR.iterdir()
        if p.is_file()
    }


def test_audit_rejects_empty_and_corrupt_corpus(tmp_path):
    with pytest.raises((CorpusError, OSError, ValueError)):
        audit_module().audit_corpus(tmp_path)
    for name in [
        "manifest.json",
        "controlled-vocabulary.json",
        "formpath_knowledge.sqlite",
        "units.machine.jsonl",
    ]:
        shutil.copy2(CORPUS_DIR / name, tmp_path / name)
    with (tmp_path / "units.machine.jsonl").open("ab") as stream:
        stream.write(b"corrupt")
    with pytest.raises(CorpusError):
        audit_module().audit_corpus(tmp_path)


def test_duplicate_claim_canonicalization_and_missing_fields():
    report = audit_module().audit_records(
        [
            {"id": "RU-0001", "n": 1, "payload": {"claim": " A  CLAIM "}},
            {"id": "RU-0001", "n": 2, "payload": {"claim": "a claim"}},
        ]
    )
    assert report["duplicate_ids"] == ["RU-0001"]
    assert report["duplicate_canonical_claims"][0]["unit_ids"] == [1, 2]
    assert report["missing_required_fields"]
