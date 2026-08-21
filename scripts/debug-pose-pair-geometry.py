"""Audit whether two MediaPipe pose sequences are a usable stereo pair.

This diagnostic does not invent camera matrices. It finds the best phase
correspondence, quantifies whether a single 2D affine warp explains each
matched skeleton (a warning sign for same/near-identical camera views), and
reports the MediaPipe image-landmark coordinate convention that the existing
triangulation pipeline receives.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np


RIGHT_WRIST = 16
LEFT_WRIST = 15
LEFT_HIP = 23
RIGHT_HIP = 24
LEFT_SHOULDER = 11
RIGHT_SHOULDER = 12


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--view-a", type=Path, required=True)
    parser.add_argument("--view-b", type=Path, required=True)
    parser.add_argument("--hand", choices=["right", "left"], default="right")
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def load(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    frames = payload.get("frames", [])
    if payload.get("boundary") != "monocular_relative_pose_not_metric_3d" or len(frames) < 5:
        raise ValueError(f"{path} is not a usable single-view pose sequence")
    if any(len(frame.get("landmarks", [])) != 33 for frame in frames):
        raise ValueError(f"{path} has incomplete landmark frames")
    return payload


def points(frame: dict[str, Any]) -> np.ndarray:
    return np.asarray([[float(item["x"]), float(item["y"])] for item in frame["landmarks"]], dtype=np.float32)


def scale(frame: dict[str, Any]) -> float:
    data = points(frame)
    shoulder_width = np.linalg.norm(data[LEFT_SHOULDER] - data[RIGHT_SHOULDER])
    hip_center = (data[LEFT_HIP] + data[RIGHT_HIP]) / 2
    neck = (data[LEFT_SHOULDER] + data[RIGHT_SHOULDER]) / 2
    torso = np.linalg.norm(neck - hip_center)
    return float(max(shoulder_width, torso, 1e-6))


def phase_anchor_index(frames: list[dict[str, Any]], hand: str) -> int:
    wrist = RIGHT_WRIST if hand == "right" else LEFT_WRIST
    # In MediaPipe image coordinates, smaller y means a higher screen position.
    return min(range(len(frames)), key=lambda index: float(frames[index]["landmarks"][wrist]["y"]))


def affine_residual(a: dict[str, Any], b: dict[str, Any]) -> float:
    source, target = points(a), points(b)
    matrix, _ = cv2.estimateAffinePartial2D(source, target, method=cv2.LMEDS)
    if matrix is None:
        return float("inf")
    predicted = cv2.transform(source.reshape(1, -1, 2), matrix).reshape(-1, 2)
    return float(np.median(np.linalg.norm(predicted - target, axis=1)) / scale(b))


def match_sequences(a_frames: list[dict[str, Any]], b_frames: list[dict[str, Any]], hand: str) -> tuple[list[dict[str, Any]], int, int]:
    a_release, b_release = phase_anchor_index(a_frames, hand), phase_anchor_index(b_frames, hand)
    candidates: list[tuple[float, int]] = []
    # The two clips can start at different times, so their release indices can differ.
    # Search only a two-frame tolerance around that release-derived offset. The previous
    # wide shift sweep could align a pre-release pose to a follow-through pose merely
    # because their projected skeletons looked affine-similar.
    for adjustment in range(-2, 3):
        residuals: list[float] = []
        for offset in range(-5, 6):
            a_index = a_release + offset
            b_index = b_release + offset + adjustment
            if 0 <= a_index < len(a_frames) and 0 <= b_index < len(b_frames):
                residuals.append(affine_residual(a_frames[a_index], b_frames[b_index]))
        if len(residuals) >= 5:
            candidates.append((float(np.median(residuals)), adjustment))
    if not candidates:
        raise ValueError("No overlapping phase window found")
    score, best_shift = min(candidates)
    matched: list[dict[str, Any]] = []
    for offset in range(-5, 6):
        a_index = a_release + offset
        b_index = b_release + offset + best_shift
        if 0 <= a_index < len(a_frames) and 0 <= b_index < len(b_frames):
            matched.append({
                "aIndex": a_index,
                "bIndex": b_index,
                "aTimestampMs": int(a_frames[a_index]["timestampMs"]),
                "bTimestampMs": int(b_frames[b_index]["timestampMs"]),
                "affineResidualBodyUnits": round(affine_residual(a_frames[a_index], b_frames[b_index]), 5),
            })
    return matched, a_release, b_release


def main() -> int:
    args = parse_args()
    a, b = load(args.view_a), load(args.view_b)
    a_frames, b_frames = a["frames"], b["frames"]
    matched, a_release, b_release = match_sequences(a_frames, b_frames, args.hand)
    residuals = [frame["affineResidualBodyUnits"] for frame in matched]
    median_residual = float(np.median(residuals))
    # This is a diagnostic classification, not a camera calibration result.
    view_diversity = "very_low_or_same_camera" if median_residual < 0.06 else "indeterminate_without_calibration"
    payload = {
        "version": 1,
        "kind": "single_view_pair_geometry_debug",
        "inputs": {"a": str(args.view_a), "b": str(args.view_b), "aFrames": len(a_frames), "bFrames": len(b_frames)},
        "coordinateConvention": {
            "x": "MediaPipe normalized image x (left to right)",
            "y": "MediaPipe normalized image y (top to bottom)",
            "z": "MediaPipe relative image landmark depth; not triangulated metric world z",
        },
        "releaseAnchor": {"aFrame": a_release, "bFrame": b_release, "hand": args.hand},
        "matchedFrames": matched,
        "diagnostic": {
            "medianAffineResidualBodyUnits": round(median_residual, 5),
            "viewDiversity": view_diversity,
            "triangulationReady": False,
            "blockingRequirements": ["known intrinsic and distortion parameters", "known relative camera R/t or calibrated projection matrices", "proven synchronized timestamps"],
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"releaseAnchor": payload["releaseAnchor"], "diagnostic": payload["diagnostic"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
