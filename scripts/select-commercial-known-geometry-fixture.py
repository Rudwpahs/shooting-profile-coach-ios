"""Select only commercially authorized known-geometry sources for regression.

This is a license/provenance gate, not a downloader. It deliberately refuses to
fetch, cache, or redistribute external dataset material. A source becomes
eligible only after its commercial permission is explicitly recorded in the
manifest. Product motion admission remains a stricter, separate gate.
"""

from __future__ import annotations

import argparse

import json
from pathlib import Path
from typing import Any


REQUIRED_SOURCE_FIELDS = {
    "id": str,
    "sourceKind": str,
    "knownGeometry": bool,
    "commercialUseAllowed": bool,
    "reason": str,
    "sourceUrl": str,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def load_manifest(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("version") != 1:
        raise ValueError("Fixture manifest must use version 1")
    policy = payload.get("policy")
    if not isinstance(policy, dict) or policy.get("allowExternalFixtureDownload") is not False:
        raise ValueError("Manifest must prohibit automatic external fixture downloads")
    sources = payload.get("sources")
    if not isinstance(sources, list) or not sources:
        raise ValueError("Manifest must contain at least one source record")
    return payload


def validate_source(source: Any) -> dict[str, Any]:
    if not isinstance(source, dict):
        raise ValueError("Every source record must be an object")
    for field, expected in REQUIRED_SOURCE_FIELDS.items():
        if not isinstance(source.get(field), expected):
            raise ValueError(f"Source '{source.get('id', '<unknown>')}' has invalid {field}")
    if not source["id"].strip() or not source["reason"].strip() or not source["sourceUrl"].startswith("https://"):
        raise ValueError(f"Source '{source['id']}' contains empty or unsafe metadata")
    return source


def main() -> int:
    args = parse_args()
    manifest = load_manifest(args.manifest)
    sources = [validate_source(source) for source in manifest["sources"]]
    ids = [source["id"] for source in sources]
    if len(ids) != len(set(ids)):
        raise ValueError("Fixture source ids must be unique")

    eligible = [source for source in sources if source["knownGeometry"] and source["commercialUseAllowed"]]
    blocked = [source for source in sources if source not in eligible]
    payload = {
        "version": 1,
        "kind": "commercial_known_geometry_fixture_selection",
        "state": "eligible_sources_present" if eligible else "blocked_no_commercial_fixture",
        "externalDataDownloaded": False,
        "eligibleSources": [{key: source[key] for key in ("id", "sourceKind", "sourceUrl")} for source in eligible],
        "blockedSources": [
            {key: source[key] for key in ("id", "sourceKind", "knownGeometry", "commercialUseAllowed", "reason", "sourceUrl")}
            for source in blocked
        ],
        "productMotionAdmission": "blocked_without_actual_authorized_source_and_separate_visual_admission",
        "nextAllowedInput": "A licensed fixture record or an authorized fixed-camera self-capture manifest.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"state": payload["state"], "eligible": len(eligible), "blocked": len(blocked)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
