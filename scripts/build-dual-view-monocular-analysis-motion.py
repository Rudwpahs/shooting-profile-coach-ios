"""Build a phase-aligned, dual-view Curry display analysis.

This is a visual blend, not triangulation. It uses front-view x/y and the
mirrored side-view horizontal cue as limited display depth at the same semantic
shot phase. It never produces actual/calibrated 3D or a recommendation asset.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np


DEPTH_SCALE = 0.58
MAX_ABSOLUTE_DEPTH = 0.68
MIRROR_NAME = {
    "leftShoulder": "rightShoulder", "leftElbow": "rightElbow", "leftWrist": "rightWrist",
    "rightShoulder": "leftShoulder", "rightElbow": "leftElbow", "rightWrist": "leftWrist",
    "leftHip": "rightHip", "leftKnee": "rightKnee", "leftAnkle": "rightAnkle",
    "rightHip": "leftHip", "rightKnee": "leftKnee", "rightAnkle": "leftAnkle",
    "head": "head", "neck": "neck", "spine": "spine", "pelvis": "pelvis",
}
PHASES = ["준비", "딥", "상승", "릴리스", "팔로우스루"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--front-motion", type=Path, required=True)
    parser.add_argument("--side-motion", type=Path, required=True)
    parser.add_argument("--id", required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def load(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    frames = payload.get("motion", {}).get("frames", [])
    if payload.get("boundary") != "monocular_relative_pose_not_metric_3d" or [frame.get("label") for frame in frames] != PHASES:
        raise ValueError(f"Expected audited five-phase single-view motion: {path}")
    return payload


def side_depth_for(front_name: str, side_joints: dict[str, dict[str, float]]) -> float:
    side_name = MIRROR_NAME[front_name]
    left = side_joints["leftShoulder"]["x"]
    right = side_joints["rightShoulder"]["x"]
    shoulder_mid = (float(left) + float(right)) / 2
    shoulder_width = max(abs(float(left) - float(right)), 1e-6)
    raw = (float(side_joints[side_name]["x"]) - shoulder_mid) / shoulder_width
    return float(np.clip(raw * DEPTH_SCALE, -MAX_ABSOLUTE_DEPTH, MAX_ABSOLUTE_DEPTH))


def blend_frame(front: dict[str, Any], side: dict[str, Any]) -> dict[str, Any]:
    front_joints = front["joints"]
    side_joints = side["joints"]
    joints = {
        name: {"x": round(float(point["x"]), 6), "y": round(float(point["y"]), 6), "z": round(side_depth_for(name, side_joints), 6)}
        for name, point in front_joints.items()
    }
    return {"label": front["label"], "progress": float(front["progress"]), "joints": joints}


def main() -> int:
    args = parse_args()
    front, side = load(args.front_motion), load(args.side_motion)
    front_frames = front["motion"]["frames"]
    side_frames = side["motion"]["frames"]
    output = {
        "version": 1,
        "state": "dual_view_phase_aligned_estimate_not_actual_3d",
        "boundary": "monocular_relative_pose_not_metric_3d",
        "shootingHandEstimate": "right",
        "phaseAlignment": {
            "method": "semantic_shot_phase_pairing",
            "frontPhaseIndexes": front.get("phaseIndexes", []),
            "frontPhaseTimestampsMs": front.get("phaseTimestampsMs", []),
            "sidePhaseIndexes": side.get("phaseIndexes", []),
            "sidePhaseTimestampsMs": side.get("phaseTimestampsMs", []),
            "sideMirroredForRightHand": True,
            "meaning": "Each view contributes the same named shot phase; this is not same-frame camera synchronization.",
        },
        "inputQuality": {"front": front.get("inputQuality", {}), "side": side.get("inputQuality", {})},
        "depthTreatment": {
            "kind": "mirrored_side_view_horizontal_cue",
            "depthScale": DEPTH_SCALE,
            "maxAbsoluteDepth": MAX_ABSOLUTE_DEPTH,
            "meaning": "Front source supplies x/y; mirrored side source supplies limited display depth at each named shot phase. This is a visual blend, not measured depth or reconstructed 3D.",
        },
        "motion": {
            "id": args.id,
            "boundary": "monocular_relative_pose_not_metric_3d",
            "frames": [blend_frame(front_frame, side_frame) for front_frame, side_frame in zip(front_frames, side_frames)],
        },
        "productAdmission": "forbidden_for_recommendation_and_actual_3d_library",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"state": output["state"], "phaseAlignment": output["phaseAlignment"], "depthTreatment": output["depthTreatment"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
