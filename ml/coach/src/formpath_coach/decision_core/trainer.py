from __future__ import annotations

from dataclasses import dataclass

import torch
from torch import nn

from formpath_coach.decision_core.motion_features import adapt_representative_pose_v1
from formpath_coach.decision_core.training_data import TrainingExampleV1
from formpath_coach.decision_core.training_loss import encode_targets, multi_head_cross_entropy


@dataclass(frozen=True)
class TrainingConfig:
    learning_rate: float = 3e-4
    weight_decay: float = 1e-4
    gradient_clip_norm: float = 1.0
    batch_size: int = 8
    seed: int = 42

    def __post_init__(self) -> None:
        if self.learning_rate <= 0.0:
            raise ValueError("learning_rate must be positive")
        if self.weight_decay < 0.0:
            raise ValueError("weight_decay must be nonnegative")
        if self.gradient_clip_norm <= 0.0:
            raise ValueError("gradient_clip_norm must be positive")
        if self.batch_size <= 0:
            raise ValueError("batch_size must be positive")


@dataclass(frozen=True)
class EpochReport:
    total_loss: float
    batch_losses: tuple[float, ...]
    counts: dict[str, int]


@dataclass(frozen=True)
class TinyFitResult:
    train_history: tuple[float, ...]
    validation_history: tuple[float, ...]
    best_validation_loss: float
    best_state_dict: dict[str, torch.Tensor]


def create_optimizer(model: nn.Module, config: TrainingConfig) -> torch.optim.Optimizer:
    return torch.optim.AdamW(
        model.parameters(),
        lr=config.learning_rate,
        weight_decay=config.weight_decay,
    )


def _device_for(model: nn.Module) -> torch.device:
    try:
        return next(model.parameters()).device
    except StopIteration as exc:  # pragma: no cover - defensive invariant
        raise ValueError("model must have trainable parameters") from exc


def _batches(
    examples: list[TrainingExampleV1],
    batch_size: int,
) -> list[list[TrainingExampleV1]]:
    if not examples:
        raise ValueError("examples must not be empty")
    return [examples[start : start + batch_size] for start in range(0, len(examples), batch_size)]


def _prepare_batch(
    examples: list[TrainingExampleV1],
    device: torch.device,
) -> tuple[torch.Tensor, dict[str, torch.Tensor]]:
    features = torch.cat(
        [adapt_representative_pose_v1(example.pose) for example in examples],
        dim=0,
    ).to(device)
    targets = {
        head: values.to(device)
        for head, values in encode_targets(examples).items()
    }
    return features, targets


def _aggregate_epoch(
    batch_losses: list[tuple[float, int]],
    counts: dict[str, int],
) -> EpochReport:
    if not batch_losses:
        raise ValueError("epoch produced no batches")
    total_examples = sum(batch_size for _, batch_size in batch_losses)
    total_loss = sum(loss * batch_size for loss, batch_size in batch_losses) / total_examples
    return EpochReport(
        total_loss=total_loss,
        batch_losses=tuple(loss for loss, _ in batch_losses),
        counts=counts,
    )


def train_one_epoch(
    model: nn.Module,
    examples: list[TrainingExampleV1],
    optimizer: torch.optim.Optimizer,
    config: TrainingConfig,
) -> EpochReport:
    torch.manual_seed(config.seed)
    model.train()
    device = _device_for(model)
    losses: list[tuple[float, int]] = []
    counts: dict[str, int] = {}

    for batch in _batches(examples, config.batch_size):
        features, targets = _prepare_batch(batch, device)
        optimizer.zero_grad(set_to_none=True)
        logits = model(features)
        report = multi_head_cross_entropy(logits, targets)
        report.total.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), config.gradient_clip_norm)
        optimizer.step()

        losses.append((float(report.total.detach().cpu().item()), len(batch)))
        for head, count in report.counts.items():
            counts[head] = counts.get(head, 0) + count

    return _aggregate_epoch(losses, counts)


def evaluate(
    model: nn.Module,
    examples: list[TrainingExampleV1],
    config: TrainingConfig,
) -> EpochReport:
    was_training = model.training
    model.eval()
    device = _device_for(model)
    losses: list[tuple[float, int]] = []
    counts: dict[str, int] = {}

    try:
        with torch.no_grad():
            for batch in _batches(examples, config.batch_size):
                features, targets = _prepare_batch(batch, device)
                logits = model(features)
                report = multi_head_cross_entropy(logits, targets)
                losses.append((float(report.total.cpu().item()), len(batch)))
                for head, count in report.counts.items():
                    counts[head] = counts.get(head, 0) + count
    finally:
        if was_training:
            model.train()

    return _aggregate_epoch(losses, counts)


def fit_tiny(
    model: nn.Module,
    train_examples: list[TrainingExampleV1],
    validation_examples: list[TrainingExampleV1],
    config: TrainingConfig,
    *,
    epochs: int,
) -> TinyFitResult:
    """Run a deterministic tiny fit used to verify end-to-end training wiring."""

    if epochs <= 0:
        raise ValueError("epochs must be positive")
    if not train_examples:
        raise ValueError("train_examples must not be empty")
    if not validation_examples:
        raise ValueError("validation_examples must not be empty")

    optimizer = create_optimizer(model, config)
    train_history: list[float] = []
    validation_history: list[float] = []
    best_validation_loss = float("inf")
    best_state_dict: dict[str, torch.Tensor] = {}

    for _ in range(epochs):
        train_report = train_one_epoch(model, train_examples, optimizer, config)
        validation_report = evaluate(model, validation_examples, config)
        train_history.append(train_report.total_loss)
        validation_history.append(validation_report.total_loss)

        if validation_report.total_loss < best_validation_loss:
            best_validation_loss = validation_report.total_loss
            best_state_dict = {
                name: tensor.detach().cpu().clone()
                for name, tensor in model.state_dict().items()
            }

    return TinyFitResult(
        train_history=tuple(train_history),
        validation_history=tuple(validation_history),
        best_validation_loss=best_validation_loss,
        best_state_dict=best_state_dict,
    )
