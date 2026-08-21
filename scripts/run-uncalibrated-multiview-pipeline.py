"""Run one fixed-F-gated uncalibrated reconstruction pipeline for a pose pair.

The output is deliberately review-only projective 3D. It is never metric 3D
and is not a product motion admission path; calibrated multi-view processing
remains the only route to runtime 3D.
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
LEFT_SHOULDER = 11
RIGHT_SHOULDER = 12
LEFT_HIP = 23
RIGHT_HIP = 24


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pair-id", required=True)
    parser.add_argument("--view-a", type=Path, required=True)
    parser.add_argument("--view-b", type=Path, required=True)
    parser.add_argument("--hand", choices=["right", "left"], default="right")
    parser.add_argument("--alignment", type=Path, help="Optional release-pinned correspondence hypothesis from synchronize-pose-pair-multisignal.py")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--min-global-f-inlier-ratio", type=float, default=0.72)
    parser.add_argument("--min-frame-joint-inliers", type=int, default=20)
    parser.add_argument("--min-frame-ratio", type=float, default=0.72)
    parser.add_argument("--max-canonical-reprojection-error", type=float, default=0.02)
    return parser.parse_args()


def load_candidate(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("boundary") != "monocular_relative_pose_not_metric_3d":
        raise ValueError(f"{path} is not a single-view relative pose sequence")
    if not payload.get("quality", {}).get("passed"):
        raise ValueError(f"{path} did not pass single-view landmark quality")
    if len(payload.get("frames", [])) < 5:
        raise ValueError(f"{path} has fewer than five pose frames")
    if any(len(frame.get("landmarks", [])) != 33 for frame in payload["frames"]):
        raise ValueError(f"{path} contains incomplete landmarks")
    return payload


def points(frame: dict[str, Any]) -> np.ndarray:
    return np.asarray([[float(item["x"]), float(item["y"])] for item in frame["landmarks"]], dtype=np.float64)


def normalized_pose(frame: dict[str, Any]) -> np.ndarray:
    raw = points(frame)
    hip = (raw[LEFT_HIP] + raw[RIGHT_HIP]) / 2
    shoulder = (raw[LEFT_SHOULDER] + raw[RIGHT_SHOULDER]) / 2
    scale = max(float(np.linalg.norm(raw[LEFT_SHOULDER] - raw[RIGHT_SHOULDER])), float(np.linalg.norm(shoulder - hip)), 1e-6)
    return (raw - hip) / scale


def release_index(frames: list[dict[str, Any]], hand: str) -> int:
    wrist = RIGHT_WRIST if hand == "right" else LEFT_WRIST
    return min(range(len(frames)), key=lambda index: float(frames[index]["landmarks"][wrist]["y"]))


def dtw_path(first: list[np.ndarray], second: list[np.ndarray]) -> list[tuple[int, int]]:
    if not first or not second:
        return []
    cost = np.full((len(first) + 1, len(second) + 1), np.inf)
    cost[0, 0] = 0.0
    for i in range(1, len(first) + 1):
        for j in range(1, len(second) + 1):
            distance = float(np.mean(np.linalg.norm(first[i - 1] - second[j - 1], axis=1)))
            cost[i, j] = distance + min(cost[i - 1, j], cost[i - 1, j - 1], cost[i, j - 1])
    i, j = len(first), len(second)
    result: list[tuple[int, int]] = []
    while i > 0 and j > 0:
        result.append((i - 1, j - 1))
        direction = int(np.argmin([cost[i - 1, j - 1], cost[i - 1, j], cost[i, j - 1]]))
        if direction == 0:
            i, j = i - 1, j - 1
        elif direction == 1:
            i -= 1
        else:
            j -= 1
    return list(reversed(result))


def release_pinned_pairs(a_frames: list[dict[str, Any]], b_frames: list[dict[str, Any]], hand: str) -> tuple[list[tuple[int, int]], int, int]:
    a_release, b_release = release_index(a_frames, hand), release_index(b_frames, hand)
    pre = dtw_path([normalized_pose(frame) for frame in a_frames[:a_release]], [normalized_pose(frame) for frame in b_frames[:b_release]])
    post = dtw_path([normalized_pose(frame) for frame in a_frames[a_release + 1 :]], [normalized_pose(frame) for frame in b_frames[b_release + 1 :]])
    raw_pairs = pre + [(a_release, b_release)] + [(a_release + 1 + a, b_release + 1 + b) for a, b in post]
    # DTW may repeat source indices. Keep a monotonic one-to-one subset, retaining
    # the anchor, so F inlier statistics are not inflated by duplicated points.
    unique: list[tuple[int, int]] = []
    used_a: set[int] = set()
    used_b: set[int] = set()
    for a_index, b_index in raw_pairs:
        if (a_index == a_release and b_index == b_release) or (a_index not in used_a and b_index not in used_b):
            unique.append((a_index, b_index))
            used_a.add(a_index)
            used_b.add(b_index)
    return unique, a_release, b_release


def load_alignment(path: Path, a_count: int, b_count: int, hand: str) -> tuple[list[tuple[int, int]], int, int, str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("kind") != "release_pinned_multisignal_epipolar_frame_sync":
        raise ValueError(f"Unsupported alignment kind: {payload.get('kind')}")
    anchor = payload.get("releaseAnchor", {})
    if anchor.get("hand") != hand:
        raise ValueError("Alignment shooting hand does not match reconstruction hand")
    pairs = [(int(item["aIndex"]), int(item["bIndex"])) for item in payload.get("matchedFrames", [])]
    if not pairs:
        raise ValueError("Alignment contains no matched frames")
    previous_a, previous_b = -1, -1
    for a_index, b_index in pairs:
        if not (0 <= a_index < a_count and 0 <= b_index < b_count):
            raise ValueError("Alignment contains frame index outside input sequences")
        if a_index <= previous_a or b_index <= previous_b:
            raise ValueError("Alignment must be strictly monotonic and one-to-one")
        previous_a, previous_b = a_index, b_index
    anchor_a, anchor_b = int(anchor["aFrame"]), int(anchor["bFrame"])
    if (anchor_a, anchor_b) not in pairs:
        raise ValueError("Alignment release anchor is not included in matched frames")
    return pairs, anchor_a, anchor_b, payload["kind"]


def skew(vector: np.ndarray) -> np.ndarray:
    x, y, z = vector.reshape(3)
    return np.asarray([[0.0, -z, y], [z, 0.0, -x], [-y, x, 0.0]], dtype=float)


def canonical_cameras(fundamental: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    _, _, vt = np.linalg.svd(fundamental.T)
    epipole = vt[-1]
    epipole /= max(abs(epipole[-1]), 1e-9)
    first = np.hstack((np.eye(3), np.zeros((3, 1))))
    second = np.hstack((skew(epipole) @ fundamental, epipole.reshape(3, 1)))
    return first, second


def project(matrix: np.ndarray, point: np.ndarray) -> np.ndarray:
    homogeneous = matrix @ np.append(point, 1.0)
    return homogeneous[:2] / homogeneous[2]


def empty_output(args: argparse.Namespace, a: dict[str, Any], b: dict[str, Any], anchor_a: int, anchor_b: int, alignment_method: str, reason: str, fixed_f: dict[str, Any]) -> dict[str, Any]:
    return {
        "version": 1,
        "pairId": args.pair_id,
        "boundary": "uncalibrated_projective_3d_review_only",
        "state": "rejected",
        "source": {"views": [str(args.view_a), str(args.view_b)], "videoStored": False, "inputBoundaries": [a["boundary"], b["boundary"]]},
        "alignment": {"method": alignment_method, "releaseAnchor": {"aFrame": anchor_a, "bFrame": anchor_b, "hand": args.hand}},
        "fixedF": fixed_f,
        "frames": [],
        "quality": {"passed": False, "reasons": [reason]},
        "productAdmission": "forbidden_without_calibrated_multi_view_3d",
    }


def main() -> int:
    args = parse_args()
    if not 0 < args.min_global_f_inlier_ratio <= 1:
        raise SystemExit("--min-global-f-inlier-ratio must be in (0, 1]")
    a, b = load_candidate(args.view_a), load_candidate(args.view_b)
    a_frames, b_frames = a["frames"], b["frames"]
    if args.alignment:
        matched, a_release, b_release, alignment_method = load_alignment(args.alignment, len(a_frames), len(b_frames), args.hand)
    else:
        matched, a_release, b_release = release_pinned_pairs(a_frames, b_frames, args.hand)
        alignment_method = "release_pinned_dtw"
    observations_a = np.concatenate([points(a_frames[index_a]) for index_a, _ in matched]) - np.asarray([0.5, 0.5])
    observations_b = np.concatenate([points(b_frames[index_b]) for _, index_b in matched]) - np.asarray([0.5, 0.5])
    fundamental, mask = cv2.findFundamentalMat(observations_a, observations_b, cv2.FM_RANSAC, 0.003, 0.99)
    inlier_mask = mask.reshape(-1).astype(bool) if mask is not None else np.zeros(len(observations_a), dtype=bool)
    inlier_ratio = float(np.count_nonzero(inlier_mask) / max(len(observations_a), 1))
    fixed_f = {"state": "fitted" if fundamental is not None and fundamental.shape == (3, 3) else "failed", "correspondences": int(len(observations_a)), "inliers": int(np.count_nonzero(inlier_mask)), "inlierRatio": round(inlier_ratio, 5), "minimumInlierRatio": args.min_global_f_inlier_ratio}
    if fundamental is None or fundamental.shape != (3, 3):
        payload = empty_output(args, a, b, a_release, b_release, alignment_method, "fixed_f_fit_failed", fixed_f)
    elif inlier_ratio < args.min_global_f_inlier_ratio:
        payload = empty_output(args, a, b, a_release, b_release, alignment_method, "fixed_f_inlier_ratio_below_threshold", fixed_f)
    else:
        first, second = canonical_cameras(fundamental)
        frames: list[dict[str, Any]] = []
        reprojection_errors: list[float] = []
        offset = 0
        for a_index, b_index in matched:
            a_points = points(a_frames[a_index]) - np.asarray([0.5, 0.5])
            b_points = points(b_frames[b_index]) - np.asarray([0.5, 0.5])
            local_mask = inlier_mask[offset : offset + 33]
            offset += 33
            joints = np.flatnonzero(local_mask)
            if len(joints) < args.min_frame_joint_inliers:
                continue
            homogeneous = cv2.triangulatePoints(first, second, a_points[joints].T, b_points[joints].T)
            xyz = (homogeneous[:3] / homogeneous[3]).T
            if not np.isfinite(xyz).all():
                continue
            frame_errors: list[float] = []
            landmarks: dict[str, list[float]] = {}
            for joint, point in zip(joints, xyz):
                errors = [float(np.linalg.norm(project(first, point) - a_points[joint])), float(np.linalg.norm(project(second, point) - b_points[joint]))]
                frame_errors.extend(errors)
                landmarks[str(int(joint))] = [round(float(value), 7) for value in point]
            reprojection_errors.extend(frame_errors)
            frames.append({"aFrame": a_index, "bFrame": b_index, "aTimestampMs": int(a_frames[a_index]["timestampMs"]), "bTimestampMs": int(b_frames[b_index]["timestampMs"]), "inlierJointCount": int(len(joints)), "canonicalProjectiveLandmarks": landmarks, "medianCanonicalReprojectionError": round(float(np.median(frame_errors)), 7)})
        frame_ratio = len(frames) / max(len(matched), 1)
        median_error = float(np.median(reprojection_errors)) if reprojection_errors else float("inf")
        reasons: list[str] = []
        if len(frames) < 5:
            reasons.append("too_few_projective_frames")
        if frame_ratio < args.min_frame_ratio:
            reasons.append("insufficient_projective_frames")
        if not np.isfinite(median_error) or median_error > args.max_canonical_reprojection_error:
            reasons.append("canonical_reprojection_exceeded")
        payload = {
            "version": 1,
            "pairId": args.pair_id,
            "boundary": "uncalibrated_projective_3d_review_only",
            "state": "review_only_projective_3d" if not reasons else "rejected",
            "source": {"views": [str(args.view_a), str(args.view_b)], "videoStored": False, "inputBoundaries": [a["boundary"], b["boundary"]]},
            "alignment": {"method": alignment_method, "releaseAnchor": {"aFrame": a_release, "bFrame": b_release, "hand": args.hand}, "matchedFrameCount": len(matched)},
            "fixedF": fixed_f,
            "frames": frames if not reasons else [],
            "quality": {"passed": not reasons, "validProjectiveFrameRatio": round(frame_ratio, 5), "medianCanonicalReprojectionError": round(median_error, 7) if np.isfinite(median_error) else None, "reasons": reasons},
            "productAdmission": "forbidden_without_calibrated_multi_view_3d",
        }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"pairId": args.pair_id, "state": payload["state"], "fixedF": payload["fixedF"], "quality": payload["quality"]}, ensure_ascii=False))
    return 0 if payload["state"] == "review_only_projective_3d" else 2


if __name__ == "__main__":
    raise SystemExit(main())
