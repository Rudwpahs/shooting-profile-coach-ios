"""Offline MP4 -> LandmarkSequenceV2 adapter for local engineering validation.

This is a DEV/TEST-ONLY bridge. It exists so a local MP4 can enter the existing
production downstream pipeline (`pnpm eval:two-view`); it is not part of the Expo
bundle, it is not a capture path, and it does not make external footage
release-admissible. Sequences it writes are labelled `offline_adapter` by the
caller and must still be treated as `library_source_not_admissible` for release
evidence.

It deliberately mirrors the native iOS extractor
(`modules/formpath-pose/ios/FormpathPoseModule.swift` +
`PoseSamplingPolicy.swift`) rather than inventing a second analysis:

* the same `pose_landmarker_full.task` model file the app ships, with the same
  detection/presence/tracking confidences and `numPoses = 1`;
* the same two passes: a full-frame locator pass at 15 fps, a derived stable
  person ROI, then a cropped output pass over merged 15 fps coarse plus 30 fps
  dense timestamps centred on the strongest wrist/elbow motion;
* the same release proxy (timestamp of strongest locator wrist/elbow motion);
* the same attempt bookkeeping, duplicate-timestamp rejection, and quality
  reasons, so `parseLandmarkSequenceV2` recomputes identical verdicts.

Known differences from the native path are listed in `--report` output and must
be carried into any write-up: decoding is OpenCV/FFmpeg rather than
AVAssetImageGenerator, and MediaPipe Tasks Python replaces MediaPipeTasksVision
0.10.21 on iOS. Same weights, different runtime build.

Raw landmark output is private evidence. Write it outside the repository.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

# --------------------------------------------------------------------------- native constants

COARSE_FPS = 15.0
DENSE_FPS = 30.0
MAXIMUM_DENSE_WINDOW_SECONDS = 1.0

MINIMUM_LOCATOR_DETECTED_FRAMES = 5
MINIMUM_LOCATOR_DETECTION_RATIO = 0.5
MINIMUM_LOCATOR_LANDMARK_VISIBILITY = 0.5
MINIMUM_LOCATOR_CRITICAL_LANDMARKS_PER_FRAME = 10
MINIMUM_LOCATOR_BODY_SCALE_PIXELS = 16.0
MAXIMUM_LOCATOR_CENTER_DEVIATION_BODY_SCALES = 0.75
MINIMUM_LOCATOR_BODY_SCALE_RATIO = 0.55
MAXIMUM_LOCATOR_BODY_SCALE_RATIO = 1.80
MINIMUM_LOCATOR_INLIER_RATIO = 0.60
MAXIMUM_LOCATOR_POINT_DISTANCE_BODY_SCALES = 4.0
PERSON_ROI_PADDING_PROPORTION = 0.12
MINIMUM_PERSON_ROI_DIMENSION_PROPORTION = 0.08
MINIMUM_PERSON_ROI_DIMENSION_PIXELS = 32.0

MINIMUM_DETECTED_FRAMES = 8
MINIMUM_FINAL_DETECTION_RATIO = 0.8
MINIMUM_CRITICAL_JOINT_COVERAGE = 0.85
MINIMUM_CRITICAL_JOINT_VISIBILITY = 0.5
MAXIMUM_RELEASE_PROXY_DETECTION_GAP_MS = 150

CRITICAL_LANDMARK_INDICES = (11, 12, 15, 16, 23, 24, 25, 26, 27, 28)
MOTION_LANDMARK_INDICES = (13, 14, 15, 16)

MIN_POSE_DETECTION_CONFIDENCE = 0.55
MIN_POSE_PRESENCE_CONFIDENCE = 0.55
MIN_TRACKING_CONFIDENCE = 0.50


class ExtractionError(RuntimeError):
    """A stable, non-identifying extraction failure."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


# --------------------------------------------------------------------------- sampling policy


