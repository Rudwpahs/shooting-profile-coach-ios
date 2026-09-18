from __future__ import annotations

import torch

from formpath_coach.decision_core.motion_features import (
    PERSISTED_JOINT_NAMES_V2,
    RepresentativePoseInputV2,
)
from formpath_coach.decision_core.system1 import System1BaselineV1
from formpath_coach.decision_core.trainer import (
    TrainingConfig,
    create_optimizer,
    evaluate,
    train_one_epoch,
)
from formpath_coach.decision_core.training_data import (
    TrainingExampleV1,
    TrainingTargetV1,
)


def _pose(offset: float = 0.0) -> RepresentativePoseInputV2:
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


def _example(example_id: str, offset: float, label: str) -> TrainingExampleV1:
    return TrainingExampleV1(
        schema_version=1,
        example_id=example_id,
        player_group_id=f"player_{example_id}",
        pose=_pose(offset),
        targets={
            "capture_validity": TrainingTargetV1(
                label=label,
                source="test_fixture_v1",
                review_status="reviewed",
            )
        },
    )


def _examples() -> list[TrainingExampleV1]:
    return [
        _example("ex_a", 0.00, "valid"),
        _example("ex_b", 0.05, "invalid"),
    ]


def test_one_training_epoch_changes_at_least_one_parameter() -> None:
    torch.manual_seed(7)
    model = System1BaselineV1(hidden_dim=8)
    config = TrainingConfig(learning_rate=1e-2, batch_size=2, seed=42)
    optimizer = create_optimizer(model, config)
    before = {name: parameter.detach().clone() for name, parameter in model.named_parameters()}

    report = train_one_epoch(model, _examples(), optimizer, config)

    assert report.total_loss > 0.0
    assert any(
        not torch.allclose(before[name], parameter.detach())
        for name, parameter in model.named_parameters()
    )


def test_evaluate_does_not_mutate_parameters() -> None:
    torch.manual_seed(11)
    model = System1BaselineV1(hidden_dim=8)
    config = TrainingConfig(batch_size=2, seed=42)
    before = {name: parameter.detach().clone() for name, parameter in model.named_parameters()}

    report = evaluate(model, _examples(), config)

    assert report.total_loss > 0.0
    assert all(
        torch.equal(before[name], parameter.detach())
        for name, parameter in model.named_parameters()
    )


def test_same_seed_and_initialization_produce_repeatable_first_epoch_loss() -> None:
    config = TrainingConfig(learning_rate=1e-2, batch_size=2, seed=42)
    examples = _examples()

    torch.manual_seed(123)
    first = System1BaselineV1(hidden_dim=8)
    first_optimizer = create_optimizer(first, config)
    first_report = train_one_epoch(first, examples, first_optimizer, config)

    torch.manual_seed(123)
    second = System1BaselineV1(hidden_dim=8)
    second_optimizer = create_optimizer(second, config)
    second_report = train_one_epoch(second, examples, second_optimizer, config)

    assert first_report.total_loss == second_report.total_loss
