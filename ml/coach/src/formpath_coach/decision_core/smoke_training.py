from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

import torch

from formpath_coach.decision_core.artifacts import (
    TrainingArtifactPaths,
    export_training_artifacts,
)
from formpath_coach.decision_core.calibration import fit_validation_temperatures
from formpath_coach.decision_core.motion_features import (
    PERSISTED_JOINT_NAMES_V2,
    RepresentativePoseInputV2,
    adapt_representative_pose_v1,
)
from formpath_coach.decision_core.system1 import System1BaselineV1
from formpath_coach.decision_core.trainer import TrainingConfig, fit_tiny
from formpath_coach.decision_core.training_data import (
    TrainingExampleV1,
    TrainingTargetV1,
)
from formpath_coach.decision_core.training_loss import encode_targets


@dataclass(frozen=True)
class SmokeTrainingResult:
    initial_train_loss: float
    final_train_loss: float
    train_loss_ratio: float
    best_validation_loss: float
    calibration_fitted_on: str
    capture_validity_temperature: float
    capture_validity_nll_before: float
    capture_validity_nll_after: float
    artifacts: TrainingArtifactPaths


def _smoke_pose(offset: float) -> RepresentativePoseInputV2:
    frames = []
    for index in range(101):
        phase = index / 100.0
        joints = {
            joint: [
                phase + offset + joint_index * 0.01,
                0.1 + joint_index * 0.02,
                -0.1 + phase * 0.05,
            ]
            for joint_index, joint in enumerate(PERSISTED_JOINT_NAMES_V2)
        }
        uncertainty = {
            joint: {
                "model": "heuristic_v1",
                "covariance": [0.01, 0.0, 0.0, 0.01, 0.0, 0.01],
                "directionalConeDegrees": 5.0,
            }
            for joint in PERSISTED_JOINT_NAMES_V2
        }
        frames.append({"phase": phase, "joints": joints, "uncertainty": uncertainty})

    return RepresentativePoseInputV2.model_validate(
        {
            "schemaVersion": 2,
            "boundary": "representative_phase_fused_4d_estimate_not_actual_3d",
            "mode": "basic_1_plus_1",
            "timeBasis": "normalized_shot_phase",
            "units": "template_shoulder_breadths",
            "frames": frames,
            "phaseAnchors": [],
            "quality": {"passed": True, "reasons": []},
        }
    )


def _smoke_example(example_id: str, offset: float, label: str) -> TrainingExampleV1:
    return TrainingExampleV1(
        schema_version=1,
        example_id=example_id,
        player_group_id=f"player_{example_id}",
        pose=_smoke_pose(offset),
        targets={
            "capture_validity": TrainingTargetV1(
                label=label,
                source="decision_core_smoke_v1",
                review_status="reviewed",
            )
        },
    )


def run_smoke_training(
    output_dir: str | Path,
    *,
    source_revision: str,
) -> SmokeTrainingResult:
    """Run deterministic synthetic training to verify the complete learning pipeline.

    This is a wiring/overfit smoke test. It is not basketball-accuracy evidence.
    Calibration uses validation examples only; the held-out fixture is never consumed.
    """

    train_examples = [
        _smoke_example("train_a", 0.00, "valid"),
        _smoke_example("train_b", 0.02, "valid"),
    ]
    validation_examples = [
        _smoke_example("validation_a", 0.005, "valid"),
        _smoke_example("validation_b", 0.010, "valid"),
        _smoke_example("validation_c", 0.015, "valid"),
        _smoke_example("validation_d", 0.020, "invalid"),
    ]
    held_out_examples = [_smoke_example("held_out_a", 0.03, "invalid")]

    torch.manual_seed(77)
    model = System1BaselineV1(hidden_dim=8)
    config = TrainingConfig(
        learning_rate=2e-2,
        weight_decay=0.0,
        gradient_clip_norm=1.0,
        batch_size=2,
        seed=42,
    )
    fit_result = fit_tiny(
        model,
        train_examples,
        validation_examples,
        config,
        epochs=20,
    )
    model.load_state_dict(fit_result.best_state_dict)
    model.eval()

    validation_features = torch.cat(
        [adapt_representative_pose_v1(example.pose) for example in validation_examples],
        dim=0,
    )
    validation_targets = encode_targets(validation_examples)
    with torch.no_grad():
        validation_logits = model(validation_features)
    calibration = fit_validation_temperatures(validation_logits, validation_targets)

    artifacts = export_training_artifacts(
        output_dir,
        model=model,
        fit_result=fit_result,
        config=config,
        calibration=calibration,
        split_counts={
            "train": len(train_examples),
            "validation": len(validation_examples),
            "test": len(held_out_examples),
        },
        model_revision="system1_smoke_v1",
        source_revision=source_revision,
    )

    initial_loss = float(fit_result.train_history[0])
    final_loss = float(fit_result.train_history[-1])
    capture_head = "capture_validity"
    return SmokeTrainingResult(
        initial_train_loss=initial_loss,
        final_train_loss=final_loss,
        train_loss_ratio=final_loss / initial_loss,
        best_validation_loss=float(fit_result.best_validation_loss),
        calibration_fitted_on=calibration.fitted_on,
        capture_validity_temperature=calibration.temperatures[capture_head],
        capture_validity_nll_before=calibration.nll_before[capture_head],
        capture_validity_nll_after=calibration.nll_after[capture_head],
        artifacts=artifacts,
    )


def _main() -> None:
    parser = argparse.ArgumentParser(description="Run the FormPath Decision Core smoke training")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--source-revision", required=True)
    args = parser.parse_args()

    result = run_smoke_training(args.output_dir, source_revision=args.source_revision)
    print(
        json.dumps(
            {
                "initial_train_loss": result.initial_train_loss,
                "final_train_loss": result.final_train_loss,
                "train_loss_ratio": result.train_loss_ratio,
                "best_validation_loss": result.best_validation_loss,
                "calibration_fitted_on": result.calibration_fitted_on,
                "capture_validity_temperature": result.capture_validity_temperature,
                "capture_validity_nll_before": result.capture_validity_nll_before,
                "capture_validity_nll_after": result.capture_validity_nll_after,
                "artifact_dir": str(result.artifacts.metrics_path.parent),
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    _main()
