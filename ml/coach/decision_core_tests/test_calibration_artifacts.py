from __future__ import annotations

import json

import torch

from formpath_coach.decision_core.artifacts import export_training_artifacts
from formpath_coach.decision_core.calibration import (
    apply_temperatures,
    fit_validation_temperatures,
)
from formpath_coach.decision_core.schemas import DECISION_LABELS_V1
from formpath_coach.decision_core.system1 import System1BaselineV1
from formpath_coach.decision_core.trainer import TinyFitResult, TrainingConfig


def test_validation_only_temperature_fit_reduces_nll_without_mutating_logits() -> None:
    logits = {
        "capture_validity": torch.tensor(
            [[6.0, 0.0], [6.0, 0.0], [6.0, 0.0], [6.0, 0.0]],
            dtype=torch.float32,
        )
    }
    original = logits["capture_validity"].clone()
    targets = {"capture_validity": torch.tensor([0, 0, 0, 1], dtype=torch.long)}

    result = fit_validation_temperatures(logits, targets)

    assert set(result.temperatures) == set(DECISION_LABELS_V1)
    assert result.temperatures["capture_validity"] > 0.0
    assert result.counts["capture_validity"] == 4
    assert result.nll_after["capture_validity"] < result.nll_before["capture_validity"]
    assert result.fitted_on == "validation"
    assert torch.equal(logits["capture_validity"], original)

    calibrated = apply_temperatures(logits, result.temperatures)
    assert torch.equal(logits["capture_validity"], original)
    assert not torch.equal(calibrated["capture_validity"], original)


def test_export_training_artifacts_records_smoke_metrics_and_validation_calibration(
    tmp_path,
) -> None:
    torch.manual_seed(9)
    model = System1BaselineV1(hidden_dim=8)
    best_state = {
        name: tensor.detach().cpu().clone()
        for name, tensor in model.state_dict().items()
    }
    fit_result = TinyFitResult(
        train_history=(1.5, 0.9, 0.4),
        validation_history=(1.3, 0.8, 0.55),
        best_validation_loss=0.55,
        best_state_dict=best_state,
    )
    calibration = fit_validation_temperatures(
        {
            "capture_validity": torch.tensor(
                [[5.0, 0.0], [5.0, 0.0], [5.0, 0.0], [5.0, 0.0]],
                dtype=torch.float32,
            )
        },
        {"capture_validity": torch.tensor([0, 0, 0, 1], dtype=torch.long)},
    )
    config = TrainingConfig(
        learning_rate=2e-2,
        weight_decay=0.0,
        gradient_clip_norm=1.0,
        batch_size=2,
        seed=42,
    )

    paths = export_training_artifacts(
        tmp_path,
        model=model,
        fit_result=fit_result,
        config=config,
        calibration=calibration,
        split_counts={"train": 8, "validation": 2, "test": 2},
        model_revision="system1_smoke_v1",
        source_revision="f0f6959",
    )

    assert paths.model_path.name == "system1_model.pt"
    assert paths.metrics_path.name == "metrics.json"
    assert paths.calibration_path.name == "calibration.json"
    assert paths.manifest_path.name == "training_manifest.json"
    assert all(path.exists() for path in paths)

    saved_state = torch.load(paths.model_path, map_location="cpu", weights_only=True)
    assert set(saved_state) == set(best_state)

    metrics = json.loads(paths.metrics_path.read_text(encoding="utf-8"))
    assert metrics["initial_train_loss"] == 1.5
    assert metrics["final_train_loss"] == 0.4
    assert metrics["train_loss_ratio"] == 0.4 / 1.5
    assert metrics["best_validation_loss"] == 0.55
    assert metrics["train_history"] == [1.5, 0.9, 0.4]

    calibration_payload = json.loads(paths.calibration_path.read_text(encoding="utf-8"))
    assert calibration_payload["fitted_on"] == "validation"
    assert calibration_payload["held_out_used"] is False
    assert calibration_payload["temperatures"]["capture_validity"] > 0.0

    manifest = json.loads(paths.manifest_path.read_text(encoding="utf-8"))
    assert manifest["schema_version"] == 1
    assert manifest["model_revision"] == "system1_smoke_v1"
    assert manifest["source_revision"] == "f0f6959"
    assert manifest["split_counts"] == {"train": 8, "validation": 2, "test": 2}
    assert manifest["calibration_source"] == "validation_only"
    assert manifest["held_out_used_for_calibration"] is False
