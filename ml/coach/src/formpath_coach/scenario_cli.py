"""Offline Seed V1 audit/build/check/evaluation entrypoint."""

import argparse
import asyncio
import hashlib
import json
from pathlib import Path

from .corpus import CORPUS_DIR
from .scenarios.audit import audit_corpus, markdown_summary, separate_output


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["audit", "build", "check", "evaluate"])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--corpus", type=Path, default=CORPUS_DIR)
    args = parser.parse_args(argv)
    separate_output(args.output, args.corpus)
    if args.command != "audit":
        from .scenarios.artifacts import build_dataset, check_dataset, json_bytes, load_dataset

        if args.command == "build":
            manifest = build_dataset(args.output, args.corpus)
            print(
                json.dumps(
                    {"scenario_count": manifest["scenario_count"], "counts": manifest["counts"]}
                )
            )
        elif args.command == "check":
            print(json.dumps(check_dataset(args.output, args.corpus), sort_keys=True))
        else:
            from .provider_v1 import DeterministicBaselineV1
            from .scenarios.evaluate import evaluate_provider

            check_dataset(args.output, args.corpus)
            held = [s for s in load_dataset(args.output) if s["split"] == "held-out"]
            report = asyncio.run(evaluate_provider(held, DeterministicBaselineV1()))
            report["provider"] = {"id": "deterministic_v1", "revision": "service_baseline_v1"}
            report["dataset_manifest_sha256"] = hashlib.sha256(
                (args.output / "manifest.json").read_bytes()
            ).hexdigest()
            (args.output / "baseline-evaluation.json").write_bytes(json_bytes(report))
            print(json.dumps({k: v for k, v in report.items() if k != "cases"}, sort_keys=True))
        return 0
    report = audit_corpus(args.corpus)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "corpus-audit.json").write_bytes(
        (json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()
    )
    (args.output / "corpus-audit.md").write_bytes(markdown_summary(report).encode())
    print(json.dumps({"total_units": report["total_units"], "provenance": report["provenance"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
