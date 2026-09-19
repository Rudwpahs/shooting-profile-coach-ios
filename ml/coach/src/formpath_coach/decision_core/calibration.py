from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

import torch
from torch.nn import functional as F

from formpath_coach.decision_core.schemas import DECISION_LABELS_V1

_PROBABILITY_TOLERANCE = 1e-6
_IGNORE_INDEX = -100


@dataclass(frozen=True)
class CalibrationResult:
    temperatures: dict[str, float]
    nll_before: dict[str, float]
    nll_after: dict[str, float]
    counts: dict[str, int]
    fitted_on: str = "validation"


def _finite_values(values: Sequence[float], *, name: str) -> tuple[float, ...]:
    if not values:
        raise ValueError(f"{name} must not be empty")
    result = tuple(float(value) for value in values)
    if not all(math.isfinite(value) for value in result):
        raise ValueError(f"{name} must contain only finite values")
    return result


def _probability_vector(probabilities: Sequence[float]) -> tuple[float, ...]:
    values = _finite_values(probabilities, name="probabilities")
    if any(value < 0.0 or value > 1.0 for value in values):
        raise ValueError("probabilities must be in [0, 1]")
    if not math.isclose(
        math.fsum(values),
        1.0,
        rel_tol=0.0,
        abs_tol=_PROBABILITY_TOLERANCE,
    ):
        raise ValueError("probabilities must sum to 1.0")
    return values


def _target_probability_vector(
    probabilities: Sequence[float],
    target_index: int,
) -> tuple[tuple[float, ...], int]:
    values = _probability_vector(probabilities)
    if isinstance(target_index, bool) or not isinstance(target_index, int):
        raise TypeError("target_index must be an integer")
    if target_index < 0 or target_index >= len(values):
        raise ValueError("target_index is out of range")
    return values, target_index


def softmax(logits: Sequence[float]) -> tuple[float, ...]:
    values = _finite_values(logits, name="logits")
    maximum = max(values)
    exponentials = tuple(math.exp(value - maximum) for value in values)
    denominator = math.fsum(exponentials)
    return tuple(value / denominator for value in exponentials)


def temperature_scale_logits(
    logits: Sequence[float],
    temperature: float,
) -> tuple[float, ...]:
    if not math.isfinite(temperature) or temperature <= 0.0:
        raise ValueError("temperature must be finite and greater than zero")
    values = _finite_values(logits, name="logits")
    return softmax(tuple(value / temperature for value in values))


def negative_log_likelihood(
    probabilities: Sequence[float],
    target_index: int,
) -> float:
    values, index = _target_probability_vector(probabilities, target_index)
    target_probability = values[index]
    if target_probability == 0.0:
        return math.inf
    return -math.log(target_probability)


def brier_score(probabilities: Sequence[float], target_index: int) -> float:
    values, index = _target_probability_vector(probabilities, target_index)
    return math.fsum(
        (probability - (1.0 if position == index else 0.0)) ** 2
        for position, probability in enumerate(values)
    )


def expected_calibration_error(
    confidences: Sequence[float],
    correctness: Sequence[bool],
    bins: int = 15,
) -> float:
    values = _finite_values(confidences, name="confidences")
    if len(values) != len(correctness):
        raise ValueError("confidences and correctness must have equal length")
    if isinstance(bins, bool) or not isinstance(bins, int) or bins <= 0:
        raise ValueError("bins must be a positive integer")
    if any(value < 0.0 or value > 1.0 for value in values):
        raise ValueError("confidences must be in [0, 1]")
    if not all(isinstance(value, bool) for value in correctness):
        raise ValueError("correctness must contain booleans")

    confidence_sums = [0.0] * bins
    correct_counts = [0] * bins
    sample_counts = [0] * bins

    for confidence, correct in zip(values, correctness, strict=True):
        bin_index = min(int(confidence * bins), bins - 1)
        confidence_sums[bin_index] += confidence
        correct_counts[bin_index] += int(correct)
        sample_counts[bin_index] += 1

    total = len(values)
    error = 0.0
    for confidence_sum, correct_count, sample_count in zip(
        confidence_sums,
        correct_counts,
        sample_counts,
        strict=True,
    ):
        if sample_count == 0:
            continue
        mean_confidence = confidence_sum / sample_count
        accuracy = correct_count / sample_count
        error += (sample_count / total) * abs(mean_confidence - accuracy)
    return error


