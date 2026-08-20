"""Render measured C3D markers as a sparse 3D audit sheet.

This visual aid is for source QA only. The display never adds inferred joints or
claims that a candidate frame is a verified basketball shot.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import ezc3d
import matplotlib.pyplot as plt
import numpy as np


JOINT_MARKERS = {
    "head": (":RFHD", ":LFHD", ":RBHD", ":LBHD"),
    "neck": (":CLAV",),
    "r_shoulder": (":RSHO",), "l_shoulder": (":LSHO",),
    "r_elbow": (":RELB",), "l_elbow": (":LELB",),
    "r_wrist": (":RWRA", ":RWRB"), "l_wrist": (":LWRA", ":LWRB"),
    "spine": (":T10",), "pelvis": (":RBWT", ":LBWT"),
    "r_knee": (":RKNE",), "l_knee": (":LKNE",),
    "r_ankle": (":RANK",), "l_ankle": (":LANK",),
    "r_toe": (":RTOE",), "l_toe": (":LTOE",),
}
EDGES = [("head", "neck"), ("neck", "r_shoulder"), ("neck", "l_shoulder"), ("neck", "spine"), ("spine", "pelvis"), ("r_shoulder", "r_elbow"), ("r_elbow", "r_wrist"), ("l_shoulder", "l_elbow"), ("l_elbow", "l_wrist"), ("pelvis", "r_knee"), ("r_knee", "r_ankle"), ("r_ankle", "r_toe"), ("pelvis", "l_knee"), ("l_knee", "l_ankle"), ("l_ankle", "l_toe")]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--center-frame", type=int, required=True, help="C3D source frame number")
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    c3d = ezc3d.c3d(str(args.input))
    points = np.asarray(c3d["data"]["points"], dtype=float)
    labels = [str(label) for label in c3d["parameters"]["POINT"]["LABELS"]["value"]]
    first_frame = int(c3d["header"]["points"]["first_frame"])
    center = args.center_frame - first_frame
    offsets = [-72, -36, 0, 36, 72]
    resolved: dict[str, list[int]] = {}
    for joint, suffixes in JOINT_MARKERS.items():
        resolved[joint] = [next(index for index, label in enumerate(labels) if label.strip().split(":")[-1] == suffix.removeprefix(":")) for suffix in suffixes]

    figure = plt.figure(figsize=(15, 3.4))
    for panel, offset in enumerate(offsets, start=1):
        frame = min(max(center + offset, 0), points.shape[2] - 1)
        joints = {joint: np.nanmean(points[:3, indexes, frame], axis=1) for joint, indexes in resolved.items()}
        axes = figure.add_subplot(1, len(offsets), panel, projection="3d")
        for left, right in EDGES:
            line = np.stack((joints[left], joints[right]))
            axes.plot(line[:, 0], line[:, 1], line[:, 2], color="#f97316", linewidth=2.6)
        xyz = np.stack(list(joints.values()))
        axes.scatter(xyz[:, 0], xyz[:, 1], xyz[:, 2], color="#1e3a5f", s=18)
        axes.set_title(f"frame {first_frame + frame}", fontsize=9)
        axes.view_init(elev=13, azim=-77)
        axes.set_box_aspect((0.7, 0.7, 1.7))
        axes.set_xlim(-240, 130); axes.set_ylim(220, 590); axes.set_zlim(0, 1750)
        axes.set_axis_off()
    figure.suptitle("CMU anonymous optical motion capture — measured markers", fontsize=12, color="#1e3a5f")
    figure.tight_layout()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    figure.savefig(args.output, dpi=180, bbox_inches="tight")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
