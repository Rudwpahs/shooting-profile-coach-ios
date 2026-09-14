"""Byte-reproducible JSONL and auditable sidecars; no wall-clock entropy."""

import hashlib
import json
from collections import Counter
from pathlib import Path

from formpath_coach.corpus import CORPUS_DIR

from .audit import audit_corpus, markdown_summary, separate_output
from .build import generate
from .splits import SPLITS, leakage_audit


def json_bytes(value):
    return (json.dumps(value, sort_keys=True, ensure_ascii=False, indent=2) + "\n").encode()


def jsonl_bytes(rows):
    return "".join(
        json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
        for row in rows
    ).encode()


def source_hash():
    root = Path(__file__).resolve().parents[1]
    paths = [
        *sorted((root / "scenarios").glob("*.py")),
        *[
            root / name
            for name in (
                "scenario_cli.py",
                "schemas.py",
                "corpus.py",
                "corpus_mapping.py",
                "retrieval.py",
                "dataset.py",
                "provider_v1.py",
            )
        ],
    ]
    # Normalize line endings: Windows/Linux checkouts produce the same digest.
    parts = {
        p.relative_to(root).as_posix(): hashlib.sha256(
            p.read_text(encoding="utf-8").encode()
        ).hexdigest()
        for p in paths
    }
    return hashlib.sha256(json_bytes(parts)).hexdigest()


def render_artifacts(corpus_dir=CORPUS_DIR):
    audit = audit_corpus(corpus_dir)
    seed = generate(corpus_dir)
    files = {
        "corpus-audit.json": json_bytes(audit),
        "corpus-audit.md": markdown_summary(audit).encode(),
    }
    for split in SPLITS:
        files[f"{split}.jsonl"] = jsonl_bytes(
            {"request": s["request"], "response": s["response"]}
            for s in seed
            if s["split"] == split
        )
    files["metadata.jsonl"] = jsonl_bytes(
        {k: v for k, v in s.items() if k not in ("request", "response")} for s in seed
    )
    evidence = [e for s in seed for e in s["request"]["evidence"]]

    def counts(values):
        return dict(sorted(Counter(values).items()))

    manifest = {
        "dataset_version": "seed-v1",
        "generator_version": "b2c-v1",
        "generator_source_sha256": source_hash(),
        "lineage_base": "85c7ada7107e12f1a2c7ce6a5c2e381e1ba38297",
        "timestamp_policy": "Omitted: deterministic build, commit records creation time.",
        "corpus_integrity": audit["integrity"],
        "scenario_count": len(seed),
        "schema_valid_count": len(seed),
        "counts": counts(s["split"] for s in seed),
        "metric_distribution": counts(s["metric"] for s in seed),
        "observed_metric_distribution": counts(
            s["request"]["observations"][0]["metric"] for s in seed
        ),
        "action_distribution": counts(s["request"]["context"]["action"] for s in seed),
        "confidence_distribution": counts(s["response"]["confidence"] for s in seed),
        "evidence_tier_distribution": counts(e["evidence_tier"] for e in evidence),
        "provenance_distribution": counts(
            x.removeprefix("provenance:")
            for e in evidence
            for x in e["limitations"]
            if x.startswith("provenance:")
        ),
        "selected_unique_units": len({e["research_unit_id"] for e in evidence}),
        "direct_metric_evidence_cases": sum(
            s["evaluation_metadata"]["direct_metric_evidence"] for s in seed
        ),
        "leakage": leakage_audit(seed, corpus_dir),
        "generator_config": {
            "profiles_per_metric": 7,
            "variants_per_profile": 10,
            "family_split_counts": [5, 1, 1],
            "evidence_limit": 4,
            "partition": "source-and-canonical-claim-components-sha256-70-15-15",
            "locale": "en",
            "gold": "conservative_repeatability_templates",
        },
        "artifacts_sha256": {
            name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())
        },
    }
    files["manifest.json"] = json_bytes(manifest)
    return files


def build_dataset(output: Path, corpus_dir=CORPUS_DIR):
    separate_output(output, corpus_dir)
    files = render_artifacts(corpus_dir)
    output.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (output / name).write_bytes(data)
    return json.loads(files["manifest.json"])


def check_dataset(output: Path, corpus_dir=CORPUS_DIR):
    for name, expected in render_artifacts(corpus_dir).items():
        path = output / name
        if not path.is_file() or path.read_bytes() != expected:
            raise ValueError(f"artifact mismatch: {name}")
    return {
        "deterministic_regeneration": True,
        "leakage": leakage_audit(load_dataset(output), corpus_dir),
    }


def load_dataset(output: Path):
    metadata = [
        json.loads(line)
        for line in (output / "metadata.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    by_id = {s["scenario_id"]: s for s in metadata}
    if len(by_id) != len(metadata):
        raise ValueError("duplicate scenario metadata")
    result = []
    for split in SPLITS:
        for line in (output / f"{split}.jsonl").read_text(encoding="utf-8").splitlines():
            pair = json.loads(line)
            sid = pair["request"]["request_id"].removeprefix("req_")
            if sid not in by_id or by_id[sid]["split"] != split:
                raise ValueError("metadata split mismatch")
            result.append({**by_id.pop(sid), **pair})
    if by_id:
        raise ValueError("metadata without scenario")
    return sorted(result, key=lambda s: s["scenario_id"])