def _timestamps(fps: float, start_seconds: float, end_seconds: float, duration_seconds: float) -> list[float]:
    """Port of `PoseSamplingPolicy.timestamps`."""
    if not (fps > 0 and duration_seconds > 0 and start_seconds < end_seconds):
        return []
    first_index = max(0, math.ceil(start_seconds * fps - 1e-9))
    last_exclusive = max(first_index, math.ceil(min(end_seconds, duration_seconds) * fps - 1e-9))
    out: list[float] = []
    for index in range(first_index, last_exclusive):
        seconds = index / fps
        if seconds >= start_seconds - 1e-12 and seconds < end_seconds - 1e-12 and seconds < duration_seconds - 1e-12:
            out.append(seconds)
    return out


def coarse_timestamps(duration_seconds: float) -> list[float]:
    return _timestamps(COARSE_FPS, 0.0, duration_seconds, duration_seconds)


def dense_timestamps(duration_seconds: float, strongest_motion_seconds: float | None) -> list[float]:
    if duration_seconds <= 0 or strongest_motion_seconds is None:
        return []
    window = min(MAXIMUM_DENSE_WINDOW_SECONDS, duration_seconds)
    start = min(max(0.0, strongest_motion_seconds - window / 2), max(0.0, duration_seconds - window))
    return _timestamps(DENSE_FPS, start, start + window, duration_seconds)


def merged_timestamps(groups: list[list[float]]) -> list[float]:
    """Port of `mergedTimestamps`: dedupe on the 60000 canonical timescale."""
    unique: dict[int, float] = {}
    for seconds in (value for group in groups for value in group):
        key = int(round(seconds * 60_000))
        unique[key] = key / 60_000
    return [unique[key] for key in sorted(unique)]


# --------------------------------------------------------------------------- decoding


@dataclass
class DecodedClip:
    frames: list[np.ndarray]
    fps: float
    width: int
    height: int

    @property
    def duration_seconds(self) -> float:
        return len(self.frames) / self.fps

    @property
    def duration_ms(self) -> int:
        return int(round(self.duration_seconds * 1000))

    def frame_index_at(self, seconds: float) -> int | None:
        """The frame whose presentation interval contains `seconds`.

        The native generator uses zero before/after tolerance, so a request
        resolves to the frame at or before it, never the nearest one.
        """
        index = int(math.floor(seconds * self.fps + 1e-6))
        if index < 0 or index >= len(self.frames):
            return None
        return index

    def timestamp_ms(self, index: int) -> int:
        return int(round(index / self.fps * 1000))


def decode_clip(path: Path) -> DecodedClip:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise ExtractionError("clip_decode_failed")
    fps = capture.get(cv2.CAP_PROP_FPS)
    frames: list[np.ndarray] = []
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        frames.append(frame)
    capture.release()
    if not frames or not math.isfinite(fps) or fps <= 0:
        raise ExtractionError("clip_decode_failed")
    height, width = frames[0].shape[:2]
    return DecodedClip(frames=frames, fps=float(fps), width=int(width), height=int(height))


# --------------------------------------------------------------------------- detection


@dataclass
class Landmark:
    x: float
    y: float
    z: float
    visibility: float


@dataclass
class DetectedFrame:
    timestamp_ms: int
    landmarks: list[Landmark]


@dataclass
class Attempt:
    requested_timestamp_ms: int
    decoded_timestamp_ms: int | None = None
    detected_timestamp_ms: int | None = None


@dataclass
class PassResult:
    frames: list[DetectedFrame] = field(default_factory=list)
    attempts: list[Attempt] = field(default_factory=list)
    attempted: int = 0
    decoded: int = 0
    detected: int = 0
    motion: list[tuple[int, float]] = field(default_factory=list)


def make_landmarker(model_path: Path) -> mp_vision.PoseLandmarker:
    options = mp_vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=MIN_POSE_DETECTION_CONFIDENCE,
        min_pose_presence_confidence=MIN_POSE_PRESENCE_CONFIDENCE,
        min_tracking_confidence=MIN_TRACKING_CONFIDENCE,
    )
    return mp_vision.PoseLandmarker.create_from_options(options)


