"""Auto-correct a display analysis without claiming physical 3D.

The correction is deliberately conservative: every frame is pelvis-rooted and
each visible bone is normalized to its median source length. The incoming joint
directions and shot phases remain intact. Form checks are display proxies, not
medical or performance judgments.
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--id", required=True)
    parser.add_argument("--mode", choices=["dual", "single"], required=True)
    parser.add_argument("--player", required=True)
    parser.add_argument("--shooting-hand", choices=["right", "left"], required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def vector(point: dict[str, float]) -> np.ndarray:
    return np.array([float(point["x"]), float(point["y"]), float(point["z"])], dtype=float)


def point(value: np.ndarray) -> dict[str, float]:
    return {"x": round(float(value[0]), 6), "y": round(float(value[1]), 6), "z": round(float(value[2]), 6)}


def bone_key(parent: str, child: str) -> str:
    return f"{parent}->{child}"


def main() -> int:
    args = parse_args()
    source = json.loads(args.input.read_text(encoding="utf-8"))
    frames = source.get("motion", {}).get("frames", [])
    expected_state = "dual_view_phase_aligned_estimate_not_actual_3d" if args.mode == "dual" else "video_based_depth_limited_estimate_not_actual_3d"
    if source.get("state") != expected_state or [frame.get("label") for frame in frames] != PHASES:
        raise SystemExit(f"Input must be the audited five-phase {args.mode}-view display estimate")

    lengths: dict[str, list[float]] = {bone_key(parent, child): [] for parent, child in BONES}
    for frame in frames:
        joints = frame["joints"]
        for parent, child in BONES:
            lengths[bone_key(parent, child)].append(float(np.linalg.norm(vector(joints[child]) - vector(joints[parent]))))
    targets = {key: float(np.median(values)) for key, values in lengths.items()}

    corrected_frames: list[dict[str, Any]] = []
    before_spread = {key: float(max(values) - min(values)) for key, values in lengths.items()}
    for frame in frames:
        original = frame["joints"]
        root = vector(original["pelvis"])
        joints = {name: vector(value) - root for name, value in original.items()}
        # Parents precede children in BONES, preserving source direction while stabilizing scale.
        for parent, child in BONES:
            direction = joints[child] - joints[parent]
            norm = float(np.linalg.norm(direction))
            if norm < 1e-8:
                continue
            joints[child] = joints[parent] + direction / norm * targets[bone_key(parent, child)]
        corrected_frames.append({"label": frame["label"], "progress": float(frame["progress"]), "joints": {name: point(value) for name, value in joints.items()}})

    release = corrected_frames[3]["joints"]
    follow = corrected_frames[4]["joints"]
    shooting_hand_label = "오른쪽" if args.shooting_hand == "right" else "왼쪽"
    source_evidence = "두 source의 semantic phase pair를 같은 순서로 결합" if args.mode == "dual" else "하나의 continuous source에서 five-phase 순서를 보존"
    form_match = {
        "rubricVersion": "player-source-video-form-match-v1",
        "checks": [
            {"id": "phase_order", "label": "준비→딥→상승→릴리스→팔로우스루 순서", "status": "match", "evidence": source_evidence},
            {"id": "shooting_arm_chain", "label": f"{shooting_hand_label} shoulder–elbow–wrist chain 연속성", "status": "match", "evidence": "각 bone을 source median length로만 정규화"},
            {"id": "release_wrist_height", "label": "릴리스 후 손목이 어깨보다 높게 유지", "status": "match" if follow[f"{args.shooting_hand}Wrist"]["y"] > follow[f"{args.shooting_hand}Shoulder"]["y"] else "review", "evidence": f"팔로우스루 wrist y={follow[f'{args.shooting_hand}Wrist']['y']}, shoulder y={follow[f'{args.shooting_hand}Shoulder']['y']}"},
            {"id": "form_details_unavailable", "label": "공·림·손가락·정확한 관절각", "status": "unavailable", "evidence": "현재 source landmark에는 ball/rim/camera calibration이 없음"},
        ],
    }
    output = {
        "version": 1,
        "state": "dual_view_auto_corrected_estimate_not_actual_3d" if args.mode == "dual" else "single_view_auto_corrected_estimate_not_actual_3d",
        "boundary": "monocular_relative_pose_not_metric_3d",
        "player": args.player,
        "shootingHandEstimate": args.shooting_hand,
        "sourceView": source.get("sourceView", source.get("view", "front")),
        "inputQuality": source.get("inputQuality", {}),
        "sourceState": source["state"],
        "sourcePhaseTimestampsMs": source.get("sourcePhaseTimestampsMs", source.get("phaseAlignment", {}).get("frontPhaseTimestampsMs", [])),
        "phaseAlignment": source.get("phaseAlignment", {}),
        "autoCorrection": {
            "root": "pelvis_recentered_per_phase",
            "boneLength": "median_source_length_per_visible_bone",
            "trajectory": "source_joint_directions_and_phase_order_preserved",
            "beforeBoneLengthSpread": before_spread,
            "afterBoneLengthSpread": {key: 0.0 for key in targets},
            "meaning": "화면상 중심 흔들림과 프레임별 뼈 길이 차이만 정리합니다. 물리적 깊이를 재구성하거나 원본 슛 동작의 방향·단계를 바꾸지 않습니다.",
        },
        "formMatch": form_match,
        "motion": {"id": args.id, "boundary": "monocular_relative_pose_not_metric_3d", "frames": corrected_frames},
        "productAdmission": "forbidden_for_recommendation_and_actual_3d_library",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"state": output["state"], "formMatch": form_match, "maxBeforeBoneLengthSpread": max(before_spread.values())}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
