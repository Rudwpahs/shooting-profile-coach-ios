"""Find candidate shooting windows in CMU optical marker data.

Candidates are evidence labels, not approved shots. The script only uses measured
markers and keeps the original frame ranges for later visual and biomechanical review.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import ezc3d
import numpy as np


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--min-wrist-lift-mm", type=float, default=180.0)
    parser.add_argument("--min-gap-seconds", type=float, default=0.8)
    return parser.parse_args()


def marker_index(labels: list[str], suffix: str) -> int:
    target = suffix.removeprefix(":")
    for index, label in enumerate(labels):
        if label.strip().split(":")[-1] == target:
            return index
    raise ValueError(f"Missing marker ending with {suffix}")


def contiguous_runs(mask: np.ndarray) -> list[tuple[int, int]]:
    indices = np.flatnonzero(mask)
    if not len(indices):
        return []
    splits = np.where(np.diff(indices) > 1)[0] + 1
    return [(int(group[0]), int(group[-1])) for group in np.split(indices, splits)]


def main() -> int:
    args = parse_args()
    c3d = ezc3d.c3d(str(args.input))
    points = np.asarray(c3d["data"]["points"], dtype=float)
    labels = [str(label) for label in c3d["parameters"]["POINT"]["LABELS"]["value"]]
    rate = float(c3d["header"]["points"]["frame_rate"])
    first_frame = int(c3d["header"]["points"]["first_frame"])
    frame_count = points.shape[2]
    min_gap_frames = int(args.min_gap_seconds * rate)

    candidates: list[dict[str, object]] = []
    for side, wrist_suffix, shoulder_suffix, elbow_suffix in [
        ("right", ":RWRA", ":RSHO", ":RELB"),
        ("left", ":LWRA", ":LSHO", ":LELB"),
    ]:
        wrist = points[:3, marker_index(labels, wrist_suffix), :]
        shoulder = points[:3, marker_index(labels, shoulder_suffix), :]
        elbow = points[:3, marker_index(labels, elbow_suffix), :]
        wrist_lift = wrist[2] - shoulder[2]
        # Both vectors must originate at the elbow: a straight arm is 180°.
        upper = shoulder - elbow
        lower = wrist - elbow
        numerator = np.sum(upper * lower, axis=0)
        denominator = np.linalg.norm(upper, axis=0) * np.linalg.norm(lower, axis=0)
        elbow_angle = np.degrees(np.arccos(np.clip(numerator / np.maximum(denominator, 1e-6), -1, 1)))
        signal = np.isfinite(wrist_lift) & np.isfinite(elbow_angle) & (wrist_lift >= args.min_wrist_lift_mm) & (elbow_angle >= 135)
        runs = contiguous_runs(signal)
        last_peak = -min_gap_frames
        for start, end in runs:
            peak = start + int(np.argmax(wrist_lift[start : end + 1]))
            if peak - last_peak < min_gap_frames:
                continue
            last_peak = peak
            candidates.append({
                "side": side,
                "peakFrame": first_frame + peak,
                "peakTimestampMs": round(peak / rate * 1000, 1),
                "windowStartFrame": first_frame + max(0, peak - int(0.7 * rate)),
                "windowEndFrame": first_frame + min(frame_count - 1, peak + int(0.8 * rate)),
                "wristLiftMm": round(float(wrist_lift[peak]), 2),
                "elbowAngleDegrees": round(float(elbow_angle[peak]), 2),
                "evidence": "measured_optical_markers_only",
            })

    candidates.sort(key=lambda candidate: (-float(candidate["wristLiftMm"]), int(candidate["peakFrame"])))
    payload = {
        "version": 1,
        "boundary": "candidate_segments_require_visual_and_ball_event_review",
        "captureRate": rate,
        "candidateCount": len(candidates),
        "candidates": candidates,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"candidateCount": len(candidates), "topCandidates": candidates[:6]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