def _to_mp_image(bgr: np.ndarray) -> mp.Image:
    return mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))


def _read_landmarks(result: Any) -> list[Landmark] | None:
    poses = getattr(result, "pose_landmarks", None) or []
    if not poses:
        return None
    pose = poses[0]
    if len(pose) != 33:
        return None
    return [
        Landmark(
            x=float(point.x),
            y=float(point.y),
            z=float(point.z),
            visibility=float(getattr(point, "visibility", 0.0) or 0.0),
        )
        for point in pose
    ]


def run_pass(
    clip: DecodedClip,
    landmarker: mp_vision.PoseLandmarker,
    requested_seconds: list[float],
    roi: tuple[int, int, int, int] | None,
    collect_motion: bool,
) -> PassResult:
    """One detection pass. `roi` None means the full-frame locator pass."""
    result = PassResult()
    seen_actual: set[int] = set()
    last_submitted: int | None = None
    previous_motion_points: list[tuple[float, float]] | None = None

    for seconds in requested_seconds:
        attempt = Attempt(requested_timestamp_ms=int(round(seconds * 1000)))
        result.attempted += 1
        try:
            index = clip.frame_index_at(seconds)
            if index is None:
                continue
            actual_ms = clip.timestamp_ms(index)
            image = clip.frames[index]
            if roi is not None:
                x, y, width, height = roi
                image = image[y : y + height, x : x + width]
                if image.shape[0] != height or image.shape[1] != width:
                    continue
            result.decoded += 1
            attempt.decoded_timestamp_ms = actual_ms
            if actual_ms in seen_actual:
                continue
            seen_actual.add(actual_ms)
            if last_submitted is not None and actual_ms <= last_submitted:
                continue
            detection = landmarker.detect_for_video(_to_mp_image(image), actual_ms)
            last_submitted = actual_ms
            landmarks = _read_landmarks(detection)
            if landmarks is None:
                continue
            result.detected += 1
            attempt.detected_timestamp_ms = actual_ms
            result.frames.append(DetectedFrame(timestamp_ms=actual_ms, landmarks=landmarks))
            if collect_motion:
                points = [(landmarks[i].x, landmarks[i].y) for i in MOTION_LANDMARK_INDICES]
                motion = 0.0
                if previous_motion_points is not None:
                    motion = sum(
                        math.hypot(current[0] - previous[0], current[1] - previous[1])
                        for previous, current in zip(previous_motion_points, points, strict=True)
                    ) / len(points)
                result.motion.append((actual_ms, motion))
                previous_motion_points = points
        finally:
            result.attempts.append(attempt)
    return result


# --------------------------------------------------------------------------- stable person ROI


@dataclass
class BodyEvidence:
    center_x: float
    center_y: float
    body_scale: float
    points: list[tuple[float, float]]