def _active_calibration_rows(
    head: str,
    logits: torch.Tensor,
    targets: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor]:
    labels = DECISION_LABELS_V1.get(head)
    if labels is None:
        raise ValueError(f"unknown decision head: {head}")
    if logits.ndim != 2:
        raise ValueError(f"logits for {head} must have shape [batch, class]")
    if targets.ndim != 1:
        raise ValueError(f"targets for {head} must have shape [batch]")
    if logits.shape[0] != targets.shape[0]:
        raise ValueError(f"batch size mismatch for {head}")
    if logits.shape[1] != len(labels):
        raise ValueError(
            f"wrong class width for {head}: got {logits.shape[1]}, expected {len(labels)}"
        )
    if not torch.isfinite(logits).all():
        raise ValueError(f"logits for {head} must be finite")

    active = targets != _IGNORE_INDEX
    active_logits = logits[active].detach().to(device="cpu", dtype=torch.float64)
    active_targets = targets[active].detach().to(device="cpu", dtype=torch.long)
    if active_targets.numel() and (
        torch.any(active_targets < 0) or torch.any(active_targets >= len(labels))
    ):
        raise ValueError(f"target index out of range for {head}")
    return active_logits, active_targets


def _temperature_grid() -> tuple[float, ...]:
    lower = math.log(0.25)
    upper = math.log(16.0)
    candidates = {
        math.exp(lower + (upper - lower) * index / 128)
        for index in range(129)
    }
    candidates.add(1.0)
    return tuple(sorted(candidates))


def fit_validation_temperatures(
    logits_by_head: dict[str, torch.Tensor],
    targets_by_head: dict[str, torch.Tensor],
) -> CalibrationResult:
    """Fit one scalar temperature per decision head using validation labels only."""

    unknown = (set(logits_by_head) | set(targets_by_head)) - set(DECISION_LABELS_V1)
    if unknown:
        raise ValueError(f"unknown decision heads: {sorted(unknown)}")

    temperatures = {head: 1.0 for head in DECISION_LABELS_V1}
    counts = {head: 0 for head in DECISION_LABELS_V1}
    nll_before: dict[str, float] = {}
    nll_after: dict[str, float] = {}
    candidates = _temperature_grid()

    for head in DECISION_LABELS_V1:
        logits = logits_by_head.get(head)
        targets = targets_by_head.get(head)
        if logits is None or targets is None:
            continue

        active_logits, active_targets = _active_calibration_rows(head, logits, targets)
        count = int(active_targets.numel())
        counts[head] = count
        if count == 0:
            continue

        identity_loss = float(F.cross_entropy(active_logits, active_targets).item())
        best_temperature = 1.0
        best_loss = identity_loss
        for temperature in candidates:
            candidate_loss = float(
                F.cross_entropy(active_logits / temperature, active_targets).item()
            )
            if candidate_loss < best_loss:
                best_loss = candidate_loss
                best_temperature = temperature

        temperatures[head] = float(best_temperature)
        nll_before[head] = identity_loss
        nll_after[head] = best_loss

    return CalibrationResult(
        temperatures=temperatures,
        nll_before=nll_before,
        nll_after=nll_after,
        counts=counts,
    )


def apply_temperatures(
    logits_by_head: dict[str, torch.Tensor],
    temperatures: dict[str, float],
) -> dict[str, torch.Tensor]:
    calibrated: dict[str, torch.Tensor] = {}
    for head, logits in logits_by_head.items():
        if head not in DECISION_LABELS_V1:
            raise ValueError(f"unknown decision head: {head}")
        temperature = float(temperatures.get(head, 1.0))
        if not math.isfinite(temperature) or temperature <= 0.0:
            raise ValueError(f"temperature for {head} must be finite and positive")
        calibrated[head] = logits / temperature
    return calibrated
