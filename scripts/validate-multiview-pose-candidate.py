"""Validate and triangulate synchronized multi-view MediaPipe pose candidates.

The command intentionally refuses to infer calibration or synchronization. It
only upgrades a candidate when at least two timestamp-aligned local pose JSONs
and their precomputed projection matrices are provided. This prevents a
single-view or unsynchronized player video from being mislabeled as 3D.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np


def parse_view(value: str) -> tuple[str, Path]:
    try:
        label, path = value.split("=", 1)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("--view must use label=/absolute/path/candidate.json") from exc
    return label, Path(path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--view", type=parse_view, action="append", required=True, help="Repeat for each synchronized camera candidate.")
    parser.add_argument("--calibration", type=Path, required=True, help="Projection matrices in the normalized-image coordinate convention.")
    parser.add_argument("--provenance", type=Path, required=True, help="Non-product audit record proving authorized source media and physical camera baseline.")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--sync-tolerance-ms", type=int, default=34)
    parser.add_argument("--max-reprojection-error", type=float, default=0.035)
    return parser.parse_args()


def load_candidate(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("boundary") != "monocular_relative_pose_not_metric_3d":
        raise ValueError(f"{path} is not a single-view relative pose candidate")
    if not payload.get("quality", {}).get("passed"):
        raise ValueError(f"{path} did not pass its single-view quality gate")
    frames = payload.get("frames") or []
    if len(frames) < 5:
        raise ValueError(f"{path} has too few pose frames")
    return payload


def load_provenance(path: Path, expected_views: set[str]) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("captureKind") != "physically_separated_synchronized_cameras":
        raise ValueError("provenance must prove physically separated synchronized cameras; 360 virtual crops are not accepted")
    if payload.get("sourceMediaAuthorized") is not True:
        raise ValueError("provenance must confirm source media authorization")
    if set(payload.get("views", [])) != expected_views:
        raise ValueError("provenance views must exactly match submitted candidates")
    if not isinstance(payload.get("assetHashes"), dict) or set(payload["assetHashes"]) != expected_views:
        raise ValueError("provenance must include a media hash for every submitted view")
    if not all(isinstance(value, str) and len(value) >= 32 for value in payload["assetHashes"].values()):
        raise ValueError("provenance asset hashes are incomplete")
    return payload


def closest_frame(frames: list[dict[str, Any]], timestamp_ms: int, tolerance_ms: int) -> dict[str, Any] | None:
    closest = min(frames, key=lambda frame: abs(int(frame["timestampMs"]) - timestamp_ms))
    return closest if abs(int(closest["timestampMs"]) - timestamp_ms) <= tolerance_ms else None


def project(matrix: np.ndarray, point: np.ndarray) -> np.ndarray:
    homogeneous = matrix @ np.append(point, 1.0)
    return homogeneous[:2] / homogeneous[2]


def triangulate(points: list[np.ndarray], matrices: list[np.ndarray]) -> np.ndarray:
    rows: list[np.ndarray] = []
    for point, matrix in zip(points, matrices):
        rows.extend([point[0] * matrix[2] - matrix[0], point[1] * matrix[2] - matrix[1]])
    _, _, vt = np.linalg.svd(np.stack(rows))
    homogeneous = vt[-1]
    return homogeneous[:3] / homogeneous[3]


def main() -> int:
    args = parse_args()
    if len(args.view) < 2:
        raise SystemExit("At least two synchronized camera candidates are required")
    if args.sync_tolerance_ms < 0 or args.sync_tolerance_ms > 100:
        raise SystemExit("sync tolerance must be 0-100 ms")

    candidates = {label: load_candidate(path) for label, path in args.view}
    provenance = load_provenance(args.provenance, set(candidates))
    calibration = json.loads(args.calibration.read_text(encoding="utf-8"))
    matrices: dict[str, np.ndarray] = {}
    for label in candidates:
        raw = calibration.get("projectionMatrices", {}).get(label)
        matrix = np.asarray(raw, dtype=float) if raw is not None else np.empty((0, 0))
        if matrix.shape != (3, 4) or not np.isfinite(matrix).all():
            raise SystemExit(f"Missing valid 3x4 projection matrix for '{label}'")
        matrices[label] = matrix

    anchor_label = next(iter(candidates))
    anchor_frames = candidates[anchor_label]["frames"]
    output_frames: list[dict[str, Any]] = []
    errors: list[float] = []
    matched = 0
    for anchor in anchor_frames:
        timestamp = int(anchor["timestampMs"])
        synchronized = {anchor_label: anchor}
        for label, candidate in candidates.items():
            if label == anchor_label:
                continue
            frame = closest_frame(candidate["frames"], timestamp, args.sync_tolerance_ms)
            if frame is None:
                break
            synchronized[label] = frame
        if len(synchronized) != len(candidates):
            continue
        if any(len(frame["landmarks"]) != 33 for frame in synchronized.values()):
            continue
        landmarks: list[dict[str, float]] = []
        valid_frame = True
        for joint in range(33):
            observations = [np.asarray([synchronized[label]["landmarks"][joint]["x"], synchronized[label]["landmarks"][joint]["y"]], dtype=float) for label in synchronized]
            view_matrices = [matrices[label] for label in synchronized]
            point = triangulate(observations, view_matrices)
            reprojection = [float(np.linalg.norm(project(matrix, point) - observed)) for matrix, observed in zip(view_matrices, observations)]
            if not np.isfinite(point).all() or max(reprojection) > args.max_reprojection_error:
                valid_frame = False
                break
            errors.extend(reprojection)
            landmarks.append({"x": float(point[0]), "y": float(point[1]), "z": float(point[2]), "visibility": 1.0})
        if valid_frame:
            output_frames.append({"timestampMs": timestamp, "landmarks": landmarks})
            matched += 1

    ratio = matched / max(len(anchor_frames), 1)
    mean_error = float(np.mean(errors)) if errors else float("inf")
    reasons: list[str] = []
    if len(output_frames) < 5:
        reasons.append("too_few_triangulated_frames")
    if ratio < 0.72:
        reasons.append("insufficient_synchronized_frames")
    if not np.isfinite(mean_error) or mean_error > args.max_reprojection_error:
        reasons.append("reprojection_error_exceeded")
    quality = {
        "passed": not reasons,
        "source": "calibrated_multi_view_triangulation",
        "synchronizedFrameRatio": round(ratio, 3),
        "meanReprojectionError": round(mean_error, 5) if np.isfinite(mean_error) else None,
        "cameraCount": len(candidates),
        "reasons": reasons,
    }
    payload = {
        "version": 1,
        "boundary": "calibrated_multi_view_3d",
        "state": "approved_private" if quality["passed"] else "rejected",
        "source": {"kind": provenance["captureKind"], "identity": "not_product_exposed", "videoStored": False, "views": list(candidates), "provenanceHashCount": len(provenance["assetHashes"])},
        "frames": output_frames,
        "quality": quality,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"state": payload["state"], "triangulatedFrames": len(output_frames), "quality": quality}, ensure_ascii=False))
    return 0 if quality["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
