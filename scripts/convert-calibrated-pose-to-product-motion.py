"""Convert a passing calibrated multi-view pose sequence into a product motion.

Only ``calibrated_multi_view_3d`` output from the triangulation validator is
accepted. The emitted joint coordinates are display-normalized around the
pelvis while preserving the calibrated 3D joint geometry and source timestamps.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np


JOINT_MAP = {
    "head": 0, "neck": 0, "spine": 23, "pelvis": 23,
    "leftShoulder": 11, "leftElbow": 13, "leftWrist": 15,
    "rightShoulder": 12, "rightElbow": 14, "rightWrist": 16,
    "leftHip": 23, "leftKnee": 25, "leftAnkle": 27,
    "rightHip": 24, "rightKnee": 26, "rightAnkle": 28,
}
PHASES = ["준비", "딥", "상승", "릴리스", "팔로우스루"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path, required=True, help="Passing calibrated multi-view triangulation JSON.")
    parser.add_argument("--id", required=True)
    parser.add_argument("--hand", choices=["right", "left"], required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def vector(point: dict[str, float]) -> np.ndarray:
    return np.asarray([float(point["x"]), float(point["y"]), float(point["z"])], dtype=float)


def phase_indexes(frames: list[dict[str, Any]], hand: str) -> list[int]:
    wrist_index, hip_index = (16, 24) if hand == "right" else (15, 23)
    release = min(range(len(frames)), key=lambda index: float(frames[index]["landmarks"][wrist_index]["y"]))
    release = max(2, min(release, len(frames) - 3))
    dip_start = max(1, round(release * 0.55))
    dip = max(range(dip_start, release), key=lambda index: float(frames[index]["landmarks"][hip_index]["y"]))
    dip = min(max(1, dip), release - 2)
    rise = max(dip + 1, min(release - 1, round((dip + release) / 2)))
    follow = min(len(frames) - 1, max(release + 1, round(release + 0.28 * (len(frames) - 1 - release))))
    preparation = max(0, dip - max(1, release - dip) * 2)
    return [preparation, dip, rise, release, follow]


def normalized_joints(landmarks: list[dict[str, float]]) -> dict[str, dict[str, float]]:
    left_shoulder, right_shoulder = vector(landmarks[11]), vector(landmarks[12])
    left_hip, right_hip = vector(landmarks[23]), vector(landmarks[24])
    shoulder_mid, pelvis = (left_shoulder + right_shoulder) / 2, (left_hip + right_hip) / 2
    shoulder_width = max(1e-4, float(np.linalg.norm(right_shoulder - left_shoulder)))
    derived = {"neck": shoulder_mid, "spine": (shoulder_mid + pelvis) / 2, "pelvis": pelvis}
    joints: dict[str, dict[str, float]] = {}
    for name, index in JOINT_MAP.items():
        value = derived.get(name, vector(landmarks[index]))
        relative = (value - pelvis) / shoulder_width
        # Calibration camera axes follow image convention: x right, y down, z forward.
        joints[name] = {"x": round(float(relative[0]), 6), "y": round(float(-relative[1]), 6), "z": round(float(relative[2]), 6)}
    return joints


def main() -> int:
    args = parse_args()
    payload = json.loads(args.candidate.read_text(encoding="utf-8"))
    quality = payload.get("quality", {})
    if payload.get("boundary") != "calibrated_multi_view_3d" or payload.get("state") != "approved_private" or not quality.get("passed"):
        raise SystemExit("Input must be a passing calibrated multi-view triangulation record")
    frames = [frame for frame in payload.get("frames", []) if len(frame.get("landmarks", [])) == 33]
    if len(frames) < 12:
        raise SystemExit("At least 12 triangulated full-landmark frames are required")
    indexes = phase_indexes(frames, args.hand)
    motion = {
        "id": args.id,
        "boundary": "calibrated_multi_view_3d",
        "frames": [
            {"label": label, "progress": round(position / 4, 2), "joints": normalized_joints(frames[index]["landmarks"])}
            for position, (label, index) in enumerate(zip(PHASES, indexes))
        ],
    }
    output = {
        "version": 1,
        "state": "candidate_not_product_approved",
        "boundary": "calibrated_multi_view_3d",
        "sourcePhaseTimestampsMs": [int(frames[index]["timestampMs"]) for index in indexes],
        "phaseIndexes": indexes,
        "triangulationQuality": quality,
        "displayNormalization": "pelvis-origin, shoulder-width scale, calibrated camera y axis inverted for viewer",
        "motion": motion,
        "approval": "Requires source identity review plus visual motion audit before product admission.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"state": output["state"], "phaseTimestampsMs": output["sourcePhaseTimestampsMs"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
