"""Build Curry's analysis-only display motion from the audited 2D source silhouette.

The input is five retained MediaPipe 2D phases. Each phase is pelvis-rooted,
scaled by the observed full-body image height, and has its visible source-bone
directions preserved. Median source 2D bone lengths remove only frame jitter.
No depth is inferred: every output z coordinate is zero.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np

PHASES = ["준비", "딥", "상승", "릴리스", "팔로우스루"]
BONES = [
    ("pelvis", "spine"), ("spine", "neck"), ("neck", "head"),
    ("neck", "leftShoulder"), ("leftShoulder", "leftElbow"), ("leftElbow", "leftWrist"),
    ("neck", "rightShoulder"), ("rightShoulder", "rightElbow"), ("rightElbow", "rightWrist"),
    ("pelvis", "leftHip"), ("leftHip", "leftKnee"), ("leftKnee", "leftAnkle"),
    ("pelvis", "rightHip"), ("rightHip", "rightKnee"), ("rightKnee", "rightAnkle"),
]
INDEX = {"head": 0, "leftShoulder": 11, "rightShoulder": 12, "leftElbow": 13, "rightElbow": 14, "leftWrist": 15, "rightWrist": 16, "leftHip": 23, "rightHip": 24, "leftKnee": 25, "rightKnee": 26, "leftAnkle": 27, "rightAnkle": 28}


def args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def key(parent: str, child: str) -> str:
    return f"{parent}->{child}"


def vec(value: dict[str, float]) -> np.ndarray:
    return np.array([value["x"], value["y"], 0.0], dtype=float)


def output_point(value: np.ndarray) -> dict[str, float]:
    return {"x": round(float(value[0]), 6), "y": round(float(value[1]), 6), "z": 0.0}


def source_joints(landmarks: list[dict[str, float]]) -> dict[str, np.ndarray]:
    shoulder_mid = (vec(landmarks[11]) + vec(landmarks[12])) / 2
    hip_mid = (vec(landmarks[23]) + vec(landmarks[24])) / 2
    body_height = max(landmarks[27]["y"], landmarks[28]["y"]) - landmarks[0]["y"]
    scale = max(float(body_height), 1e-6)
    joints: dict[str, np.ndarray] = {}
    for joint, landmark_index in INDEX.items():
        raw = vec(landmarks[landmark_index])
        joints[joint] = np.array([(raw[0] - hip_mid[0]) / scale, -(raw[1] - hip_mid[1]) / scale, 0.0], dtype=float)
    joints["pelvis"] = np.zeros(3)
    joints["neck"] = np.array([(shoulder_mid[0] - hip_mid[0]) / scale, -(shoulder_mid[1] - hip_mid[1]) / scale, 0.0], dtype=float)
    joints["spine"] = (joints["pelvis"] + joints["neck"]) / 2
    return joints


def main() -> int:
    options = args()
    source = json.loads(options.input.read_text(encoding="utf-8"))
    phases = source.get("phases", [])
    if source.get("state") != "review_only_not_3d" or [phase.get("label") for phase in phases] != PHASES:
        raise SystemExit("Input must be Curry's audited five-phase source 2D review")
    raw_frames = [source_joints(phase["landmarks"]) for phase in phases]
    source_lengths = {key(parent, child): [float(np.linalg.norm(frame[child] - frame[parent])) for frame in raw_frames] for parent, child in BONES}
    targets = {bone: round(float(np.median(lengths)), 6) for bone, lengths in source_lengths.items()}
    corrected_frames: list[dict[str, Any]] = []
    for phase, raw in zip(phases, raw_frames):
        corrected: dict[str, np.ndarray] = {"pelvis": np.zeros(3)}
        for parent, child in BONES:
            parent_position = corrected[parent]
            direction = raw[child] - raw[parent]
            length = float(np.linalg.norm(direction))
            if length < 1e-8:
                raise SystemExit(f"Source phase has a collapsed bone: {key(parent, child)}")
            corrected[child] = parent_position + (direction / length) * targets[key(parent, child)]
        corrected_frames.append({"label": phase["label"], "progress": phase["progress"], "joints": {name: output_point(value) for name, value in corrected.items()}})
    follow = corrected_frames[-1]["joints"]
    output = {
        "version": 3,
        "state": "single_view_auto_corrected_estimate_not_actual_3d",
        "boundary": "monocular_relative_pose_not_metric_3d",
        "player": "Stephen Curry",
        "shootingHandEstimate": "left",
        "sourceView": source["sourceView"],
        "inputQuality": source["inputQuality"],
        "sourceState": source["state"],
        "sourcePhaseTimestampsMs": [phase["sourceTimestampMs"] for phase in phases],
        "phaseAlignment": {"method": "direct_retained_source_2d_phases", "sourceFrameIndexes": [phase["sourceFrameIndex"] for phase in phases]},
        "autoCorrection": {
            "root": "pelvis_recentered_per_phase",
            "boneLength": "median_source_2d_visible_bone_length",
            "templateId": "curry_source_faithful_2d_silhouette_v1",
            "scaleBasis": "median_observed_full_body_2d_height",
            "targetBoneLengths": targets,
            "trajectory": "source_2d_parent_child_direction_and_phase_order_preserved",
            "depthTreatment": "z_fixed_to_zero_no_depth_inference",
            "beforeBoneLengthSpread": {bone: round(max(lengths) - min(lengths), 6) for bone, lengths in source_lengths.items()},
            "afterBoneLengthSpread": {bone: 0.0 for bone in targets},
            "meaning": "감사된 실제 2D source의 full-body silhouette과 왼손 shooting arm 방향을 유지합니다. 뼈 길이는 source 2D median으로만 안정화하며 z depth를 추정하지 않습니다.",
        },
        "formMatch": {
            "rubricVersion": "curry-source-video-form-match-v2",
            "checks": [
                {"id": "phase_order", "label": "준비→딥→상승→릴리스→팔로우스루 순서", "status": "match", "evidence": "retained source 2D review의 five phase timestamp를 직접 사용"},
                {"id": "shooting_arm_chain", "label": "왼쪽 shoulder–elbow–wrist chain 연속성", "status": "match", "evidence": "source 2D parent→child 방향을 유지하고 depth inference를 제거"},
                {"id": "release_wrist_height", "label": "팔로우스루에서 shooting wrist가 shooting shoulder보다 높음", "status": "match" if follow["leftWrist"]["y"] > follow["leftShoulder"]["y"] else "review", "evidence": f"follow-through wrist y={follow['leftWrist']['y']}, shoulder y={follow['leftShoulder']['y']}"},
                {"id": "form_details_unavailable", "label": "공·림·손가락·정확한 관절각·metric depth", "status": "unavailable", "evidence": "single-view source에는 calibration과 measured depth가 없음"},
            ],
        },
        "motion": {"id": "curry-front-side-auto-corrected-analysis-01", "boundary": "monocular_relative_pose_not_metric_3d", "frames": corrected_frames},
        "productAdmission": "forbidden_for_recommendation_and_actual_3d_library",
    }
    options.output.parent.mkdir(parents=True, exist_ok=True)
    options.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"sourcePhaseTimestampsMs": output["sourcePhaseTimestampsMs"], "shootingHand": output["shootingHandEstimate"], "depthTreatment": output["autoCorrection"]["depthTreatment"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
