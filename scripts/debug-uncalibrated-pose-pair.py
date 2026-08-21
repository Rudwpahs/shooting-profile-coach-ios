"""Quantify how far two matched pose sequences get without camera calibration.

For each matched frame this script estimates a fundamental matrix from the 33
2D landmarks, derives a normalized essential-matrix pose, triangulates points,
and reports epipolar/reprojection error plus variation of recovered camera
direction across time. It is a diagnostic only: per-frame pose recovery cannot
replace one fixed calibrated camera rig for product-quality metric 3D.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pair-debug", type=Path, required=True, help="Output from debug-pose-pair-geometry.py")
    parser.add_argument("--view-a", type=Path, required=True)
    parser.add_argument("--view-b", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def load_frames(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload["frames"]


def image_points(frame: dict[str, Any]) -> np.ndarray:
    return np.asarray([[float(item["x"]), float(item["y"])] for item in frame["landmarks"]], dtype=np.float64)


def centered_normalized(points: np.ndarray) -> np.ndarray:
    # This is deliberately only a unit focal-length proxy, not a measured K.
    return points - np.asarray([0.5, 0.5], dtype=float)


def rotation_angle_deg(rotation: np.ndarray) -> float:
    return float(np.degrees(np.arccos(np.clip((np.trace(rotation) - 1) / 2, -1.0, 1.0))))


def main() -> int:
    args = parse_args()
    pair = json.loads(args.pair_debug.read_text(encoding="utf-8"))
    a_frames, b_frames = load_frames(args.view_a), load_frames(args.view_b)
    results: list[dict[str, Any]] = []
    directions: list[np.ndarray] = []
    rotations: list[np.ndarray] = []
    all_a: list[np.ndarray] = []
    all_b: list[np.ndarray] = []
    for matched in pair.get("matchedFrames", []):
        a = centered_normalized(image_points(a_frames[matched["aIndex"]]))
        b = centered_normalized(image_points(b_frames[matched["bIndex"]]))
        all_a.append(a)
        all_b.append(b)
        fundamental, mask = cv2.findFundamentalMat(a, b, cv2.FM_RANSAC, 0.003, 0.99)
        if fundamental is None or fundamental.shape != (3, 3):
            results.append({"aIndex": matched["aIndex"], "bIndex": matched["bIndex"], "state": "fundamental_matrix_failed"})
            continue
        essential = fundamental  # K proxy is identity after centered normalization.
        try:
            inliers, rotation, translation, pose_mask = cv2.recoverPose(essential, a, b, np.eye(3))
        except cv2.error:
            results.append({"aIndex": matched["aIndex"], "bIndex": matched["bIndex"], "state": "pose_recovery_failed"})
            continue
        direction = translation.reshape(3) / max(np.linalg.norm(translation), 1e-9)
        inlier_mask = pose_mask.reshape(-1).astype(bool)
        if int(np.count_nonzero(inlier_mask)) < 8:
            results.append({"aIndex": matched["aIndex"], "bIndex": matched["bIndex"], "state": "too_few_pose_inliers", "inliers": int(np.count_nonzero(inlier_mask))})
            continue
        projection_a = np.hstack((np.eye(3), np.zeros((3, 1))))
        projection_b = np.hstack((rotation, translation))
        homogeneous = cv2.triangulatePoints(projection_a, projection_b, a[inlier_mask].T, b[inlier_mask].T)
        xyz = (homogeneous[:3] / homogeneous[3]).T
        repro_a = xyz[:, :2] / xyz[:, 2:3]
        b_camera = (rotation @ xyz.T + translation).T
        repro_b = b_camera[:, :2] / b_camera[:, 2:3]
        repro_error = np.concatenate([np.linalg.norm(repro_a - a[inlier_mask], axis=1), np.linalg.norm(repro_b - b[inlier_mask], axis=1)])
        directions.append(direction)
        rotations.append(rotation)
        results.append({
            "aIndex": matched["aIndex"], "bIndex": matched["bIndex"], "state": "recovered_with_proxy_intrinsics",
            "inliers": int(inliers), "medianProxyReprojectionError": round(float(np.median(repro_error)), 6),
            "translationDirection": [round(float(value), 5) for value in direction], "rotationAngleDeg": round(rotation_angle_deg(rotation), 3),
        })
    direction_spread: float | None = None
    rotation_spread: float | None = None
    if len(directions) >= 2:
        mean_direction = np.mean(np.asarray(directions), axis=0)
        mean_direction /= max(np.linalg.norm(mean_direction), 1e-9)
        direction_spread = float(np.degrees(np.max(np.arccos(np.clip(np.asarray(directions) @ mean_direction, -1, 1)))))
        base_rotation = rotations[0]
        rotation_spread = max(rotation_angle_deg(base_rotation.T @ rotation) for rotation in rotations[1:])
    stable = bool(direction_spread is not None and rotation_spread is not None and direction_spread <= 5 and rotation_spread <= 5)
    combined_a = np.concatenate(all_a) if all_a else np.empty((0, 2))
    combined_b = np.concatenate(all_b) if all_b else np.empty((0, 2))
    global_fundamental, global_mask = cv2.findFundamentalMat(combined_a, combined_b, cv2.FM_RANSAC, 0.003, 0.99)
    global_inliers = int(np.count_nonzero(global_mask)) if global_mask is not None else 0
    global_ratio = global_inliers / max(len(combined_a), 1)
    global_state = "fixed_fundamental_matrix_failed"
    if global_fundamental is not None and global_fundamental.shape == (3, 3):
        global_state = "fixed_fundamental_matrix_fitted"
    fixed_pair_supported = bool(global_state == "fixed_fundamental_matrix_fitted" and global_ratio >= 0.72)
    payload = {
        "version": 1,
        "kind": "uncalibrated_epipolar_debug",
        "assumptions": ["unit focal-length proxy", "principal point at normalized image center", "each 33-landmark body frame supplies correspondences"],
        "results": results,
        "fixedCameraConsistency": {"translationDirectionSpreadDeg": round(direction_spread, 4) if direction_spread is not None else None, "rotationSpreadDeg": round(rotation_spread, 4) if rotation_spread is not None else None, "stableUnderProxy": stable},
        "globalEpipolarFit": {"state": global_state, "correspondences": int(len(combined_a)), "inliers": global_inliers, "inlierRatio": round(global_ratio, 4), "supportsOneFixedCameraPairUnderProxy": fixed_pair_supported},
        "productDecision": "not_metric_3d_without_real_K_distortion_R_t_sync",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"fixedCameraConsistency": payload["fixedCameraConsistency"], "productDecision": payload["productDecision"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
