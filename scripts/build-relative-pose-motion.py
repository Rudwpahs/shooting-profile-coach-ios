"""Build a five-phase relative pose motion from one local MediaPipe candidate.

This tool is intentionally single-view. It preserves the
``monocular_relative_pose_not_metric_3d`` boundary and emits a review wrapper,
not an approved calibrated 3D player model.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np


JOINT_MAP = {
    "head": 0, "neck": 0, "spine": 23, "pelvis": 23,
    "leftShoulder": 11, "leftElbow": 13, "leftWrist": 15,
    "rightShoulder": 12, "rightElbow": 14, "rightWrist": 16,
    "leftHip": 23, "leftKnee": 25, "leftAnkle": 27,
    "rightHip": 24, "rightKnee": 26, "rightAnkle": 28,
}
PHASES = ["준비", "딥", "상승", "릴리스", "팔로우스루"]
EDGES = [(11, 13), (13, 15), (12, 14), (14, 16), (11, 12), (11, 23), (12, 24), (23, 24), (23, 25), (25, 27), (24, 26), (26, 28)]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--view", choices=["front", "side"], required=True)
    parser.add_argument("--id", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--audit", type=Path, required=True)
    return parser.parse_args()


def midpoint(a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    return {axis: (float(a[axis]) + float(b[axis])) / 2 for axis in ("x", "y", "z")}


def normalized_joints(landmarks: list[dict[str, float]]) -> dict[str, dict[str, float]]:
    shoulder_mid = midpoint(landmarks[11], landmarks[12])
    hip_mid = midpoint(landmarks[23], landmarks[24])
    shoulder_width = max(0.08, np.hypot(float(landmarks[11]["x"]) - float(landmarks[12]["x"]), float(landmarks[11]["y"]) - float(landmarks[12]["y"])))
    derived = {"neck": shoulder_mid, "spine": midpoint(shoulder_mid, hip_mid), "pelvis": hip_mid}
    joints: dict[str, dict[str, float]] = {}
    for name, index in JOINT_MAP.items():
        point = derived.get(name, landmarks[index])
        joints[name] = {
            "x": round((float(point["x"]) - shoulder_mid["x"]) / shoulder_width, 6),
            "y": round(-(float(point["y"]) - shoulder_mid["y"]) / shoulder_width, 6),
            "z": round(float(point["z"]) / shoulder_width, 6),
        }
    return joints


def phase_indexes(frames: list[dict[str, Any]]) -> tuple[str, list[int]]:
    right_peak = min(float(frame["landmarks"][16]["y"]) for frame in frames)
    left_peak = min(float(frame["landmarks"][15]["y"]) for frame in frames)
    hand, wrist_index, hip_index = ("right", 16, 24) if right_peak <= left_peak else ("left", 15, 23)
    release = min(range(len(frames)), key=lambda index: float(frames[index]["landmarks"][wrist_index]["y"]))
    release = max(2, min(release, len(frames) - 3))
    dip = max(range(release), key=lambda index: float(frames[index]["landmarks"][hip_index]["y"]))
    dip = min(max(1, dip), release - 2)
    rise = max(dip + 1, min(release - 1, round((dip + release) / 2)))
    follow = min(len(frames) - 1, max(release + 1, round(release + 0.28 * (len(frames) - 1 - release))))
    return hand, [0, dip, rise, release, follow]


def draw_pose(image: np.ndarray, landmarks: list[dict[str, float]], label: str, timestamp_ms: int) -> np.ndarray:
    height, width = image.shape[:2]
    for start, end in EDGES:
        a, b = landmarks[start], landmarks[end]
        cv2.line(image, (round(float(a["x"]) * width), round(float(a["y"]) * height)), (round(float(b["x"]) * width), round(float(b["y"]) * height)), (24, 115, 245), 4, cv2.LINE_AA)
    for landmark in landmarks[11:29]:
        cv2.circle(image, (round(float(landmark["x"]) * width), round(float(landmark["y"]) * height)), 5, (255, 255, 255), -1, cv2.LINE_AA)
    cv2.rectangle(image, (0, 0), (width, 56), (17, 45, 70), -1)
    cv2.putText(image, f"{label}  {timestamp_ms}ms", (16, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)
    return image


def audit_sheet(video_path: Path, frames: list[dict[str, Any]], indexes: list[int], output: Path) -> None:
    capture = cv2.VideoCapture(str(video_path))
    panels: list[np.ndarray] = []
    try:
        for label, index in zip(PHASES, indexes):
            timestamp = int(frames[index]["timestampMs"])
            capture.set(cv2.CAP_PROP_POS_MSEC, timestamp)
            ok, image = capture.read()
            if not ok:
                raise RuntimeError(f"Cannot read source video at {timestamp}ms")
            panel = draw_pose(image, frames[index]["landmarks"], label, timestamp)
            scale = min(360 / panel.shape[1], 560 / panel.shape[0])
            panels.append(cv2.resize(panel, (round(panel.shape[1] * scale), round(panel.shape[0] * scale))))
    finally:
        capture.release()
    gap = 8
    target_height = max(panel.shape[0] for panel in panels)
    padded = [cv2.copyMakeBorder(panel, 0, target_height - panel.shape[0], 0, 0, cv2.BORDER_CONSTANT, value=(244, 247, 251)) for panel in panels]
    sheet = np.full((target_height, sum(panel.shape[1] for panel in padded) + gap * (len(padded) - 1), 3), (244, 247, 251), dtype=np.uint8)
    cursor = 0
    for panel in padded:
        sheet[:, cursor: cursor + panel.shape[1]] = panel
        cursor += panel.shape[1] + gap
    output.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(output), sheet):
        raise RuntimeError("Unable to write audit image")


def main() -> int:
    args = parse_args()
    payload = json.loads(args.candidate.read_text(encoding="utf-8"))
    if payload.get("boundary") != "monocular_relative_pose_not_metric_3d" or not payload.get("quality", {}).get("passed"):
        raise SystemExit("Input must be a passing single-view relative pose candidate.")
    frames = [frame for frame in payload.get("frames", []) if len(frame.get("landmarks", [])) == 33]
    if len(frames) < 12:
        raise SystemExit("At least 12 full landmark frames are required.")
    hand, indexes = phase_indexes(frames)
    motion = {
        "id": args.id,
        "boundary": "monocular_relative_pose_not_metric_3d",
        "frames": [
            {"label": label, "progress": round(position / 4, 2), "joints": normalized_joints(frames[index]["landmarks"])}
            for position, (label, index) in enumerate(zip(PHASES, indexes))
        ],
    }
    output = {
        "version": 1,
        "state": "candidate_not_product_approved",
        "view": args.view,
        "shootingHandEstimate": hand,
        "boundary": "monocular_relative_pose_not_metric_3d",
        "phaseIndexes": indexes,
        "phaseTimestampsMs": [int(frames[index]["timestampMs"]) for index in indexes],
        "inputQuality": payload["quality"],
        "motion": motion,
        "approval": "Requires source identity review and an explicit product admission decision; this is not calibrated 3D.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    audit_sheet(args.video, frames, indexes, args.audit)
    print(json.dumps({"state": output["state"], "view": args.view, "shootingHandEstimate": hand, "phaseTimestampsMs": output["phaseTimestampsMs"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
