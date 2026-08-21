"""Calibrate a fixed front/side camera pair from matching checkerboard images.

The output uses pixel-coordinate 3x4 projection matrices and is a required
input to calibrated multi-view triangulation. This tool never calibrates an
edited public video: it needs paired calibration-board frames from the exact
two physical cameras and their fixed geometry.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--front-dir", type=Path, required=True, help="Directory of front-camera checkerboard images.")
    parser.add_argument("--side-dir", type=Path, required=True, help="Directory of side-camera checkerboard images with matching filenames.")
    parser.add_argument("--columns", type=int, required=True, help="Checkerboard inner-corner columns.")
    parser.add_argument("--rows", type=int, required=True, help="Checkerboard inner-corner rows.")
    parser.add_argument("--square-size-m", type=float, required=True, help="Physical checker square length in metres.")
    parser.add_argument("--min-pairs", type=int, default=8)
    parser.add_argument("--max-rms-px", type=float, default=1.5)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def image_map(directory: Path) -> dict[str, Path]:
    if not directory.is_dir():
        raise SystemExit(f"Calibration directory not found: {directory}")
    return {path.stem: path for path in directory.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS}


def detect_corners(path: Path, pattern: tuple[int, int]) -> tuple[np.ndarray, tuple[int, int]] | None:
    image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if image is None:
        return None
    found, corners = cv2.findChessboardCornersSB(image, pattern, flags=cv2.CALIB_CB_NORMALIZE_IMAGE | cv2.CALIB_CB_EXHAUSTIVE)
    if not found or corners is None:
        found, corners = cv2.findChessboardCorners(image, pattern, flags=cv2.CALIB_CB_ADAPTIVE_THRESH | cv2.CALIB_CB_NORMALIZE_IMAGE)
        if found and corners is not None:
            corners = cv2.cornerSubPix(image, corners, (11, 11), (-1, -1), (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 1e-4))
    return (corners.astype(np.float32), (image.shape[1], image.shape[0])) if found and corners is not None else None


def projection(camera: np.ndarray, rotation: np.ndarray, translation: np.ndarray) -> list[list[float]]:
    return (camera @ np.hstack((rotation, translation.reshape(3, 1)))).tolist()


def main() -> int:
    args = parse_args()
    if args.columns < 2 or args.rows < 2 or args.square_size_m <= 0:
        raise SystemExit("Checkerboard dimensions and square size must be positive.")
    pattern = (args.columns, args.rows)
    front_files, side_files = image_map(args.front_dir), image_map(args.side_dir)
    shared = sorted(set(front_files) & set(side_files))
    if len(shared) < args.min_pairs:
        raise SystemExit(f"Need at least {args.min_pairs} matching image filenames; found {len(shared)}")
    board = np.zeros((args.columns * args.rows, 3), np.float32)
    board[:, :2] = np.mgrid[0:args.columns, 0:args.rows].T.reshape(-1, 2) * args.square_size_m
    object_points: list[np.ndarray] = []
    front_points: list[np.ndarray] = []
    side_points: list[np.ndarray] = []
    image_size: tuple[int, int] | None = None
    accepted: list[str] = []
    for stem in shared:
        front = detect_corners(front_files[stem], pattern)
        side = detect_corners(side_files[stem], pattern)
        if front is None or side is None or front[1] != side[1]:
            continue
        image_size = front[1]
        object_points.append(board.copy())
        front_points.append(front[0])
        side_points.append(side[0])
        accepted.append(stem)
    if image_size is None or len(accepted) < args.min_pairs:
        raise SystemExit(f"Only {len(accepted)} paired checkerboard detections passed; need {args.min_pairs}")
    rms_front, camera_front, distortion_front, _, _ = cv2.calibrateCamera(object_points, front_points, image_size, None, None)
    rms_side, camera_side, distortion_side, _, _ = cv2.calibrateCamera(object_points, side_points, image_size, None, None)
    stereo_rms, _, _, _, _, rotation, translation, _, _ = cv2.stereoCalibrate(
        object_points, front_points, side_points, camera_front, distortion_front, camera_side, distortion_side, image_size,
        flags=cv2.CALIB_FIX_INTRINSIC,
        criteria=(cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 1e-6),
    )
    identity = np.eye(3, dtype=float)
    zero = np.zeros(3, dtype=float)
    passed = max(float(rms_front), float(rms_side), float(stereo_rms)) <= args.max_rms_px
    payload = {
        "version": 1,
        "kind": "fixed_dual_camera_checkerboard_calibration",
        "projectionCoordinateSystem": "pixels",
        "imageSizes": {"front": list(image_size), "side": list(image_size)},
        "checkerboard": {"innerCorners": [args.columns, args.rows], "squareSizeM": args.square_size_m, "acceptedPairs": accepted},
        "projectionMatrices": {"front": projection(camera_front, identity, zero), "side": projection(camera_side, rotation, translation)},
        "normalizedProjectionMatrices": {"front": np.hstack((identity, zero.reshape(3, 1))).tolist(), "side": np.hstack((rotation, translation.reshape(3, 1))).tolist()},
        "intrinsics": {"front": camera_front.tolist(), "side": camera_side.tolist()},
        "distortion": {"front": distortion_front.reshape(-1).tolist(), "side": distortion_side.reshape(-1).tolist()},
        "relativePose": {"sideFromFrontRotation": rotation.tolist(), "sideFromFrontTranslation": translation.reshape(-1).tolist()},
        "quality": {"passed": passed, "frontRmsPx": round(float(rms_front), 5), "sideRmsPx": round(float(rms_side), 5), "stereoRmsPx": round(float(stereo_rms), 5), "maxRmsPx": args.max_rms_px, "pairedBoards": len(accepted)},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({"state": "calibrated" if passed else "rejected", "quality": payload["quality"]}))
    return 0 if passed else 2


if __name__ == "__main__":
    raise SystemExit(main())
