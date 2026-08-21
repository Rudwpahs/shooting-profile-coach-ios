"""Build a source-faithful five-phase 2D skeleton review asset.

This output deliberately excludes MediaPipe z and is never a 3D motion model.
It exists so actual athlete video landmark evidence can be reviewed in the UI
without misrepresenting single-view pose as rotatable 3D.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


RIGHT_WRIST = 16
LEFT_WRIST = 15
RIGHT_HIP = 24
LEFT_HIP = 23
PHASES = ["준비", "딥", "상승", "릴리스", "팔로우스루"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--id", required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--source-view", choices=["front", "side", "oblique"], required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def phase_indexes(frames: list[dict[str, Any]]) -> tuple[str, list[int]]:
    right_peak = min(float(frame["landmarks"][RIGHT_WRIST]["y"]) for frame in frames)
    left_peak = min(float(frame["landmarks"][LEFT_WRIST]["y"]) for frame in frames)
    hand, wrist, hip = ("right", RIGHT_WRIST, RIGHT_HIP) if right_peak <= left_peak else ("left", LEFT_WRIST, LEFT_HIP)
    release = min(range(len(frames)), key=lambda index: float(frames[index]["landmarks"][wrist]["y"]))
    release = max(2, min(release, len(frames) - 3))
    dip_start = max(1, round(release * 0.55))
    dip = max(range(dip_start, release), key=lambda index: float(frames[index]["landmarks"][hip]["y"]))
    dip = min(max(1, dip), release - 2)
    rise = max(dip + 1, min(release - 1, round((dip + release) / 2)))
    follow = min(len(frames) - 1, max(release + 1, round(release + 0.28 * (len(frames) - 1 - release))))
    preparation = max(0, dip - max(1, release - dip) * 2)
    return hand, [preparation, dip, rise, release, follow]


def two_d_landmarks(frame: dict[str, Any]) -> list[dict[str, float]]:
    return [
        {"x": round(float(landmark["x"]), 6), "y": round(float(landmark["y"]), 6), "visibility": round(float(landmark.get("visibility", 1.0)), 6)}
        for landmark in frame["landmarks"]
    ]


def main() -> int:
    args = parse_args()
    payload = json.loads(args.candidate.read_text(encoding="utf-8"))
    if payload.get("boundary") != "monocular_relative_pose_not_metric_3d" or not payload.get("quality", {}).get("passed"):
        raise SystemExit("Input must be a passing single-view relative pose candidate")
    frames = [frame for frame in payload.get("frames", []) if len(frame.get("landmarks", [])) == 33]
    if len(frames) < 12:
        raise SystemExit("At least 12 full landmark frames are required")
    hand, indexes = phase_indexes(frames)
    output = {
        "version": 1,
        "id": args.id,
        "label": args.label,
        "boundary": "single_view_2d_skeleton_review",
        "state": "review_only_not_3d",
        "sourceView": args.source_view,
        "shootingHandEstimate": hand,
        "inputQuality": payload["quality"],
        "phases": [
            {
                "label": label,
                "progress": round(position / 4, 2),
                "sourceFrameIndex": index,
                "sourceTimestampMs": int(frames[index]["timestampMs"]),
                "landmarks": two_d_landmarks(frames[index]),
            }
            for position, (label, index) in enumerate(zip(PHASES, indexes))
        ],
        "admission": "Review actual 2D skeleton evidence only. No 3D rotation, depth, metric measurement, recommendation, or product motion use.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"id": args.id, "state": output["state"], "sourceView": args.source_view, "phases": [phase["sourceTimestampMs"] for phase in output["phases"]]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