def _body_evidence(frame: DetectedFrame, width: int, height: int) -> BodyEvidence | None:
    def visible(index: int) -> tuple[float, float] | None:
        point = frame.landmarks[index]
        if not (math.isfinite(point.x) and math.isfinite(point.y)):
            return None
        if point.visibility < MINIMUM_LOCATOR_LANDMARK_VISIBILITY:
            return None
        return (min(max(point.x, 0.0), 1.0) * width, min(max(point.y, 0.0), 1.0) * height)

    critical = sum(1 for index in CRITICAL_LANDMARK_INDICES if visible(index) is not None)
    left_shoulder, right_shoulder = visible(11), visible(12)
    left_hip, right_hip = visible(23), visible(24)
    if critical < MINIMUM_LOCATOR_CRITICAL_LANDMARKS_PER_FRAME:
        return None
    if None in (left_shoulder, right_shoulder, left_hip, right_hip):
        return None
    assert left_shoulder and right_shoulder and left_hip and right_hip

    shoulder_center = ((left_shoulder[0] + right_shoulder[0]) / 2, (left_shoulder[1] + right_shoulder[1]) / 2)
    pelvis_center = ((left_hip[0] + right_hip[0]) / 2, (left_hip[1] + right_hip[1]) / 2)
    center_x = (shoulder_center[0] + pelvis_center[0]) / 2
    center_y = (shoulder_center[1] + pelvis_center[1]) / 2
    torso = math.hypot(shoulder_center[0] - pelvis_center[0], shoulder_center[1] - pelvis_center[1])
    shoulder_width = math.hypot(left_shoulder[0] - right_shoulder[0], left_shoulder[1] - right_shoulder[1])
    hip_width = math.hypot(left_hip[0] - right_hip[0], left_hip[1] - right_hip[1])
    body_scale = torso + (shoulder_width + hip_width) / 2
    if not math.isfinite(body_scale) or body_scale < MINIMUM_LOCATOR_BODY_SCALE_PIXELS:
        return None

    points: list[tuple[float, float]] = []
    for index in range(33):
        point = visible(index)
        if point is None:
            continue
        if math.hypot(point[0] - center_x, point[1] - center_y) / body_scale > MAXIMUM_LOCATOR_POINT_DISTANCE_BODY_SCALES:
            continue
        points.append(point)
    if len(points) < MINIMUM_LOCATOR_CRITICAL_LANDMARKS_PER_FRAME:
        return None
    return BodyEvidence(center_x=center_x, center_y=center_y, body_scale=body_scale, points=points)


def _median(values: list[float]) -> float:
    return float(np.median(np.asarray(values, dtype=float))) if values else math.nan


def derive_stable_roi(locator: PassResult, width: int, height: int) -> tuple[int, int, int, int] | None:
    ratio = 0.0 if locator.attempted == 0 else locator.detected / locator.attempted
    if locator.detected < MINIMUM_LOCATOR_DETECTED_FRAMES or ratio < MINIMUM_LOCATOR_DETECTION_RATIO:
        return None
    evidence = [item for item in (_body_evidence(frame, width, height) for frame in locator.frames) if item]
    if len(evidence) < MINIMUM_LOCATOR_DETECTED_FRAMES:
        return None

    center_x = _median([item.center_x for item in evidence])
    center_y = _median([item.center_y for item in evidence])
    body_scale = _median([item.body_scale for item in evidence])
    if not all(map(math.isfinite, (center_x, center_y, body_scale))) or body_scale < MINIMUM_LOCATOR_BODY_SCALE_PIXELS:
        return None

    inliers = [
        item
        for item in evidence
        if math.hypot(item.center_x - center_x, item.center_y - center_y) / body_scale
        <= MAXIMUM_LOCATOR_CENTER_DEVIATION_BODY_SCALES
        and MINIMUM_LOCATOR_BODY_SCALE_RATIO <= item.body_scale / body_scale <= MAXIMUM_LOCATOR_BODY_SCALE_RATIO
    ]
    if len(inliers) < MINIMUM_LOCATOR_DETECTED_FRAMES or len(inliers) / len(evidence) < MINIMUM_LOCATOR_INLIER_RATIO:
        return None

    min_x = min(point[0] for item in inliers for point in item.points)
    min_y = min(point[1] for item in inliers for point in item.points)
    max_x = max(point[0] for item in inliers for point in item.points)
    max_y = max(point[1] for item in inliers for point in item.points)
    pad_x = (max_x - min_x) * PERSON_ROI_PADDING_PROPORTION
    pad_y = (max_y - min_y) * PERSON_ROI_PADDING_PROPORTION
    left, top = min_x - pad_x, min_y - pad_y
    right, bottom = max_x + pad_x, max_y + pad_y

    # Clamp to bounds, then take the CGRect `.integral` (outward-rounded) box.
    left, top = max(0.0, left), max(0.0, top)
    right, bottom = min(float(width), right), min(float(height), bottom)
    x0, y0 = int(math.floor(left)), int(math.floor(top))
    x1, y1 = int(math.ceil(right)), int(math.ceil(bottom))
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(width, x1), min(height, y1)
    roi_width, roi_height = x1 - x0, y1 - y0

    minimum_width = max(MINIMUM_PERSON_ROI_DIMENSION_PIXELS, width * MINIMUM_PERSON_ROI_DIMENSION_PROPORTION)
    minimum_height = max(MINIMUM_PERSON_ROI_DIMENSION_PIXELS, height * MINIMUM_PERSON_ROI_DIMENSION_PROPORTION)
    if roi_width < minimum_width or roi_height < minimum_height:
        return None
    return (x0, y0, roi_width, roi_height)


