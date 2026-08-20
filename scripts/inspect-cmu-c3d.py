"""Inspect CMU C3D basketball shooting motion before any product conversion.

This script never fabricates joints. It reports only marker availability,
sampling metadata, and continuity evidence from a downloaded C3D source.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import ezc3d
import numpy as np


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--identity", default="anonymous_optical_mocap_subject")
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def clean_label(label: str) -> str:
    return label.strip().split(":")[-1].replace(" ", "_")


def main() -> int:
    args = parse_args()
    c3d = ezc3d.c3d(str(args.input))
    points = np.asarray(c3d["data"]["points"], dtype=float)
    labels = [clean_label(str(label)) for label in c3d["parameters"]["POINT"]["LABELS"]["value"]]
    frame_rate = float(c3d["header"]["points"]["frame_rate"])
    first_frame = int(c3d["header"]["points"]["first_frame"])
    last_frame = int(c3d["header"]["points"]["last_frame"])
    frame_count = int(points.shape[2])

    marker_report: list[dict[str, Any]] = []
    for index, label in enumerate(labels):
        xyz = points[:3, index, :]
        valid = np.isfinite(xyz).all(axis=0) & (points[3, index, :] >= 0)
        valid_ratio = float(valid.mean()) if frame_count else 0.0
        longest_run = 0
        run = 0
        for present in valid:
            run = run + 1 if present else 0
            longest_run = max(longest_run, run)
        marker_report.append({
            "label": label,
            "validFrameRatio": round(valid_ratio, 4),
            "longestContinuousFrames": longest_run,
            "centroidMm": [round(float(value), 3) for value in np.nanmean(np.where(valid[None, :], xyz, np.nan), axis=1)],
        })

    usable_markers = [marker for marker in marker_report if marker["validFrameRatio"] >= 0.85]
    quality = {
        "passed": frame_rate >= 100 and frame_count >= 120 and len(usable_markers) >= 18,
        "reasons": [],
    }
    if frame_rate < 100:
        quality["reasons"].append("capture_rate_below_100fps")
    if frame_count < 120:
        quality["reasons"].append("clip_shorter_than_one_second")
    if len(usable_markers) < 18:
        quality["reasons"].append("too_few_continuous_markers")

    payload = {
        "version": 1,
        "state": "inspection_passed" if quality["passed"] else "inspection_rejected",
        "boundary": "actual_optical_mocap_marker_data_not_yet_product_joint_schema",
        "source": {
            "provider": "CMU Graphics Lab Motion Capture Database",
            "url": args.source_url,
            "sha256": args.sha256,
            "identity": args.identity,
            "videoStored": False,
        },
        "capture": {
            "format": "c3d",
            "pointFrameRate": frame_rate,
            "firstFrame": first_frame,
            "lastFrame": last_frame,
            "frameCount": frame_count,
            "durationSeconds": round(frame_count / frame_rate, 3) if frame_rate else 0,
            "markerCount": len(labels),
        },
        "markers": marker_report,
        "quality": quality,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"state": payload["state"], "capture": payload["capture"], "quality": quality}, ensure_ascii=False))
    return 0 if quality["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
