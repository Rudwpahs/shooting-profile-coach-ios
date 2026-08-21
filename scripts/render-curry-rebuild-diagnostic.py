"""Render the source-faithful Curry display asset for non-product visual auditing."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

BONES = [
    ("head", "neck"), ("neck", "spine"), ("spine", "pelvis"),
    ("neck", "leftShoulder"), ("leftShoulder", "leftElbow"), ("leftElbow", "leftWrist"),
    ("neck", "rightShoulder"), ("rightShoulder", "rightElbow"), ("rightElbow", "rightWrist"),
    ("pelvis", "leftHip"), ("leftHip", "leftKnee"), ("leftKnee", "leftAnkle"),
    ("pelvis", "rightHip"), ("rightHip", "rightKnee"), ("rightKnee", "rightAnkle"),
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    asset = json.loads(options.input.read_text(encoding="utf-8"))
    frames = asset["motion"]["frames"]
    yaw = np.deg2rad(32.0)
    all_points = [point for frame in frames for point in frame["joints"].values()]
    ground_y = min(point["y"] for frame in frames for point in (frame["joints"]["leftAnkle"], frame["joints"]["rightAnkle"]))
    height = max(point["y"] for point in all_points) - ground_y
    display_scale = min(3.15, 2.38 / max(height, 0.01))
    figure, axes = plt.subplots(1, len(frames), figsize=(15, 4), facecolor="#0B1623")
    for axis, frame in zip(axes, frames):
        joints = frame["joints"]
        for parent, child in BONES:
            active = parent.startswith("left") or child.startswith("left")
            axis.plot(
                [(-joints[parent]["x"] * np.cos(yaw) - joints[parent]["z"] * np.sin(yaw)) * display_scale, (-joints[child]["x"] * np.cos(yaw) - joints[child]["z"] * np.sin(yaw)) * display_scale],
                [(joints[parent]["y"] - ground_y) * display_scale, (joints[child]["y"] - ground_y) * display_scale],
                color="#F97316" if active else "#AABDCB",
                linewidth=4.2 if active else 3.2,
                solid_capstyle="round",
            )
        for joint, point in joints.items():
            axis.scatter((-point["x"] * np.cos(yaw) - point["z"] * np.sin(yaw)) * display_scale, (point["y"] - ground_y) * display_scale, s=38 if joint != "head" else 95, color="#F97316" if joint.startswith("left") else "#E7EDF1", zorder=3)
        axis.set_title(frame["label"], color="#F5F1E8", fontsize=11, fontweight="bold", pad=10)
        axis.set_aspect("equal")
        axis.set_xlim(-2.05, 2.05)
        axis.set_ylim(-0.1, 2.55)
        axis.set_facecolor("#0B1623")
        axis.axis("off")
    figure.suptitle("CURRY · MOTIONBERT IMAGE-LIFTED DISPLAY (camera-relative depth)", color="#F5F1E8", fontsize=14, fontweight="bold")
    figure.tight_layout()
    options.output.parent.mkdir(parents=True, exist_ok=True)
    figure.savefig(options.output, dpi=180, bbox_inches="tight", facecolor=figure.get_facecolor())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