# --------------------------------------------------------------------------- sequence assembly


def quality_reasons(output: PassResult, release_proxy_ms: int) -> list[str]:
    reasons: list[str] = []
    if output.detected < MINIMUM_DETECTED_FRAMES:
        reasons.append("too_few_detected_frames")
    ratio = 0.0 if output.attempted == 0 else output.detected / output.attempted
    if ratio < MINIMUM_FINAL_DETECTION_RATIO:
        reasons.append("low_detection_ratio")
    low_coverage = False
    for index in CRITICAL_LANDMARK_INDICES:
        if not output.frames:
            low_coverage = True
            break
        visible = sum(1 for frame in output.frames if frame.landmarks[index].visibility >= MINIMUM_CRITICAL_JOINT_VISIBILITY)
        if visible / len(output.frames) < MINIMUM_CRITICAL_JOINT_COVERAGE:
            low_coverage = True
            break
    if low_coverage:
        reasons.append("low_critical_joint_coverage")

    before: int | None = None
    after: int | None = None
    for attempt in output.attempts:
        stamp = attempt.detected_timestamp_ms
        if stamp is None:
            continue
        if stamp <= release_proxy_ms and (before is None or stamp > before):
            before = stamp
        if stamp >= release_proxy_ms and (after is None or stamp < after):
            after = stamp
    if before is None or after is None or after - before > MAXIMUM_RELEASE_PROXY_DETECTION_GAP_MS:
        reasons.append("critical_phase_gap")
    return reasons


def build_sequence(
    clip: DecodedClip,
    locator: PassResult,
    output: PassResult,
    roi: tuple[int, int, int, int],
    release_proxy_ms: int,
    view: str,
    shooting_hand: str,
    take_index: int,
) -> dict[str, Any]:
    x, y, roi_width, roi_height = roi
    reasons = quality_reasons(output, release_proxy_ms)
    frames = []
    for frame in output.frames:
        source_landmarks = []
        for landmark in frame.landmarks:
            # Restore crop-relative model coordinates to upright-source normalized,
            # exactly as `restoreSourcePoint` does for rotation 0, unmirrored,
            # full model content rect.
            source_landmarks.append(
                {
                    "x": (x + landmark.x * roi_width) / clip.width,
                    "y": (y + landmark.y * roi_height) / clip.height,
                    "z": landmark.z,
                    "visibility": landmark.visibility,
                }
            )
        frames.append(
            {
                "timestampMs": frame.timestamp_ms,
                "sourceLandmarks": source_landmarks,
                "cropRectPx": {"x": x, "y": y, "width": roi_width, "height": roi_height},
                "modelToSourcePx": [roi_width, 0, x, 0, roi_height, y, 0, 0, 1],
            }
        )
    return {
        "version": 2,
        "view": view,
        "shootingHand": shooting_hand,
        "takeIndex": take_index,
        "metadata": {
            "durationMs": clip.duration_ms,
            "displayWidth": clip.width,
            "displayHeight": clip.height,
            "nominalFrameRate": clip.fps,
            "frameRateMode": "constant",
            "locatorAttemptedFrames": locator.attempted,
            "locatorDecodedFrames": locator.decoded,
            "locatorDetectedFrames": locator.detected,
            "attemptedFrames": output.attempted,
            "decodedFrames": output.decoded,
            "detectedFrames": output.detected,
            "rejectedFrames": output.attempted - output.detected,
            "releaseProxyTimestampMs": release_proxy_ms,
            "attempts": [
                {
                    "requestedTimestampMs": attempt.requested_timestamp_ms,
                    "decodedTimestampMs": attempt.decoded_timestamp_ms,
                    "detectedTimestampMs": attempt.detected_timestamp_ms,
                }
                for attempt in output.attempts
            ],
        },
        "frames": frames,
        "transformConvention": "upright_source_top_left_v1",
        "quality": {"passed": len(reasons) == 0, "reasons": reasons},
    }


