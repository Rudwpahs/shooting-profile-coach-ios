from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

import torch
from torch.nn import functional as F

from formpath_coach.decision_core.schemas import DECISION_LABELS_V1

_IGNORE_INDEX = -100


class _TargetLike(Protocol):
    label: str


class _ExampleLike(Protocol):
    targets: dict[str, _TargetLike]


@dataclass(frozen=True)
class LossReport:
    total: torch.Tensor
    per_head: dict[str, torch.Tensor]
    counts: dict[str, int]


def encode_targets(examples: Sequence[_ExampleLike]) -> dict[str, torch.Tensor]:
    """Encode sparse decision labels, using -100 for heads absent on an example."""

    if not examples:
        raise ValueError("examples must not be empty")

    encoded = {
        head: torch.full((len(examples),), _IGNORE_INDEX, dtype=torch.long)
        for head in DECISION_LABELS_V1
    }

    for row_index, example in enumerate(examples):
        for head, target in example.targets.items():
            labels = DECISION_LABELS_V1.get(head)
            if labels is None:
                raise ValueError(f"unknown decision head: {head}")
            try:
                label_index = labels.index(target.label)
            except ValueError as exc:
                raise ValueError(f"invalid label for {head}: {target.label}") from exc
            encoded[head][row_index] = label_index

    return encoded


def multi_head_cross_entropy(
    logits_by_head: dict[str, torch.Tensor],
    targets_by_head: dict[str, torch.Tensor],
) -> LossReport:
    """Compute the mean cross-entropy across heads that have at least one target."""

    if not logits_by_head:
        raise ValueError("logits_by_head must not be empty")
    if not targets_by_head:
        raise ValueError("targets_by_head must not be empty")

    per_head: dict[str, torch.Tensor] = {}
    counts: dict[str, int] = {}

    for head, targets in targets_by_head.items():
        labels = DECISION_LABELS_V1.get(head)
        if labels is None:
            raise ValueError(f"unknown decision head: {head}")
        if targets.ndim != 1:
            raise ValueError(f"targets for {head} must have shape [batch]")

        active = targets != _IGNORE_INDEX
        active_count = int(active.sum().item())
        counts[head] = active_count

        logits = logits_by_head.get(head)
        if logits is None:
            if active_count:
                raise ValueError(f"missing logits for labeled head: {head}")
            continue
        if logits.ndim != 2:
            raise ValueError(f"logits for {head} must have shape [batch, class]")
        if logits.shape[0] != targets.shape[0]:
            raise ValueError(f"batch size mismatch for {head}")
        if logits.shape[1] != len(labels):
            raise ValueError(
                f"wrong class width for {head}: got {logits.shape[1]}, expected {len(labels)}"
            )

        if active_count == 0:
            continue

        active_targets = targets[active]
        if torch.any(active_targets < 0) or torch.any(active_targets >= len(labels)):
            raise ValueError(f"target index out of range for {head}")
        per_head[head] = F.cross_entropy(logits[active], active_targets)

    if not per_head:
        raise ValueError("no active labeled heads in batch")

    total = torch.stack(list(per_head.values())).mean()
    return LossReport(total=total, per_head=per_head, counts=counts)
