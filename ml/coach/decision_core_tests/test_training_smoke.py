from __future__ import annotations

import torch

from formpath_coach.decision_core.system1 import System1BaselineV1
from formpath_coach.decision_core.trainer import TrainingConfig, fit_tiny
from ml.coach.decision_core_tests.test_trainer import _example


def test_tiny_controlled_dataset_overfits_and_captures_best_state() -> None:
    torch.manual_seed(77)
    model = System1BaselineV1(hidden_dim=8)
    train_examples = [
        _example("smoke_a", 0.00, "valid"),
        _example("smoke_b", 0.02, "valid"),
    ]
    validation_examples = [_example("smoke_v", 0.01, "valid")]
    config = TrainingConfig(
        learning_rate=2e-2,
        weight_decay=0.0,
        gradient_clip_norm=1.0,
        batch_size=2,
        seed=42,
    )

    result = fit_tiny(
        model,
        train_examples,
        validation_examples,
        config,
        epochs=20,
    )

    assert len(result.train_history) == 20
    assert len(result.validation_history) == 20
    assert result.train_history[-1] < result.train_history[0] * 0.5
    assert result.best_validation_loss <= result.validation_history[0]
    assert result.best_state_dict
    assert set(result.best_state_dict) == set(model.state_dict())
