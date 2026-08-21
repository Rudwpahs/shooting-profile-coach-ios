"""Record a user-provided front/side video pair for relative-pose comparison.

This helper hashes source media and documents the alignment boundary. It never
claims the clips are synchronized physical cameras and can never be consumed by
the calibrated multi-view triangulation validator.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--front", type=Path, required=True)
    parser.add_argument("--side", type=Path, required=True)
    parser.add_argument("--source-record", required=True, help="Non-empty local source record ID; no names are required.")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if not args.source_record.strip():
        raise SystemExit("A non-empty --source-record is required.")
    if not args.front.is_file() or not args.side.is_file():
        raise SystemExit("Both input files must exist.")
    if args.front.resolve() == args.side.resolve():
        raise SystemExit("Front and side must be different media files.")

    payload = {
        "version": 1,
        "captureKind": "two_slow_motion_reference_views_not_calibrated_multiview",
        "sourceRecord": args.source_record.strip(),
        "sourceMediaProvidedForAnalysis": True,
        "views": ["front", "side"],
        "assetHashes": {"front": sha256(args.front), "side": sha256(args.side)},
        "alignment": {
            "method": "release_event_normalization",
            "timestampSynchronized": False,
            "triangulationEligible": False,
        },
        "rawMediaStoredInProduct": False,
        "outputBoundary": "monocular_relative_pose_not_metric_3d_per_view",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"state": "recorded_not_triangulatable", "views": payload["views"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