def extract(
    video: Path,
    model: Path,
    view: str,
    shooting_hand: str,
    take_index: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    clip = decode_clip(video)
    duration = clip.duration_seconds

    locator_landmarker = make_landmarker(model)
    locator = run_pass(clip, locator_landmarker, coarse_timestamps(duration), roi=None, collect_motion=True)
    locator_landmarker.close()

    roi = derive_stable_roi(locator, clip.width, clip.height)
    if roi is None:
        raise ExtractionError("person_roi_unavailable")
    if not locator.motion:
        raise ExtractionError("person_roi_unavailable")

    strongest_ms, strongest_value = max(locator.motion, key=lambda item: (item[1], -item[0]))
    release_proxy_ms = strongest_ms
    if not 0 <= release_proxy_ms <= clip.duration_ms:
        raise ExtractionError("person_roi_unavailable")

    requested = merged_timestamps([coarse_timestamps(duration), dense_timestamps(duration, strongest_ms / 1000)])
    output_landmarker = make_landmarker(model)
    output = run_pass(clip, output_landmarker, requested, roi=roi, collect_motion=False)
    output_landmarker.close()

    sequence = build_sequence(clip, locator, output, roi, release_proxy_ms, view, shooting_hand, take_index)
    diagnostics = {
        "extractionMethod": "offline_adapter",
        "model": model.name,
        "decodedSourceFrames": len(clip.frames),
        "sourceFps": clip.fps,
        "durationMs": clip.duration_ms,
        "locator": {
            "attempted": locator.attempted,
            "decoded": locator.decoded,
            "detected": locator.detected,
            "detectionRatio": 0.0 if locator.attempted == 0 else locator.detected / locator.attempted,
        },
        "personRoiPx": {"x": roi[0], "y": roi[1], "width": roi[2], "height": roi[3]},
        "releaseProxyTimestampMs": release_proxy_ms,
        "strongestLocatorMotion": strongest_value,
        "output": {
            "attempted": output.attempted,
            "decoded": output.decoded,
            "detected": output.detected,
            "detectionRatio": 0.0 if output.attempted == 0 else output.detected / output.attempted,
        },
        "criticalJointCoverage": {
            str(index): (
                sum(1 for frame in output.frames if frame.landmarks[index].visibility >= MINIMUM_CRITICAL_JOINT_VISIBILITY)
                / len(output.frames)
                if output.frames
                else 0.0
            )
            for index in CRITICAL_LANDMARK_INDICES
        },
        "quality": sequence["quality"],
    }
    return sequence, diagnostics


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--view", required=True, choices=["front", "shooting_side"])
    parser.add_argument("--hand", required=True, choices=["left", "right"])
    parser.add_argument("--take-index", type=int, default=0, choices=[0, 1, 2])
    parser.add_argument("--output", required=True, type=Path, help="private landmark JSON path, outside the repo")
    parser.add_argument("--diagnostics", type=Path, help="optional derived-metrics JSON path")
    arguments = parser.parse_args(argv)

    try:
        sequence, diagnostics = extract(
            arguments.video, arguments.model, arguments.view, arguments.hand, arguments.take_index
        )
    except ExtractionError as error:
        sys.stderr.write(f"extraction_failed reason={error.reason}\n")
        return 2

    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(sequence), encoding="utf-8")
    if arguments.diagnostics:
        arguments.diagnostics.parent.mkdir(parents=True, exist_ok=True)
        arguments.diagnostics.write_text(json.dumps(diagnostics, indent=2), encoding="utf-8")
    sys.stdout.write(json.dumps(diagnostics, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
