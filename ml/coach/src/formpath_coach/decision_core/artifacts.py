from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import torch
from torch import nn

from formpath_coach.decision_core.calibration import CalibrationResult
from formpath_coach.decision_core.schemas import DECISION_LABELS_V1
from formpath_coach.decision_core.trainer import TinyFitResult, TrainingConfig


@dataclass(frozen=True)
class TrainingArtifactPaths:
    model_path: Path
    metrics_path: Path
    calibration_path: Path
    manifest_path: Path

    def __iter__(self):
        return iter(
            (
                self.model_path,
                self.metrics_path,
                self.calibration_path,
                self.manifest_path,
            )
        )


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def export_training_artifacts(
    output_dir: str | Path,
    *,
    model: nn.Module,
    fit_result: TinyFitResult,
    config: TrainingConfig,
    calibration: CalibrationResult,
    split_counts: dict[str, int],
    model_revision: str,
    source_revision: str,
) -> TrainingArtifactPaths:
    if not fit_result.train_history:
        raise ValueError("train_history must not be empty")
    if not fit_result.validation_history:
        raise ValueError("validation_history must not be empty")
    if not fit_result.best_state_dict:
        raise ValueError("best_state_dict must not be empty")
    if set(fit_result.best_state_dict) != set(model.state_dict()):
        raise ValueError("best_state_dict keys must match model state_dict")
    if set(split_counts) != {"train", "validation", "test"}:
        raise ValueError("split_counts must contain train, validation, and test")
    if any(isinstance(value, bool) or value < 0 for value in split_counts.values()):
        raise ValueError("split counts must be nonnegative integers")
    if not model_revision:
        raise ValueError("model_revision must not be empty")
    if not source_revision:
        raise ValueError("source_revision must not be empty")
    if calibration.fitted_on != "validation":
        raise ValueError("calibration must be fitted on validation data")

    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)

    paths = TrainingArtifactPaths(
        model_path=directory / "system1_model.pt",
        metrics_path=directory / "metrics.json",
        calibration_path=directory / "calibration.json",
        manifest_path=directory / "training_manifest.json",
    )

    state_dict = {
        name: tensor.detach().cpu().clone()
        for name, tensor in fit_result.best_state_dict.items()
    }
    torch.save(state_dict, paths.model_path)

    initial_loss = float(fit_result.train_history[0])
    final_loss = float(fit_result.train_history[-1])
    loss_ratio = final_loss / initial_loss if initial_loss != 0.0 else None
    metrics: dict[str, object] = {
        "schema_version": 1,
        "initial_train_loss": initial_loss,
        "final_train_loss": final_loss,
        "train_loss_ratio": loss_ratio,
        "best_validation_loss": float(fit_result.best_validation_loss),
        "train_history": [float(value) for value in fit_result.train_history],
        "validation_history": [
            float(value) for value in fit_result.validation_history
        ],
    }
    _write_json(paths.metrics_path, metrics)

    calibration_payload: dict[str, object] = {
        "schema_version": 1,
        "fitted_on": calibration.fitted_on,
        "held_out_used": False,
        "temperatures": calibration.temperatures,
        "nll_before": calibration.nll_before,
        "nll_after": calibration.nll_after,
        "counts": calibration.counts,
    }
    _write_json(paths.calibration_path, calibration_payload)

    manifest: dict[str, object] = {
        "schema_version": 1,
        "model_class": type(model).__name__,
        "model_revision": model_revision,
        "source_revision": source_revision,
        "training_config": asdict(config),
        "split_counts": split_counts,
        "decision_heads": {
            head: list(labels) for head, labels in DECISION_LABELS_V1.items()
        },
        "calibration_source": "validation_only",
        "held_out_used_for_calibration": False,
        "artifact_files": {
            "model": paths.model_path.name,
            "metrics": paths.metrics_path.name,
            "calibration": paths.calibration_path.name,
        },
    }
    _write_json(paths.manifest_path, manifest)
    return paths
