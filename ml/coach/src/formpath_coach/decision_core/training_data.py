from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from formpath_coach.decision_core.motion_features import RepresentativePoseInputV2
from formpath_coach.decision_core.schemas import DECISION_LABELS_V1

_CODE_PATTERN = r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$"


class _TrainingModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class TrainingTargetV1(_TrainingModel):
    label: Annotated[str, Field(min_length=1, max_length=80)]
    source: Annotated[str, Field(pattern=_CODE_PATTERN)]
    review_status: Literal["machine", "reviewed", "teacher_only"]


class TrainingExampleV1(_TrainingModel):
    schema_version: Literal[1]
    example_id: Annotated[str, Field(pattern=_CODE_PATTERN)]
    player_group_id: Annotated[str, Field(pattern=_CODE_PATTERN)]
    pose: RepresentativePoseInputV2
    targets: dict[str, TrainingTargetV1]

    @model_validator(mode="after")
    def _validate_targets(self) -> TrainingExampleV1:
        if not self.targets:
            raise ValueError("targets must contain at least one labeled head")

        for head, target in self.targets.items():
            labels = DECISION_LABELS_V1.get(head)
            if labels is None:
                raise ValueError(f"unknown decision head: {head}")
            if target.label not in labels:
                raise ValueError(
                    f"invalid label for {head}: {target.label}; expected one of {labels}"
                )
        return self


def load_training_examples(path: str | Path) -> list[TrainingExampleV1]:
    source = Path(path)
    examples: list[TrainingExampleV1] = []
    seen_ids: set[str] = set()

    with source.open("r", encoding="utf-8") as handle:
        for line_no, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{source}: line {line_no}: malformed JSON: {exc.msg}") from exc
            if not isinstance(payload, dict):
                raise ValueError(f"{source}: line {line_no}: expected JSON object")

            example = TrainingExampleV1.model_validate(payload)
            if example.example_id in seen_ids:
                raise ValueError(f"duplicate example_id: {example.example_id}")
            seen_ids.add(example.example_id)
            examples.append(example)

    if not examples:
        raise ValueError(f"{source}: no training examples found")
    return examples


def split_examples_by_player(
    examples: list[TrainingExampleV1],
    train_fraction: float,
    validation_fraction: float,
    *,
    seed: int,
) -> tuple[list[TrainingExampleV1], list[TrainingExampleV1], list[TrainingExampleV1]]:
    if not examples:
        raise ValueError("examples must not be empty")
    if not 0.0 < train_fraction < 1.0:
        raise ValueError("train_fraction must be in (0, 1)")
    if not 0.0 <= validation_fraction < 1.0:
        raise ValueError("validation_fraction must be in [0, 1)")
    if train_fraction + validation_fraction >= 1.0:
        raise ValueError("train_fraction + validation_fraction must be less than 1")

    by_player: dict[str, list[TrainingExampleV1]] = {}
    for example in examples:
        by_player.setdefault(example.player_group_id, []).append(example)

    player_ids = sorted(by_player)
    random.Random(seed).shuffle(player_ids)

    group_count = len(player_ids)
    train_count = int(group_count * train_fraction)
    validation_count = int(group_count * validation_fraction)

    if group_count >= 3:
        train_count = max(1, train_count)
        validation_count = max(1, validation_count)
        if train_count + validation_count >= group_count:
            validation_count = 1
            train_count = group_count - 2

    train_players = set(player_ids[:train_count])
    validation_players = set(player_ids[train_count : train_count + validation_count])
    test_players = set(player_ids[train_count + validation_count :])

    train: list[TrainingExampleV1] = []
    validation: list[TrainingExampleV1] = []
    test: list[TrainingExampleV1] = []

    for example in examples:
        if example.player_group_id in train_players:
            train.append(example)
        elif example.player_group_id in validation_players:
            validation.append(example)
        elif example.player_group_id in test_players:
            test.append(example)
        else:  # pragma: no cover - defensive invariant
            raise RuntimeError("player group was not assigned to a split")

    return train, validation, test
