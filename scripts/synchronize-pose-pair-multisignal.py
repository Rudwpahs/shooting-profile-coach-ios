"""Synchronize two single-view pose sequences with a release-pinned multi-signal matcher.

This tool produces a *correspondence hypothesis*, not 3D. It combines
visibility-weighted joint-motion signatures with a provisional fixed-F residual
and only emits monotonic one-to-one frame pairs around a hard release anchor.
The downstream reconstruction gate must still independently validate fixed-F.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np

LEFT_SHOULDER, RIGHT_SHOULDER = 11, 12
LEFT_ELBOW, RIGHT_ELBOW = 13, 14
LEFT_WRIST, RIGHT_WRIST = 15, 16
LEFT_HIP, RIGHT_HIP = 23, 24
LEFT_KNEE, RIGHT_KNEE = 25, 26


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--view-a", type=Path, required=True)
    parser.add_argument("--view-b", type=Path, required=True)
    parser.add_argument("--hand", choices=["right", "left"], default="right")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--iterations", type=int, default=3)
    parser.add_argument("--epipolar-weight", type=float, default=0.35)
    parser.add_argument("--gap-penalty", type=float, default=0.65)
    return parser.parse_args()


def load(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("boundary") != "monocular_relative_pose_not_metric_3d" or not payload.get("quality", {}).get("passed"):
        raise ValueError(f"Not a quality-passed single-view pose sequence: {path}")
    if len(payload.get("frames", [])) < 5:
        raise ValueError(f"Insufficient frames: {path}")
    return payload


def xy(frame: dict[str, Any]) -> np.ndarray:
    return np.asarray([[float(point["x"]), float(point["y"])] for point in frame["landmarks"]], dtype=np.float64)


def visibility(frame: dict[str, Any]) -> np.ndarray:
    return np.asarray([float(point.get("visibility", 0.0)) for point in frame["landmarks"]], dtype=np.float64)


def scale(points: np.ndarray) -> float:
    hips = (points[LEFT_HIP] + points[RIGHT_HIP]) / 2
    shoulders = (points[LEFT_SHOULDER] + points[RIGHT_SHOULDER]) / 2
    return max(float(np.linalg.norm(points[LEFT_SHOULDER] - points[RIGHT_SHOULDER])), float(np.linalg.norm(shoulders - hips)), 1e-6)


def angle(first: np.ndarray, middle: np.ndarray, last: np.ndarray) -> float:
    left, right = first - middle, last - middle
    denominator = max(float(np.linalg.norm(left) * np.linalg.norm(right)), 1e-8)
    return float(np.arccos(np.clip(np.dot(left, right) / denominator, -1.0, 1.0)) / np.pi)


def raw_signature(frame: dict[str, Any], hand: str) -> np.ndarray:
    points = xy(frame)
    wrist = RIGHT_WRIST if hand == "right" else LEFT_WRIST
    elbow = RIGHT_ELBOW if hand == "right" else LEFT_ELBOW
    shoulder = RIGHT_SHOULDER if hand == "right" else LEFT_SHOULDER
    torso = scale(points)
    hip = (points[LEFT_HIP] + points[RIGHT_HIP]) / 2
    wrist_to_shoulder = np.linalg.norm(points[wrist] - points[shoulder]) / torso
    wrist_to_hip = np.linalg.norm(points[wrist] - hip) / torso
    elbow_extension = angle(points[shoulder], points[elbow], points[wrist])
    knee_flex = (angle(points[LEFT_HIP], points[LEFT_KNEE], points[LEFT_KNEE] + (points[LEFT_KNEE] - points[LEFT_HIP])) + angle(points[RIGHT_HIP], points[RIGHT_KNEE], points[RIGHT_KNEE] + (points[RIGHT_KNEE] - points[RIGHT_HIP]))) / 2
    return np.asarray([wrist_to_shoulder, wrist_to_hip, elbow_extension, knee_flex], dtype=float)


def motion_signatures(frames: list[dict[str, Any]], hand: str) -> tuple[np.ndarray, np.ndarray]:
    base = np.asarray([raw_signature(frame, hand) for frame in frames], dtype=float)
    velocity = np.gradient(base, axis=0) if len(base) > 1 else np.zeros_like(base)
    features = np.concatenate((base, velocity), axis=1)
    median = np.median(features, axis=0)
    deviation = np.median(np.abs(features - median), axis=0)
    normalized = (features - median) / np.maximum(deviation * 1.4826, 1e-5)
    confidence = np.asarray([float(np.mean(visibility(frame)[[LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, RIGHT_ELBOW, LEFT_WRIST, RIGHT_WRIST, LEFT_HIP, RIGHT_HIP]])) for frame in frames])
    return normalized, confidence


def release_index(frames: list[dict[str, Any]], hand: str) -> int:
    wrist = RIGHT_WRIST if hand == "right" else LEFT_WRIST
    return min(range(len(frames)), key=lambda index: float(frames[index]["landmarks"][wrist]["y"]))


def fit_fundamental(frames_a: list[dict[str, Any]], frames_b: list[dict[str, Any]], matched: list[tuple[int, int]]) -> tuple[np.ndarray | None, np.ndarray | None]:
    if len(matched) < 1:
        return None, None
    a = np.concatenate([xy(frames_a[first]) for first, _ in matched]) - np.asarray([0.5, 0.5])
    b = np.concatenate([xy(frames_b[second]) for _, second in matched]) - np.asarray([0.5, 0.5])
    if len(a) < 8:
        return None, None
    fundamental, mask = cv2.findFundamentalMat(a, b, cv2.FM_RANSAC, 0.003, 0.995)
    if fundamental is None or fundamental.shape != (3, 3) or mask is None:
        return None, None
    return fundamental, mask.reshape(-1).astype(bool)


def sampson_per_pair(fundamental: np.ndarray, first: dict[str, Any], second: dict[str, Any]) -> float:
    points_a = xy(first) - np.asarray([0.5, 0.5])
    points_b = xy(second) - np.asarray([0.5, 0.5])
    homogeneous_a = np.column_stack((points_a, np.ones(len(points_a))))
    homogeneous_b = np.column_stack((points_b, np.ones(len(points_b))))
    lines_b = (fundamental @ homogeneous_a.T).T
    lines_a = (fundamental.T @ homogeneous_b.T).T
    numerator = np.square(np.sum(homogeneous_b * lines_b, axis=1))
    denominator = np.square(lines_b[:, 0]) + np.square(lines_b[:, 1]) + np.square(lines_a[:, 0]) + np.square(lines_a[:, 1])
    confidence = np.minimum(visibility(first), visibility(second))
    valid = confidence >= 0.5
    if not np.any(valid):
        return 3.0
    return float(np.average(numerator[valid] / np.maximum(denominator[valid], 1e-10), weights=confidence[valid]))


def align_segment(a_indices: list[int], b_indices: list[int], cost: Callable[[int, int], float], gap: float) -> list[tuple[int, int]]:
    rows, columns = len(a_indices), len(b_indices)
    table = np.full((rows + 1, columns + 1), np.inf)
    trace = np.zeros((rows + 1, columns + 1), dtype=np.int8)
    table[0, 0] = 0.0
    for row in range(1, rows + 1):
        table[row, 0], trace[row, 0] = row * gap, 1
    for column in range(1, columns + 1):
        table[0, column], trace[0, column] = column * gap, 2
    for row in range(1, rows + 1):
        for column in range(1, columns + 1):
            options = [table[row - 1, column - 1] + cost(a_indices[row - 1], b_indices[column - 1]), table[row - 1, column] + gap, table[row, column - 1] + gap]
            trace[row, column] = int(np.argmin(options))
            table[row, column] = min(options)
    row, column = rows, columns
    pairs: list[tuple[int, int]] = []
    while row > 0 or column > 0:
        direction = int(trace[row, column])
        if row > 0 and column > 0 and direction == 0:
            pairs.append((a_indices[row - 1], b_indices[column - 1]))
            row, column = row - 1, column - 1
        elif row > 0 and (column == 0 or direction == 1):
            row -= 1
        else:
            column -= 1
    return list(reversed(pairs))


def main() -> int:
    args = parse_args()
    first, second = load(args.view_a), load(args.view_b)
    frames_a, frames_b = first["frames"], second["frames"]
    features_a, confidence_a = motion_signatures(frames_a, args.hand)
    features_b, confidence_b = motion_signatures(frames_b, args.hand)
    anchor_a, anchor_b = release_index(frames_a, args.hand), release_index(frames_b, args.hand)
    fundamental: np.ndarray | None = None
    pairs: list[tuple[int, int]] = []
    history: list[dict[str, Any]] = []
    for iteration in range(max(args.iterations, 1)):
        def pair_cost(index_a: int, index_b: int) -> float:
            signature_cost = float(np.linalg.norm(features_a[index_a] - features_b[index_b]))
            confidence_weight = max((confidence_a[index_a] + confidence_b[index_b]) / 2, 0.2)
            epipolar = sampson_per_pair(fundamental, frames_a[index_a], frames_b[index_b]) if fundamental is not None else 0.0
            return signature_cost / confidence_weight + args.epipolar_weight * min(epipolar, 3.0)

        pre = align_segment(list(range(anchor_a)), list(range(anchor_b)), pair_cost, args.gap_penalty)
        post = align_segment(list(range(anchor_a + 1, len(frames_a))), list(range(anchor_b + 1, len(frames_b))), pair_cost, args.gap_penalty)
        pairs = pre + [(anchor_a, anchor_b)] + post
        fundamental, inliers = fit_fundamental(frames_a, frames_b, pairs)
        inlier_ratio = float(np.count_nonzero(inliers) / max(len(inliers), 1)) if inliers is not None else 0.0
        history.append({"iteration": iteration + 1, "matchedFrames": len(pairs), "fixedFInlierRatio": round(inlier_ratio, 6), "fixedFInliers": int(np.count_nonzero(inliers)) if inliers is not None else 0, "fixedFCorrespondences": int(len(inliers)) if inliers is not None else 0})
    scores = [float(np.linalg.norm(features_a[a] - features_b[b])) for a, b in pairs]
    output = {
        "version": 1,
        "kind": "release_pinned_multisignal_epipolar_frame_sync",
        "boundary": "correspondence_hypothesis_not_metric_3d",
        "inputs": {"viewA": str(args.view_a), "viewB": str(args.view_b), "aFrames": len(frames_a), "bFrames": len(frames_b)},
        "releaseAnchor": {"aFrame": anchor_a, "bFrame": anchor_b, "hand": args.hand},
        "signals": ["visibility_weighted_joint_motion_signature", "release_anchor", "iterative_fixed_f_sampson_residual"],
        "iterations": history,
        "matchedFrames": [{"aIndex": a, "bIndex": b, "aTimestampMs": int(frames_a[a]["timestampMs"]), "bTimestampMs": int(frames_b[b]["timestampMs"]), "motionSignatureCost": round(score, 6)} for (a, b), score in zip(pairs, scores)],
        "quality": {"matchedFrameCount": len(pairs), "meanMotionSignatureCost": round(float(np.mean(scores)), 6) if scores else None, "fixedFInlierRatio": history[-1]["fixedFInlierRatio"]},
        "admission": "must_pass_independent_fixed_f_and_reprojection_gates",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"releaseAnchor": output["releaseAnchor"], "quality": output["quality"], "iterations": history}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
