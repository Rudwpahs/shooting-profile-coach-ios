"""Run an official MotionBERT checkpoint to lift Curry's retained 2D trajectory.

The learned model supplies a camera-relative depth *estimate* only. Source x/y
and phase timestamps remain authoritative; this script never promotes the output
to calibrated or actual 3D, body measurement, or recommendation input.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import torch

PHASES = ["준비", "딥", "상승", "릴리스", "팔로우스루"]
PHASE_INDEXES = [0, 16, 23, 30, 38]
BONES = [
    ("pelvis", "spine"), ("spine", "neck"), ("neck", "head"),
    ("neck", "leftShoulder"), ("leftShoulder", "leftElbow"), ("leftElbow", "leftWrist"),
    ("neck", "rightShoulder"), ("rightShoulder", "rightElbow"), ("rightElbow", "rightWrist"),
    ("pelvis", "leftHip"), ("leftHip", "leftKnee"), ("leftKnee", "leftAnkle"),
    ("pelvis", "rightHip"), ("rightHip", "rightKnee"), ("rightKnee", "rightAnkle"),
]
MEDIAPIPE_TO_H36M = {
    "pelvis": 0, "rightHip": 1, "rightKnee": 2, "rightAnkle": 3,
    "leftHip": 4, "leftKnee": 5, "leftAnkle": 6, "spine": 7,
    "neck": 8, "head": 10, "leftShoulder": 11, "leftElbow": 12,
    "leftWrist": 13, "rightShoulder": 14, "rightElbow": 15, "rightWrist": 16,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--motionbert-root", type=Path, default=Path("/home/ubuntu/motionbert-review"))
    parser.add_argument("--checkpoint", type=Path, default=Path("/home/ubuntu/motionbert-review/checkpoint/pose3d/FT_MB_release_MB_ft_h36m/best_epoch.bin"))
    return parser.parse_args()


def bone_key(parent: str, child: str) -> str:
    return f"{parent}->{child}"


def xy(landmark: dict[str, float]) -> np.ndarray:
    return np.array([float(landmark["x"]), float(landmark["y"])], dtype=float)


def product_xy_joints(landmarks: list[dict[str, float]]) -> dict[str, np.ndarray]:
    shoulder_mid = (xy(landmarks[11]) + xy(landmarks[12])) / 2
    hip_mid = (xy(landmarks[23]) + xy(landmarks[24])) / 2
    body_height = max(float(landmarks[27]["y"]), float(landmarks[28]["y"])) - float(landmarks[0]["y"])
    scale = max(body_height, 1e-6)
    source_index = {
        "head": 0, "leftShoulder": 11, "rightShoulder": 12, "leftElbow": 13,
        "rightElbow": 14, "leftWrist": 15, "rightWrist": 16, "leftHip": 23,
        "rightHip": 24, "leftKnee": 25, "rightKnee": 26, "leftAnkle": 27, "rightAnkle": 28,
    }
    result = {joint: np.array([(xy(landmarks[index])[0] - hip_mid[0]) / scale, -(xy(landmarks[index])[1] - hip_mid[1]) / scale], dtype=float) for joint, index in source_index.items()}
    result["pelvis"] = np.zeros(2)
    result["neck"] = np.array([(shoulder_mid[0] - hip_mid[0]) / scale, -(shoulder_mid[1] - hip_mid[1]) / scale], dtype=float)
    result["spine"] = (result["pelvis"] + result["neck"]) / 2
    return result


def h36m_input(landmarks: list[dict[str, float]]) -> np.ndarray:
    output = np.zeros((17, 3), dtype=np.float32)
    def set_joint(target: int, source: int | tuple[int, int]) -> None:
        values = np.mean([np.array([landmarks[index]["x"], landmarks[index]["y"], landmarks[index].get("visibility", 1.0)], dtype=np.float32) for index in (source if isinstance(source, tuple) else (source,))], axis=0)
        output[target] = values
    set_joint(0, (23, 24)); set_joint(1, 24); set_joint(2, 26); set_joint(3, 28)
    set_joint(4, 23); set_joint(5, 25); set_joint(6, 27); set_joint(7, (23, 24))
    output[7, :2] = (output[7, :2] + np.mean([output[11, :2], output[14, :2]], axis=0)) / 2
    set_joint(8, (11, 12)); set_joint(9, 0)
    # Head-top proxy is used only for the model's H36M 17-joint contract.
    output[10] = output[9]; output[10, 1] = output[9, 1] - abs(output[9, 1] - output[8, 1]) * 0.45
    output[10, 2] = output[9, 2]
    set_joint(11, 11); set_joint(12, 13); set_joint(13, 15)
    set_joint(14, 12); set_joint(15, 14); set_joint(16, 16)
    return output


def normalize_wild_sequence(sequence: np.ndarray) -> np.ndarray:
    valid = sequence[sequence[..., 2] > 0][:, :2]
    xmin, xmax = float(valid[:, 0].min()), float(valid[:, 0].max())
    ymin, ymax = float(valid[:, 1].min()), float(valid[:, 1].max())
    scale = max(xmax - xmin, ymax - ymin, 1e-6)
    xs, ys = (xmin + xmax - scale) / 2, (ymin + ymax - scale) / 2
    result = sequence.copy()
    result[..., :2] = (sequence[..., :2] - np.array([xs, ys], dtype=np.float32)) / scale
    result[..., :2] = (result[..., :2] - 0.5) * 2
    return np.clip(result, -1, 1)


def load_model(root: Path, checkpoint_path: Path) -> tuple[Any, str]:
    if not checkpoint_path.is_file():
        raise SystemExit(f"MotionBERT checkpoint not found: {checkpoint_path}")
    sys.path.insert(0, str(root))
    from lib.model.DSTformer import DSTformer  # type: ignore
    model = DSTformer(dim_in=3, dim_out=3, dim_feat=512, dim_rep=512, depth=5, num_heads=8, mlp_ratio=2, maxlen=243, num_joints=17)
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    checkpoint_state = {name.removeprefix("module."): value for name, value in checkpoint["model_pos"].items()}
    model.load_state_dict(checkpoint_state, strict=True)
    model.eval()
    return model, hashlib.sha256(checkpoint_path.read_bytes()).hexdigest()


def as_output(value: np.ndarray) -> dict[str, float]:
    return {"x": round(float(value[0]), 6), "y": round(float(value[1]), 6), "z": round(float(value[2]), 6)}


def main() -> int:
    args = parse_args()
    source = json.loads(args.input.read_text(encoding="utf-8"))
    frames = source.get("frames", [])
    if source.get("boundary") != "monocular_relative_pose_not_metric_3d" or not source.get("quality", {}).get("passed"):
        raise SystemExit("Input must be a quality-passed retained single-view Curry 2D trajectory")
    if len(frames) <= max(PHASE_INDEXES):
        raise SystemExit("Retained Curry source does not contain all five source phase indices")
    model, checkpoint_sha256 = load_model(args.motionbert_root, args.checkpoint)
    source_sequence = np.stack([h36m_input(frame["landmarks"]) for frame in frames])
    model_input = torch.from_numpy(normalize_wild_sequence(source_sequence)).unsqueeze(0)
    with torch.no_grad():
        prediction = model(model_input).squeeze(0).cpu().numpy()
    model_depth = prediction[..., 2] - prediction[:, :1, 2]
    robust_depth = max(float(np.percentile(np.abs(model_depth), 90)), 1e-6)
    depth_scale = 0.32 / robust_depth
    phase_raw: list[dict[str, np.ndarray]] = []
    for index in PHASE_INDEXES:
        source_xy = product_xy_joints(frames[index]["landmarks"])
        phase_raw.append({joint: np.array([source_xy[joint][0], source_xy[joint][1], float(np.clip(model_depth[index, h36m_index] * depth_scale, -0.36, 0.36))], dtype=float) for joint, h36m_index in MEDIAPIPE_TO_H36M.items()})
    lengths = {bone_key(parent, child): [float(np.linalg.norm(frame[child] - frame[parent])) for frame in phase_raw] for parent, child in BONES}
    targets = {bone: round(float(np.median(values)), 6) for bone, values in lengths.items()}
    motion_frames: list[dict[str, Any]] = []
    for phase_index, raw in enumerate(phase_raw):
        corrected: dict[str, np.ndarray] = {"pelvis": np.zeros(3)}
        for parent, child in BONES:
            direction = raw[child] - raw[parent]
            magnitude = float(np.linalg.norm(direction))
            if magnitude < 1e-8:
                raise SystemExit(f"Collapsed learned-lifted bone: {bone_key(parent, child)}")
            corrected[child] = corrected[parent] + direction / magnitude * targets[bone_key(parent, child)]
        motion_frames.append({"label": PHASES[phase_index], "progress": phase_index / 4, "joints": {joint: as_output(value) for joint, value in corrected.items()}})
    follow = motion_frames[-1]["joints"]
    output = {
        "version": 5,
        "state": "image_lifted_pose_estimate_not_actual_3d",
        "boundary": "monocular_relative_pose_not_metric_3d",
        "player": "Stephen Curry",
        "shootingHandEstimate": "left",
        "sourceView": "oblique",
        "inputQuality": source["quality"],
        "sourceState": source.get("state", "candidate"),
        "sourcePhaseTimestampsMs": [int(frames[index]["timestampMs"]) for index in PHASE_INDEXES],
        "phaseAlignment": {"method": "retained_single_source_temporal_indices", "sourceFrameIndexes": PHASE_INDEXES},
        "imageTo3DLift": {
            "method": "motionbert_h36m_finetuned_temporal_2d_to_3d_lift_v1",
            "inputContract": "retained_mediapipe_33_landmark_trajectory_to_h36m_17_joint_input",
            "sourceXY": "retained_source_2d_xy_preserved_in_product_motion",
            "learnedDepth": "MotionBERT_checkpoint_camera_relative_z_normalized_and_bounded",
            "checkpointSha256": checkpoint_sha256,
            "externalModelExecution": "executed_cpu",
            "boundary": "learned_image_lifted_estimate_not_metric_or_calibrated_3d",
            "meaning": "공식 MotionBERT checkpoint가 2D trajectory에서 camera-relative z를 학습 추정했습니다. calibration·metric scale·actual depth를 제공하지 않습니다.",
        },
        "autoCorrection": {
            "root": "pelvis_recentered_per_phase",
            "boneLength": "median_motionbert_lifted_3d_bone_length",
            "templateId": "curry_motionbert_h36m_temporal_lift_v1",
            "scaleBasis": "retained_source_2d_full_body_height_with_learned_depth_scale",
            "targetBoneLengths": targets,
            "trajectory": "retained_source_2d_xy_with_motionbert_temporal_depth_and_median_3d_bone_stabilization",
            "beforeBoneLengthSpread": {bone: round(max(values) - min(values), 6) for bone, values in lengths.items()},
            "afterBoneLengthSpread": {bone: 0.0 for bone in targets},
            "meaning": "학습된 camera-relative depth를 사용하되 source x/y·phase·left shooting hand를 보존한 display lift입니다. 실제·calibrated 3D 또는 측정값이 아닙니다.",
        },
        "formMatch": {
            "rubricVersion": "curry-source-video-form-match-v4-motionbert-lifted",
            "checks": [
                {"id": "phase_order", "label": "준비→딥→상승→릴리스→팔로우스루 순서", "status": "match", "evidence": "retained source trajectory의 original temporal index를 사용"},
                {"id": "shooting_arm_chain", "label": "왼쪽 shoulder–elbow–wrist chain 연속성", "status": "match", "evidence": "source image-plane x/y와 MotionBERT temporal depth lift를 결합"},
                {"id": "release_wrist_height", "label": "팔로우스루에서 shooting wrist가 shooting shoulder보다 높음", "status": "match" if follow["leftWrist"]["y"] > follow["leftShoulder"]["y"] else "review", "evidence": f"follow-through wrist y={follow['leftWrist']['y']}, shoulder y={follow['leftShoulder']['y']}"},
                {"id": "form_details_unavailable", "label": "공·림·손가락·정확한 관절각·metric depth", "status": "unavailable", "evidence": "single-view learned image lift에는 calibration과 measured depth가 없음"},
            ],
        },
        "motion": {"id": "curry-front-side-auto-corrected-analysis-01", "boundary": "monocular_relative_pose_not_metric_3d", "frames": motion_frames},
        "productAdmission": "forbidden_for_recommendation_and_actual_3d_library",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"state": output["state"], "timestamps": output["sourcePhaseTimestampsMs"], "model": output["imageTo3DLift"]["method"], "checkpointSha256": checkpoint_sha256[:12]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
