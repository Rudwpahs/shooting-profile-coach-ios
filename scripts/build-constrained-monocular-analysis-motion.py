"""Create a stable display analysis from an existing single-view motion record.

It preserves the already-audited source-frame x/y pose and known shooting hand.
Only legacy image-relative z is re-centered, scaled, and clamped. The result is
for visual analysis only and cannot be used as actual or calibrated 3D.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np


DEPTH_SCALE = 0.055
MAX_ABSOLUTE_DEPTH = 0.32


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--relative-motion", type=Path, required=True)
    parser.add_argument("--id", required=True)
    parser.add_argument("--hand", choices=["right", "left"], required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def constrained_frame(frame: dict[str, Any]) -> dict[str, Any]:
    joints = frame["joints"]
    shoulder_depth = (float(joints["leftShoulder"]["z"]) + float(joints["rightShoulder"]["z"])) / 2
    output: dict[str, dict[str, float]] = {}
    for name, value in joints.items():
        depth = np.clip((float(value["z"]) - shoulder_depth) * DEPTH_SCALE, -MAX_ABSOLUTE_DEPTH, MAX_ABSOLUTE_DEPTH)
        output[name] = {"x": round(float(value["x"]), 6), "y": round(float(value["y"]), 6), "z": round(float(depth), 6)}
    return {"label": frame["label"], "progress": float(frame["progress"]), "joints": output}


def main() -> int:
    args = parse_args()
    source = json.loads(args.relative_motion.read_text(encoding="utf-8"))
    motion = source.get("motion", {})
    frames = motion.get("frames", [])
    if source.get("boundary") != "monocular_relative_pose_not_metric_3d" or len(frames) != 5:
        raise SystemExit("Input must be a five-phase single-view relative motion record")
    if [frame.get("label") for frame in frames] != ["준비", "딥", "상승", "릴리스", "팔로우스루"]:
        raise SystemExit("Input must use the audited shot phase order")
    output = {
        "version": 1,
        "state": "video_based_depth_limited_estimate_not_actual_3d",
        "boundary": "monocular_relative_pose_not_metric_3d",
        "sourceView": source.get("view", "front"),
        "shootingHandEstimate": args.hand,
        "phaseIndexes": source.get("phaseIndexes", []),
        "sourcePhaseTimestampsMs": source.get("phaseTimestampsMs", []),
        "inputQuality": source.get("inputQuality", {}),
        "depthTreatment": {
            "kind": "legacy_relative_depth_recentered_scaled_and_clamped",
            "depthScale": DEPTH_SCALE,
            "maxAbsoluteDepth": MAX_ABSOLUTE_DEPTH,
            "meaning": "Source-frame x/y is preserved; display depth is limited only to prevent distorted rotation. It is not metric depth, camera geometry, body measurement, or actual reconstructed 3D.",
        },
        "motion": {"id": args.id, "boundary": "monocular_relative_pose_not_metric_3d", "frames": [constrained_frame(frame) for frame in frames]},
        "productAdmission": "forbidden_for_recommendation_and_actual_3d_library",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"state": output["state"], "hand": args.hand, "phaseTimestampsMs": output["sourcePhaseTimestampsMs"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
