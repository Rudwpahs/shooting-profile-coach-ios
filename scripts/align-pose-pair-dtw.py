"""Align two single-view pose sequences by landmark motion dynamics.

The release landmark anchors are pinned first; dynamic time warping then aligns
the pre-release and post-release segments independently. This removes clip
start and slow-motion rate differences without treating arbitrary pose frames
as the same basketball event.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np


RIGHT_WRIST = 16
LEFT_WRIST = 15
LEFT_SHOULDER = 11
RIGHT_SHOULDER = 12
LEFT_HIP = 23
RIGHT_HIP = 24


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--view-a", type=Path, required=True)
    parser.add_argument("--view-b", type=Path, required=True)
    parser.add_argument("--hand", choices=["right", "left"], default="right")
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def load(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("boundary") != "monocular_relative_pose_not_metric_3d" or len(payload.get("frames", [])) < 5:
        raise ValueError(f"Invalid single-view pose sequence: {path}")
    return payload


def pose(frame: dict[str, Any]) -> np.ndarray:
    points = np.asarray([[float(item["x"]), float(item["y"])] for item in frame["landmarks"]], dtype=float)
    hips = (points[LEFT_HIP] + points[RIGHT_HIP]) / 2
    shoulders = (points[LEFT_SHOULDER] + points[RIGHT_SHOULDER]) / 2
    scale = max(float(np.linalg.norm(points[LEFT_SHOULDER] - points[RIGHT_SHOULDER])), float(np.linalg.norm(shoulders - hips)), 1e-6)
    return (points - hips) / scale


def release_index(frames: list[dict[str, Any]], hand: str) -> int:
    wrist = RIGHT_WRIST if hand == "right" else LEFT_WRIST
    return min(range(len(frames)), key=lambda index: float(frames[index]["landmarks"][wrist]["y"]))


def dtw_pairs(a: list[np.ndarray], b: list[np.ndarray]) -> list[tuple[int, int]]:
    if not a or not b:
        return []
    cost = np.full((len(a) + 1, len(b) + 1), np.inf)
    cost[0, 0] = 0.0
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            distance = float(np.mean(np.linalg.norm(a[i - 1] - b[j - 1], axis=1)))
            cost[i, j] = distance + min(cost[i - 1, j], cost[i, j - 1], cost[i - 1, j - 1])
    i, j = len(a), len(b)
    path: list[tuple[int, int]] = []
    while i > 0 and j > 0:
        path.append((i - 1, j - 1))
        previous = [cost[i - 1, j - 1], cost[i - 1, j], cost[i, j - 1]]
        direction = int(np.argmin(previous))
        if direction == 0:
            i, j = i - 1, j - 1
        elif direction == 1:
            i -= 1
        else:
            j -= 1
    return list(reversed(path))


def main() -> int:
    args = parse_args()
    a, b = load(args.view_a), load(args.view_b)
    a_frames, b_frames = a["frames"], b["frames"]
    a_release, b_release = release_index(a_frames, args.hand), release_index(b_frames, args.hand)
    pre = dtw_pairs([pose(frame) for frame in a_frames[:a_release]], [pose(frame) for frame in b_frames[:b_release]])
    post = dtw_pairs([pose(frame) for frame in a_frames[a_release + 1 :]], [pose(frame) for frame in b_frames[b_release + 1 :]])
    pairs = [(i, j) for i, j in pre] + [(a_release, b_release)] + [(a_release + 1 + i, b_release + 1 + j) for i, j in post]
    # Keep unique monotonic pairs and attach source timestamps.
    matched = []
    seen: set[tuple[int, int]] = set()
    for a_index, b_index in pairs:
        if (a_index, b_index) in seen:
            continue
        seen.add((a_index, b_index))
        matched.append({"aIndex": a_index, "bIndex": b_index, "aTimestampMs": int(a_frames[a_index]["timestampMs"]), "bTimestampMs": int(b_frames[b_index]["timestampMs"])})
    payload = {
        "version": 1,
        "kind": "release_pinned_dtw_pair_alignment",
        "inputs": {"a": str(args.view_a), "b": str(args.view_b), "aFrames": len(a_frames), "bFrames": len(b_frames)},
        "releaseAnchor": {"aFrame": a_release, "bFrame": b_release, "hand": args.hand},
        "matchedFrames": matched,
        "alignmentBoundary": "phase correspondence only; no calibration or metric 3D claim",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"releaseAnchor": payload["releaseAnchor"], "matchedCount": len(matched)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
