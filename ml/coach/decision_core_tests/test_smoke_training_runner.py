from __future__ import annotations

import json

from formpath_coach.decision_core.smoke_training import run_smoke_training


def test_smoke_training_runner_exports_real_metrics(tmp_path) -> None:
    result = run_smoke_training(tmp_path, source_revision="test-source")

    assert result.initial_train_loss > 0.0
    assert result.final_train_loss < result.initial_train_loss * 0.5
    assert result.train_loss_ratio < 0.5
    assert result.best_validation_loss > 0.0
    assert result.calibration_fitted_on == "validation"
    assert result.artifacts.model_path.exists()
    assert result.artifacts.metrics_path.exists()
    assert result.artifacts.calibration_path.exists()
    assert result.artifacts.manifest_path.exists()

    metrics = json.loads(result.artifacts.metrics_path.read_text(encoding="utf-8"))
    manifest = json.loads(result.artifacts.manifest_path.read_text(encoding="utf-8"))
    calibration = json.loads(result.artifacts.calibration_path.read_text(encoding="utf-8"))

    assert metrics["initial_train_loss"] == result.initial_train_loss
    assert metrics["final_train_loss"] == result.final_train_loss
    assert metrics["train_loss_ratio"] == result.train_loss_ratio
    assert manifest["source_revision"] == "test-source"
    assert manifest["held_out_used_for_calibration"] is False
    assert calibration["held_out_used"] is False
