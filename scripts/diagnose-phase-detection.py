"""Phase-detection and release-proxy diagnostics for one LandmarkSequenceV2.

Evidence gathering only. This script changes nothing and decides nothing: it
reports the signals the production detector uses so a Phase Detector v2 or
Release Proxy v2 can be argued from data instead of from a failing clip.

It mirrors `detectPhaseAnchors` in
`lib/shooting-profile/phase-normalization.ts` and reads the same
`ENGINEERING_THRESHOLDS_V1` values, but it never substitutes for the
production detector: `pnpm eval:two-view` remains the authoritative verdict.

Input is private extracted landmarks. Keep them and the output outside git.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
from pathlib import Path
from typing import Any

MIN_OBSERVATION_VISIBILITY = 0.5
MIN_BODY_SCALE = 0.12
MIN_TOTAL_MOTION_BODY_SCALES = 0.30
MAX_READY_BASELINE_EXCURSION = 0.03
MIN_DIP_EXCURSION = 0.12
MIN_POST_DIP_RISE = 0.10
MIN_WRIST_RISE = 0.25
MIN_WRIST_EXTENSION = 0.04
MIN_RELEASE_VELOCITY = 1.0
MIN_FOLLOW_THROUGH_ELAPSED_MS = 120
MAX_FOLLOW_THROUGH_WRIST_DROP = 0.15
MAX_FOLLOW_THROUGH_EXTENSION_LOSS = 0.03
RELEASE_VELOCITY_WEIGHTS = (0.55, 0.25, 0.10, 0.06, 0.04)


def isotropic(point: dict[str, float], width: int, height: int) -> tuple[float, float]:
    return ((point["x"] - 0.5) * (width / height), point["y"] - 0.5)


def distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def tracked_indices(shooting_hand: str) -> dict[str, int]:
    if shooting_hand == "right":
        return {"elbow": 14, "wrist": 16, "knee": 26, "ankle": 28}
    return {"elbow": 13, "wrist": 15, "knee": 25, "ankle": 27}


def diagnose(path: Path) -> dict[str, Any]:
    sequence = json.loads(path.read_text(encoding="utf-8"))
    width = sequence["metadata"]["displayWidth"]
    height = sequence["metadata"]["displayHeight"]
    hand = sequence["shootingHand"]
    side = tracked_indices(hand)
    frames = sequence["frames"]
    timestamps = [frame["timestampMs"] for frame in frames]

    report: dict[str, Any] = {
        "view": sequence["view"],
        "shootingHand": hand,
        "detectedFrames": len(frames),
        "durationMs": sequence["metadata"]["durationMs"],
        "releaseProxyTimestampMs": sequence["metadata"]["releaseProxyTimestampMs"],
    }

    needed = [side["wrist"], side["elbow"], 23, 24, side["knee"], side["ankle"]]
    below = {
        index: sum(
            1
            for frame in frames
            if (frame["sourceLandmarks"][index].get("visibility") or 0.0) < MIN_OBSERVATION_VISIBILITY
        )
        for index in needed
    }
    report["trackedLandmarkFramesBelowFloor"] = {str(k): v for k, v in below.items() if v}
    if any(below.values()):
        report["stopsAt"] = "invalid_phase_observation"
        return report

    points = []
    for frame in frames:
        marks = frame["sourceLandmarks"]
        wrist = isotropic(marks[side["wrist"]], width, height)
        elbow = isotropic(marks[side["elbow"]], width, height)
        left_hip = isotropic(marks[23], width, height)
        right_hip = isotropic(marks[24], width, height)
        pelvis = ((left_hip[0] + right_hip[0]) / 2, (left_hip[1] + right_hip[1]) / 2)
        points.append([wrist, elbow, pelvis, isotropic(marks[side["knee"]], width, height), isotropic(marks[side["ankle"]], width, height)])

    body_scale = statistics.median([distance(p[2], p[3]) + distance(p[3], p[4]) for p in points])
    report["bodyScale"] = round(body_scale, 5)

    def down(index: int) -> float:
        return points[index][2][1] * 0.6 + points[index][3][1] * 0.25 + points[index][4][1] * 0.15

    # Wrist vertical velocity and elbow-extension velocity, in body scales per second.
    wrist_velocity: list[tuple[int, float]] = []
    extension_velocity: list[tuple[int, float]] = []
    for index in range(1, len(points)):
        seconds = (timestamps[index] - timestamps[index - 1]) / 1000
        if seconds <= 0:
            continue
        rise = (points[index - 1][0][1] - points[index][0][1]) / body_scale / seconds
        extension_now = distance(points[index][1], points[index][0])
        extension_before = distance(points[index - 1][1], points[index - 1][0])
        wrist_velocity.append((timestamps[index], rise))
        extension_velocity.append((timestamps[index], (extension_now - extension_before) / body_scale / seconds))

    if not wrist_velocity or not extension_velocity:
        # A clip rejected for too few frames is exactly the kind worth
        # diagnosing, so report that instead of failing on an empty series.
        report["stopsAt"] = "insufficient_detected_frames"
        return report

    peak_wrist = max(wrist_velocity, key=lambda item: item[1])
    peak_extension = max(extension_velocity, key=lambda item: item[1])
    highest_wrist_index = min(range(len(points)), key=lambda index: points[index][0][1])
    report["wristVerticalVelocityBodyScalesPerSecond"] = {
        "peak": round(peak_wrist[1], 3),
        "peakTimestampMs": peak_wrist[0],
        "median": round(statistics.median([value for _, value in wrist_velocity]), 3),
    }
    report["elbowExtensionVelocityBodyScalesPerSecond"] = {
        "peak": round(peak_extension[1], 3),
        "peakTimestampMs": peak_extension[0],
    }
    report["highestWrist"] = {
        "timestampMs": timestamps[highest_wrist_index],
        "heightAboveShoulderBodyScales": round(
            (isotropic(frames[highest_wrist_index]["sourceLandmarks"][11 if hand == "left" else 12], width, height)[1]
             - points[highest_wrist_index][0][1]) / body_scale,
            3,
        ),
    }

    # Every dip candidate, not just the global maximum the detector takes.
    candidates = []
    for index in range(1, len(points) - 3):
        value = down(index)
        is_local_max = value >= down(index - 1) and value >= down(index + 1)
        if not is_local_max:
            continue
        best_rise = max(((value - down(later)) / body_scale for later in range(index + 1, len(points))), default=0.0)
        pre = [down(earlier) for earlier in range(index)]
        excursion = (value - min(pre)) / body_scale if pre else 0.0
        candidates.append({
            "timestampMs": timestamps[index],
            "signal": round(value, 4),
            "dipExcursionBodyScales": round(excursion, 3),
            "bestPostDipRiseBodyScales": round(best_rise, 3),
            "framesAfter": len(points) - index - 1,
            "completesCycle": excursion >= MIN_DIP_EXCURSION and best_rise >= MIN_POST_DIP_RISE,
        })
    chosen = max(candidates, key=lambda item: item["signal"]) if candidates else None
    report["dipCandidates"] = candidates
    report["detectorChosenDip"] = chosen
    report["dipCandidatesCompletingCycle"] = [c for c in candidates if c["completesCycle"]]

    # Release proxy error: locator-derived proxy against the detector's release.
    release = None
    if chosen is not None and chosen["completesCycle"]:
        dip_index = next(i for i, t in enumerate(timestamps) if t == chosen["timestampMs"])
        extension_at_dip = distance(points[dip_index][1], points[dip_index][0])
        # The production detector searches for the release only after the rise,
        # which is the first post-dip frame that recovers the rise threshold.
        rise_index = next(
            (i for i in range(dip_index + 1, len(points))
             if (down(dip_index) - down(i)) / body_scale >= MIN_POST_DIP_RISE),
            None,
        )
        report["detectorRiseTimestampMs"] = None if rise_index is None else timestamps[rise_index]
        best = None
        for index in range(len(points) if rise_index is None else rise_index + 1, len(points)):
            seconds = (timestamps[index] - timestamps[index - 1]) / 1000
            if seconds <= 0:
                continue
            displacement = sum(
                distance(points[index - 1][k], points[index][k]) * RELEASE_VELOCITY_WEIGHTS[k] for k in range(5)
            )
            velocity = displacement / body_scale / seconds
            wrist_rise = (points[dip_index][0][1] - points[index][0][1]) / body_scale
            extension_gain = (distance(points[index][1], points[index][0]) - extension_at_dip) / body_scale
            if wrist_rise < MIN_WRIST_RISE or extension_gain < MIN_WRIST_EXTENSION:
                continue
            if best is None or velocity > best[1]:
                best = (timestamps[index], velocity)
        if best is not None and best[1] >= MIN_RELEASE_VELOCITY:
            release = {"timestampMs": best[0], "velocityBodyScalesPerSecond": round(best[1], 3)}
    report["detectorRelease"] = release
    if release is not None:
        report["releaseProxyErrorMs"] = sequence["metadata"]["releaseProxyTimestampMs"] - release["timestampMs"]
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sequences", nargs="+", type=Path)
    parser.add_argument("--output", type=Path)
    arguments = parser.parse_args()

    reports = {path.stem: diagnose(path) for path in arguments.sequences}
    serialized = json.dumps(reports, indent=2)
    if arguments.output:
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(serialized + "\n", encoding="utf-8")
    print(serialized)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
