"""Estimate a fixed dual-camera time offset from one shared flash or LED event.

Both cameras must observe the same deliberate synchronization flash before the
shooting take. This is not a substitute for a flash: it refuses ambiguous or
weak brightness spikes rather than guessing a correspondence from different
edited basketball clips.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--front-video", type=Path, required=True)
    parser.add_argument("--side-video", type=Path, required=True)
    parser.add_argument("--sample-fps", type=float, default=30.0)
    parser.add_argument("--min-spike-z", type=float, default=6.0)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def brightness_trace(path: Path, sample_fps: float) -> tuple[np.ndarray, np.ndarray]:
    capture = cv2.VideoCapture(str(path))
    native_fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    interval = max(1, round(native_fps / sample_fps))
    timestamps: list[float] = []
    brightness: list[float] = []
    index = 0
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            if index % interval == 0:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                timestamps.append(index * 1000.0 / native_fps)
                brightness.append(float(np.mean(gray)))
            index += 1
    finally:
        capture.release()
    if len(brightness) < 6:
        raise ValueError(f"Too few readable frames for sync trace: {path}")
    return np.asarray(timestamps), np.asarray(brightness)


def flash_event(timestamps: np.ndarray, values: np.ndarray, min_spike_z: float) -> tuple[float, float]:
    derivative = np.diff(values, prepend=values[0])
    median = float(np.median(derivative))
    mad = float(np.median(np.abs(derivative - median)))
    robust_sigma = max(1e-6, 1.4826 * mad)
    z_scores = (derivative - median) / robust_sigma
    index = int(np.argmax(z_scores))
    score = float(z_scores[index])
    if score < min_spike_z:
        raise ValueError(f"No unambiguous shared flash spike (best z={score:.2f}, required {min_spike_z:.2f})")
    return float(timestamps[index]), score


def main() -> int:
    args = parse_args()
    if args.sample_fps <= 0 or args.min_spike_z <= 0:
        raise SystemExit("sample-fps and min-spike-z must be positive")
    try:
        front_times, front_values = brightness_trace(args.front_video, args.sample_fps)
        side_times, side_values = brightness_trace(args.side_video, args.sample_fps)
        front_flash, front_score = flash_event(front_times, front_values, args.min_spike_z)
        side_flash, side_score = flash_event(side_times, side_values, args.min_spike_z)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    # A timestamp in a view is mapped into the front timeline by adding this offset.
    side_to_front_offset = front_flash - side_flash
    payload = {
        "version": 1,
        "kind": "shared_flash_dual_camera_sync",
        "referenceView": "front",
        "offsetsToFrontMs": {"front": 0.0, "side": round(side_to_front_offset, 3)},
        "events": {"frontFlashMs": round(front_flash, 3), "sideFlashMs": round(side_flash, 3)},
        "quality": {"passed": True, "frontSpikeZ": round(front_score, 3), "sideSpikeZ": round(side_score, 3), "minSpikeZ": args.min_spike_z},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({"state": "synchronized", "sideToFrontOffsetMs": payload["offsetsToFrontMs"]["side"], "quality": payload["quality"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
