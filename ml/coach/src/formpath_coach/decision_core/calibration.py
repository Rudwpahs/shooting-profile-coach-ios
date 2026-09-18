from __future__ import annotations

import math
from collections.abc import Sequence

_PROBABILITY_TOLERANCE = 1e-6


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
        raise ValueError("target_index must be an integer")
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
