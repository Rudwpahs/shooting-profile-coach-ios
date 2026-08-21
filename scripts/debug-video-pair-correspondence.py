"""Measure visual correspondence for matched frames from two local videos.

ORB feature matches and homography inliers distinguish a same-footage/crop pair
from genuinely different camera views. This is a source diagnostic; it does
not claim metric camera calibration.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-a", type=Path, required=True)
    parser.add_argument("--video-b", type=Path, required=True)
    parser.add_argument("--pair-debug", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def frame_at(capture: cv2.VideoCapture, milliseconds: int) -> np.ndarray:
    capture.set(cv2.CAP_PROP_POS_MSEC, milliseconds)
    ok, frame = capture.read()
    if not ok:
        raise ValueError(f"Could not read frame at {milliseconds} ms")
    return frame


def compare(a: np.ndarray, b: np.ndarray, orb: cv2.ORB) -> dict[str, int | float | str]:
    key_a, desc_a = orb.detectAndCompute(cv2.cvtColor(a, cv2.COLOR_BGR2GRAY), None)
    key_b, desc_b = orb.detectAndCompute(cv2.cvtColor(b, cv2.COLOR_BGR2GRAY), None)
    if desc_a is None or desc_b is None:
        return {"state": "insufficient_features", "rawMatches": 0, "homographyInliers": 0, "inlierRatio": 0.0}
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    matches = sorted(matcher.match(desc_a, desc_b), key=lambda match: match.distance)
    if len(matches) < 8:
        return {"state": "too_few_matches", "rawMatches": len(matches), "homographyInliers": 0, "inlierRatio": 0.0}
    source = np.asarray([key_a[match.queryIdx].pt for match in matches], dtype=np.float32)
    target = np.asarray([key_b[match.trainIdx].pt for match in matches], dtype=np.float32)
    _, mask = cv2.findHomography(source, target, cv2.RANSAC, 4.0)
    inliers = int(np.count_nonzero(mask)) if mask is not None else 0
    return {"state": "compared", "rawMatches": len(matches), "homographyInliers": inliers, "inlierRatio": round(inliers / len(matches), 4)}


def main() -> int:
    args = parse_args()
    pair = json.loads(args.pair_debug.read_text(encoding="utf-8"))
    capture_a, capture_b = cv2.VideoCapture(str(args.video_a)), cv2.VideoCapture(str(args.video_b))
    orb = cv2.ORB_create(nfeatures=1400)
    results = []
    try:
        for match in pair.get("matchedFrames", []):
            result = compare(frame_at(capture_a, match["aTimestampMs"]), frame_at(capture_b, match["bTimestampMs"]), orb)
            results.append({"aTimestampMs": match["aTimestampMs"], "bTimestampMs": match["bTimestampMs"], **result})
    finally:
        capture_a.release()
        capture_b.release()
    compared = [item for item in results if item["state"] == "compared"]
    median_ratio = float(np.median([item["inlierRatio"] for item in compared])) if compared else 0.0
    payload = {
        "version": 1,
        "kind": "video_pair_feature_correspondence_debug",
        "matchedFrames": results,
        "medianHomographyInlierRatio": round(median_ratio, 4),
        "diagnostic": "likely_same_or_near_identical_camera_footage" if median_ratio >= 0.18 else "not_same_image_plane_or_insufficient_features",
        "note": "A high homography score signals same/near-identical image geometry, which provides little or no stereo baseline; a low score alone does not calibrate a different camera pair.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"medianHomographyInlierRatio": payload["medianHomographyInlierRatio"], "diagnostic": payload["diagnostic"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
