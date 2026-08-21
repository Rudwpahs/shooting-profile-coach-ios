"""Audit visible shot phases from a passing single-view 33-landmark sequence.

This reports source measurements only. It proposes phase indexes with an early
head-visible preparation frame, a lowest shooting-hand loading dip, highest
shooting-hand release, and a later follow-through. It never creates 3D data.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


HEAD = 0
RIGHT_SHOULDER, LEFT_SHOULDER = 12, 11
RIGHT_WRIST, LEFT_WRIST = 16, 15
RIGHT_HIP, LEFT_HIP = 24, 23
PHASES = ["준비", "딥", "상승", "릴리스", "팔로우스루"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--shooting-hand", choices=["right", "left"], required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    payload = json.loads(args.candidate.read_text(encoding="utf-8"))
    frames: list[dict[str, Any]] = [frame for frame in payload.get("frames", []) if len(frame.get("landmarks", [])) == 33]
    if len(frames) < 12 or not payload.get("quality", {}).get("passed"):
        raise SystemExit("Input must be a passing sequence with at least 12 full landmark frames")

    wrist_index, shoulder_index, hip_index = (RIGHT_WRIST, RIGHT_SHOULDER, RIGHT_HIP) if args.shooting_hand == "right" else (LEFT_WRIST, LEFT_SHOULDER, LEFT_HIP)
    measurements: list[dict[str, float | int]] = []
    for index, frame in enumerate(frames):
        landmarks = frame["landmarks"]
        wrist = landmarks[wrist_index]
        shoulder = landmarks[shoulder_index]
        hip = landmarks[hip_index]
        head = landmarks[HEAD]
        measurements.append({
            "index": index,
            "timestampMs": int(frame["timestampMs"]),
            "headVisibility": round(float(head.get("visibility", 0)), 6),
            "wristY": round(float(wrist["y"]), 6),
            "shoulderY": round(float(shoulder["y"]), 6),
            "hipY": round(float(hip["y"]), 6),
            "wristBelowShoulder": round(float(wrist["y"]) - float(shoulder["y"]), 6),
        })

    release = min(range(len(frames)), key=lambda index: float(measurements[index]["wristY"]))
    release = max(4, min(release, len(frames) - 4))
    pre_release = list(range(0, release))
    # The dip is the lowest (largest image y) shooting wrist before the release.
    dip = max(pre_release, key=lambda index: float(measurements[index]["wristBelowShoulder"]))
    dip = min(max(2, dip), release - 2)
    visible_early = [index for index in range(0, dip) if float(measurements[index]["headVisibility"]) >= 0.75]
    preparation = visible_early[0] if visible_early else 0
    rise = max(dip + 1, min(release - 1, round((dip + release) / 2)))
    post_release = list(range(release + 1, len(frames)))
    follow = min(post_release, key=lambda index: float(measurements[index]["wristY"])) if post_release else len(frames) - 1
    phase_indexes = [preparation, dip, rise, release, follow]
    output = {
        "version": 1,
        "shootingHand": args.shooting_hand,
        "selectionRule": {
            "preparation": "earliest pre-dip frame with head visibility >= 0.75",
            "dip": "largest shooting-wrist y relative to shooting shoulder before release",
            "release": "lowest shooting-wrist image y",
            "followThrough": "lowest shooting-wrist image y after release",
        },
        "phaseIndexes": phase_indexes,
        "phases": [{"label": label, **measurements[index]} for label, index in zip(PHASES, phase_indexes)],
        "measurements": measurements,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"phaseIndexes": phase_indexes, "phases": output["phases"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
