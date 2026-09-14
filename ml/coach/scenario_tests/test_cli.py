import json

import pytest


def test_audit_cli_writes_reproducible_reports(tmp_path):
    from formpath_coach.scenario_cli import main

    assert main(["audit", "--output", str(tmp_path)]) == 0
    first = {p.name: p.read_bytes() for p in tmp_path.iterdir()}
    assert json.loads(first["corpus-audit.json"])["total_units"] == 940
    assert main(["audit", "--output", str(tmp_path)]) == 0
    assert first == {p.name: p.read_bytes() for p in tmp_path.iterdir()}


def test_build_check_and_manifest_hashes(tmp_path):
    import hashlib

    from formpath_coach.dataset import ScenarioDataset
    from formpath_coach.scenario_cli import main
    from formpath_coach.scenarios.artifacts import load_dataset

    assert main(["build", "--output", str(tmp_path)]) == 0
    manifest = json.loads((tmp_path / "manifest.json").read_bytes())
    assert manifest["scenario_count"] == 560
    assert manifest["schema_valid_count"] == 560
    assert manifest["counts"] == {"train": 400, "dev": 80, "held-out": 80}
    for name, digest in manifest["artifacts_sha256"].items():
        assert hashlib.sha256((tmp_path / name).read_bytes()).hexdigest() == digest
    assert len(load_dataset(tmp_path)) == 560
    assert len(ScenarioDataset(tmp_path / "train.jsonl")) == 400
    first = {p.name: p.read_bytes() for p in tmp_path.iterdir()}
    assert main(["check", "--output", str(tmp_path)]) == 0
    assert main(["build", "--output", str(tmp_path)]) == 0
    assert first == {p.name: p.read_bytes() for p in tmp_path.iterdir()}
    (tmp_path / "train.jsonl").write_bytes(b"{}\n")
    with pytest.raises(ValueError, match="mismatch"):
        main(["check", "--output", str(tmp_path)])


def test_manifest_corruption_rejected(tmp_path):
    from formpath_coach.scenario_cli import main

    main(["build", "--output", str(tmp_path)])
    path = tmp_path / "manifest.json"
    manifest = json.loads(path.read_bytes())
    manifest["counts"]["train"] = 999
    path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="mismatch"):
        main(["check", "--output", str(tmp_path)])


def test_evaluation_cli_repeats_identically(tmp_path):
    from formpath_coach.scenario_cli import main

    main(["build", "--output", str(tmp_path)])
    main(["evaluate", "--output", str(tmp_path)])
    path = tmp_path / "baseline-evaluation.json"
    first = path.read_bytes()
    report = json.loads(first)
    assert report["case_count"] == 80
    assert report["all_invariants_passed"] is False  # Honest existing baseline limitation.
    main(["evaluate", "--output", str(tmp_path)])
    assert first == path.read_bytes()


def test_output_cannot_be_inside_immutable_corpus(tmp_path):
    import shutil

    from formpath_coach.corpus import CORPUS_DIR
    from formpath_coach.scenario_cli import main

    corpus = tmp_path / "corpus"
    shutil.copytree(CORPUS_DIR, corpus)
    for command in ("audit", "build", "evaluate"):
        with pytest.raises(ValueError, match="corpus"):
            main([command, "--corpus", str(corpus), "--output", str(corpus / "forbidden-output")])
