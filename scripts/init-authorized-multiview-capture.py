"""Create a provenance manifest for an authorized, physically separated multi-view shoot.

This helper never estimates 3D or grants approval. It hashes the original local
front and side media so validate-multiview-pose-candidate.py can later verify
that an authorized, two-camera capture was used for triangulation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--front", type=Path, required=True, help="Local front-view video file.")
    parser.add_argument("--side", type=Path, required=True, help="Local side-view video file.")
    parser.add_argument("--consent-record", required=True, help="Non-empty local consent record ID; names are not written.")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if not args.consent_record.strip():
        raise SystemExit("A non-empty --consent-record is required.")
    if not args.front.is_file() or not args.side.is_file():
        raise SystemExit("Both --front and --side must be existing local media files.")
    if args.front.resolve() == args.side.resolve():
        raise SystemExit("Front and side must be different physical-camera media files.")

    payload = {
        "version": 1,
        "captureKind": "physically_separated_synchronized_cameras",
        "sourceMediaAuthorized": True,
        "consentRecord": args.consent_record.strip(),
        "views": ["front", "side"],
        "assetHashes": {"front": file_hash(args.front), "side": file_hash(args.side)},
        "rawMediaStoredInProduct": False,
        "approval": "pending_calibration_pose_and_reprojection_validation",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"state": payload["approval"], "views": payload["views"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
