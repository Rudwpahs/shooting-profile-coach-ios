"""Convert an approved CMU optical-marker C3D shooting segment into FormPath PoseMotion.

Only measured optical markers (or centroids of named measured markers) are used.
The output intentionally contains no source performer name, video, or player identity.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

import ezc3d
import numpy as np


PHASES = ["준비", "딥", "상승", "릴리스", "팔로우스루"]
JOINT_MARKERS = {
    "head": (":RFHD", ":LFHD", ":RBHD", ":LBHD"),
    "neck": (":CLAV",),
    "spine": (":T10",),
    "pelvis": (":RBWT", ":LBWT"),
    "leftShoulder": (":LSHO",),
    "leftElbow": (":LELB",),
    "leftWrist": (":LWRA", ":LWRB"),
    "rightShoulder": (":RSHO",),
    "rightElbow": (":RELB",),
    "rightWrist": (":RWRA", ":RWRB"),
    # The CMU suit has waist markers rather than anatomical hip-center markers.
    # These are measured marker proxies, not generated joints.
    "leftHip": (":LBWT",),
    "leftKnee": (":LKNE",),
    "leftAnkle": (":LANK",),
    "rightHip": (":RBWT",),
    "rightKnee": (":RKNE",),
    "rightAnkle": (":RANK",),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--window-start-frame", type=int, required=True)
    parser.add_argument("--window-end-frame", type=int, required=True)
    parser.add_argument("--peak-frame", type=int, required=True)
    parser.add_argument("--identity", default="anonymous_optical_mocap_subject")
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def point_index(labels: list[str], suffix: str) -> int:
    target = suffix.removeprefix(":")
    return next(index for index, label in enumerate(labels) if label.strip().split(":")[-1] == target)


def measured_joints(points: np.ndarray, indexes: dict[str, list[int]], frame: int) -> dict[str, np.ndarray]:
    return {joint: np.nanmean(points[:3, marker_indexes, frame], axis=1) for joint, marker_indexes in indexes.items()}


def as_vector(point: np.ndarray) -> dict[str, float]:
    return {"x": round(float(point[0]), 5), "y": round(float(point[1]), 5), "z": round(float(point[2]), 5)}


def product_quality(motion: dict[str, Any]) -> dict[str, Any]:
    frames = motion["frames"]
    ready, dip, rise, release, follow = frames
    failures: list[str] = []
    if "|".join(frame["label"] for frame in frames) != "|".join(PHASES):
        failures.append("shot_phase_order")
    if not (dip["joints"]["pelvis"]["y"] < ready["joints"]["pelvis"]["y"] and rise["joints"]["pelvis"]["y"] > dip["joints"]["pelvis"]["y"]):
        failures.append("lower_body_sequence")
    if not (release["joints"]["rightWrist"]["y"] >= release["joints"]["rightShoulder"]["y"] + 0.58 and release["joints"]["rightElbow"]["y"] >= release["joints"]["rightShoulder"]["y"] + 0.22):
        failures.append("release_height_sequence")
    if not (follow["joints"]["rightWrist"]["z"] > release["joints"]["rightWrist"]["z"] and follow["joints"]["rightWrist"]["y"] >= follow["joints"]["rightShoulder"]["y"] + 0.62 and follow["joints"]["rightElbow"]["y"] >= follow["joints"]["rightShoulder"]["y"] + 0.15 and follow["joints"]["rightWrist"]["y"] >= follow["joints"]["head"]["y"] - 0.08):
        failures.append("follow_through_height_sequence")
    max_step = 0.0
    for previous, current in zip(frames, frames[1:]):
        for joint in JOINT_MARKERS:
            before, after = previous["joints"][joint], current["joints"][joint]
            max_step = max(max_step, math.dist((before["x"], before["y"], before["z"]), (after["x"], after["y"], after["z"])))
    if max_step > 1.35:
        failures.append("frame_discontinuity")
    return {"passed": not failures, "failures": failures, "maxJointStep": round(max_step, 5)}


def main() -> int:
    args = parse_args()
    file_hash = hashlib.sha256(args.input.read_bytes()).hexdigest()
    c3d = ezc3d.c3d(str(args.input))
    points = np.asarray(c3d["data"]["points"], dtype=float)
    labels = [str(label) for label in c3d["parameters"]["POINT"]["LABELS"]["value"]]
    first_frame = int(c3d["header"]["points"]["first_frame"])
    frame_rate = float(c3d["header"]["points"]["frame_rate"])
    source_count = points.shape[2]
    start, end, peak = (value - first_frame for value in (args.window_start_frame, args.window_end_frame, args.peak_frame))
    if not (0 <= start < peak < end < source_count):
        raise ValueError("segment frames must be inside the C3D and ordered start < peak < end")
    indexes = {joint: [point_index(labels, suffix) for suffix in suffixes] for joint, suffixes in JOINT_MARKERS.items()}
    all_joints = [measured_joints(points, indexes, frame) for frame in range(start, end + 1)]
    pelvis_height = np.array([joints["pelvis"][2] for joints in all_joints])
    peak_relative = peak - start
    dip_relative = int(np.argmin(pelvis_height[: peak_relative + 1]))
    if dip_relative == 0:
        raise ValueError("no measured lower-body dip before the candidate release frame")
    rise_relative = max(dip_relative + 1, round((dip_relative + peak_relative) / 2))

    release_wrist = all_joints[peak_relative]["rightWrist"]
    # Select a later measured high-hand pose with maximum forward displacement.
    # Its direction defines the display depth axis; this is a rigid horizontal rotation,
    # not a coordinate edit, and prevents source-specific lab axes from affecting quality.
    # Preserve the high hand posture immediately after release rather than selecting
    # the later recovery step. A 0.10–0.40 second measured interval is appropriate
    # at this 120fps source rate for a wrist-flick follow-through keyframe.
    follow_start = peak_relative + 12
    follow_end = min(peak_relative + 48, len(all_joints) - 1)
    if follow_start > follow_end:
        raise ValueError("candidate window is too short for measured follow-through selection")
    later = range(follow_start, follow_end + 1)
    follow_relative = max(later, key=lambda index: (
        all_joints[index]["rightWrist"][2] - all_joints[index]["rightShoulder"][2],
        np.linalg.norm((all_joints[index]["rightWrist"] - release_wrist)[:2]),
    ))
    selected_relative = [0, dip_relative, rise_relative, peak_relative, follow_relative]
    selected_source_frames = [first_frame + start + index for index in selected_relative]

    ready_joints = all_joints[0]
    origin = ready_joints["neck"]
    shoulder_width = np.linalg.norm(ready_joints["rightShoulder"] - ready_joints["leftShoulder"])
    if not np.isfinite(shoulder_width) or shoulder_width < 180:
        raise ValueError("invalid measured shoulder width for normalization")
    follow_direction = all_joints[follow_relative]["rightWrist"] - release_wrist
    horizontal = follow_direction[:2]
    if np.linalg.norm(horizontal) < 1.0:
        raise ValueError("follow-through has no measured horizontal displacement")
    depth_axis = horizontal / np.linalg.norm(horizontal)
    lateral_axis = np.array([-depth_axis[1], depth_axis[0]])

    def normalize(point: np.ndarray) -> np.ndarray:
        delta = point - origin
        return np.array((np.dot(delta[:2], lateral_axis) / shoulder_width, delta[2] / shoulder_width, np.dot(delta[:2], depth_axis) / shoulder_width))

    frames = []
    for phase_index, relative in enumerate(selected_relative):
        frames.append({
            "label": PHASES[phase_index],
            "progress": round(phase_index / (len(PHASES) - 1), 4),
            "joints": {joint: as_vector(normalize(point)) for joint, point in all_joints[relative].items()},
        })
    motion = {"id": "cmu-shoot-01", "boundary": "actual_optical_mocap_3d", "frames": frames}
    quality = product_quality(motion)
    result = {
        "version": 1,
        "state": "approved_actual_optical_mocap_3d" if quality["passed"] else "rejected_product_motion_quality",
        "boundary": "actual_optical_mocap_3d",
        "source": {
            "provider": "CMU Graphics Lab Motion Capture Database",
            "url": args.source_url,
            "sha256": file_hash,
            "identity": args.identity,
            "attributionRequired": True,
            "resaleRestriction": "raw_source_not_redistributed",
        },
        "capture": {"format": "c3d", "pointFrameRate": frame_rate, "firstFrame": first_frame, "sourceFrameCount": source_count},
        "jointDerivation": {"method": "named_measured_marker_or_named_marker_centroid", "markerMap": {joint: [suffix[1:] for suffix in suffixes] for joint, suffixes in JOINT_MARKERS.items()}},
        "segment": {"windowStartFrame": args.window_start_frame, "windowEndFrame": args.window_end_frame, "candidatePeakFrame": args.peak_frame, "selectedPhaseFrames": selected_source_frames},
        "normalization": {"origin": "ready_neck_measured_marker", "scale": "ready_measured_shoulder_width", "displayAxes": "vertical_z; depth=measured_release_to_follow_wrist_horizontal_direction"},
        "motion": motion,
        "quality": quality,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"state": result["state"], "phaseFrames": selected_source_frames, "quality": quality}, ensure_ascii=False))
    return 0 if quality["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
