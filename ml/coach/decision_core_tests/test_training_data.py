from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from formpath_coach.decision_core.motion_features import (
    PERSISTED_JOINT_NAMES_V2,
    RepresentativePoseInputV2,
)
from formpath_coach.decision_core.training_data import (
    TrainingExampleV1,
    load_training_examples,
    split_examples_by_player,
)


def _pose() -> RepresentativePoseInputV2:
    frames = []
    for index in range(101):
        phase = index / 100.0
        joints = {
            joint: [phase, 0.1, -0.1]
            for joint in PERSISTED_JOINT_NAMES_V2
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


def _example(example_id: str, player_id: str) -> TrainingExampleV1:
    return TrainingExampleV1.model_validate(
        {
            "schema_version": 1,
            "example_id": example_id,
            "player_group_id": player_id,
            "pose": _pose().model_dump(by_alias=True, mode="json"),
            "targets": {
                "capture_validity": {
                    "label": "valid",
                    "source": "geometry_rule_v1",
                    "review_status": "machine",
                },
                "elbow_alignment": {
                    "label": "minor_issue",
                    "source": "human_annotation_v1",
                    "review_status": "reviewed",
                },
            },
        }
    )


def test_training_example_accepts_sparse_valid_targets() -> None:
    example = _example("ex_0001", "player_a")

    assert set(example.targets) == {"capture_validity", "elbow_alignment"}
    assert example.targets["capture_validity"].label == "valid"
    assert example.pose.schema_version == 2


def test_training_example_rejects_label_outside_head_vocabulary() -> None:
    payload = _example("ex_0002", "player_a").model_dump(by_alias=True, mode="json")
    payload["targets"]["elbow_alignment"]["label"] = "perfect"

    with pytest.raises(ValidationError, match="elbow_alignment"):
        TrainingExampleV1.model_validate(payload)


def test_loader_rejects_duplicate_example_ids(tmp_path: Path) -> None:
    row = _example("ex_duplicate", "player_a").model_dump(by_alias=True, mode="json")
    path = tmp_path / "training.jsonl"
    path.write_text(
        json.dumps(row, separators=(",", ":")) + "\n" + json.dumps(row, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="duplicate example_id"):
        load_training_examples(path)


def test_player_split_is_deterministic_and_leakage_safe() -> None:
    examples = [
        _example(f"ex_{player}_{clip}", f"player_{player}")
        for player in range(10)
        for clip in range(2)
    ]

    first = split_examples_by_player(examples, 0.7, 0.15, seed=42)
    second = split_examples_by_player(examples, 0.7, 0.15, seed=42)

    assert [[item.example_id for item in split] for split in first] == [
        [item.example_id for item in split] for split in second
    ]

    train, validation, test = first
    player_sets = [
        {item.player_group_id for item in split}
        for split in (train, validation, test)
    ]
    assert player_sets[0].isdisjoint(player_sets[1])
    assert player_sets[0].isdisjoint(player_sets[2])
    assert player_sets[1].isdisjoint(player_sets[2])
    assert len(train) + len(validation) + len(test) == len(examples)
