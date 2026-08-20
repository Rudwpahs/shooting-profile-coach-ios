"""Extract a privacy-preserving, single-view relative pose candidate from a local video.

This tool never labels an athlete, never infers identity, and never upgrades a
single camera video to calibrated 3D. It emits a JSON candidate that can become
an input to a later multi-view calibration and triangulation process.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import cv2
import mediapipe as mp
import numpy as np


@dataclass
class Landmark:
    x: float
    y: float
    z: float
    visibility: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, required=True, help="Local full-body shooting clip. Never pass a remote URL.")
    parser.add_argument("--output", type=Path, required=True, help="JSON output path.")
    parser.add_argument("--model", type=Path, required=True, help="Official pose_landmarker_full.task path.")
    parser.add_argument("--sample-fps", type=float, default=8.0, help="Frame sampling frequency, 2-12 FPS.")
    parser.add_argument("--max-frames", type=int, default=96, help="Maximum inference frames.")
    return parser.parse_args()


def to_landmarks(points: list[Any]) -> list[Landmark]:
    return [Landmark(x=float(point.x), y=float(point.y), z=float(point.z), visibility=float(getattr(point, "visibility", 1.0))) for point in points]


def quality(frames: list[dict[str, Any]], sampled_frames: int) -> dict[str, Any]:
    ratio = len(frames) / max(sampled_frames, 1)
    visibility = [landmark["visibility"] for frame in frames for landmark in frame["landmarks"][11:29]]
    mean_visibility = sum(visibility) / len(visibility) if visibility else 0.0
    reasons: list[str] = []
    if sampled_frames < 12:
        reasons.append("too_few_sampled_frames")
    if ratio < 0.72:
        reasons.append("insufficient_full_body_tracking")
    if mean_visibility < 0.55:
        reasons.append("low_landmark_visibility")
    return {
        "passed": not reasons,
        "source": "mediapipe_pose_landmarker",
        "landmarkFrameRatio": round(ratio, 3),
        "meanVisibility": round(mean_visibility, 3),
        "reasons": reasons,
    }


def main() -> int:
    args = parse_args()
    if not args.video.is_file():
        raise SystemExit(f"Video file not found: {args.video}")
    if not args.model.is_file():
        raise SystemExit(f"Pose model not found: {args.model}")
    if not 2 <= args.sample_fps <= 12:
        raise SystemExit("--sample-fps must be between 2 and 12")

    capture = cv2.VideoCapture(str(args.video))
    native_fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    frame_total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if frame_total <= 0:
        raise SystemExit("The selected video has no readable frames")
    sample_interval = max(1, int(round(native_fps / args.sample_fps)))

    vision = mp.tasks.vision
    options = vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_buffer=args.model.read_bytes()),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.55,
        min_pose_presence_confidence=0.55,
        min_tracking_confidence=0.50,
    )
    detector = vision.PoseLandmarker.create_from_options(options)
    frames: list[dict[str, Any]] = []
    sampled_frames = 0
    index = 0

    try:
        while len(frames) < args.max_frames:
            ok, frame_bgr = capture.read()
            if not ok:
                break
            if index % sample_interval:
                index += 1
                continue
            timestamp_ms = int(round(index * 1000 / native_fps))
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            result = detector.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(frame_rgb)), timestamp_ms)
            sampled_frames += 1
            pose_sets = result.pose_landmarks or []
            if len(pose_sets) == 1 and len(pose_sets[0]) == 33:
                frames.append({"timestampMs": timestamp_ms, "landmarks": [asdict(point) for point in to_landmarks(pose_sets[0])]})
            index += 1
    finally:
        capture.release()
        detector.close()

    report = quality(frames, sampled_frames)
    payload = {
        "version": 1,
        "boundary": "monocular_relative_pose_not_metric_3d",
        "state": "candidate" if report["passed"] else "rejected",
        "source": {"kind": "local_video", "identity": "not_collected", "videoStored": False},
        "frames": frames,
        "quality": report,
        "upgradeRequirement": "At least two synchronized calibrated camera views plus reprojection-error validation are required before calibrated_multi_view_3d.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"state": payload["state"], "sampledFrames": sampled_frames, "detectedFrames": len(frames), "quality": report}, ensure_ascii=False))
    return 0 if report["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
