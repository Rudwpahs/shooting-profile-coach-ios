from __future__ import annotations

import math

import pytest

from formpath_coach.decision_core.calibration import (
    brier_score,
    expected_calibration_error,
    negative_log_likelihood,
    softmax,
    temperature_scale_logits,
)


def test_softmax_is_normalized_and_stable_for_large_logits() -> None:
    probabilities = softmax([1000.0, 1001.0, 999.0])

    assert len(probabilities) == 3
    assert all(0.0 < probability < 1.0 for probability in probabilities)
    assert math.isclose(math.fsum(probabilities), 1.0, rel_tol=0.0, abs_tol=1e-12)
    assert probabilities[1] == max(probabilities)


def test_higher_temperature_flattens_distribution() -> None:
    cold = temperature_scale_logits([0.0, 2.0], temperature=1.0)
    warm = temperature_scale_logits([0.0, 2.0], temperature=2.0)

    assert cold[1] > warm[1] > 0.5
    assert math.isclose(math.fsum(warm), 1.0, rel_tol=0.0, abs_tol=1e-12)


def test_nll_matches_negative_log_of_target_probability() -> None:
    actual = negative_log_likelihood([0.1, 0.7, 0.2], target_index=1)

    assert math.isclose(actual, -math.log(0.7), rel_tol=0.0, abs_tol=1e-12)


def test_brier_matches_hand_computed_multiclass_example() -> None:
    actual = brier_score([0.1, 0.7, 0.2], target_index=1)

    assert math.isclose(actual, 0.14, rel_tol=0.0, abs_tol=1e-12)


def test_ece_matches_two_bin_hand_computed_example_and_includes_one() -> None:
    actual = expected_calibration_error(
        confidences=[0.2, 0.4, 0.8, 1.0],
        correctness=[False, True, True, False],
        bins=2,
    )

    assert math.isclose(actual, 0.30, rel_tol=0.0, abs_tol=1e-12)


@pytest.mark.parametrize(
    ("probabilities", "target_index"),
    [
        ([], 0),
        ([0.2, 0.2], 0),
        ([0.5, float("nan"), 0.5], 0),
        ([0.5, 0.5], 2),
    ],
)
def test_probability_metrics_reject_invalid_vectors(
    probabilities: list[float],
    target_index: int,
) -> None:
    with pytest.raises(ValueError):
        negative_log_likelihood(probabilities, target_index)
    with pytest.raises(ValueError):
        brier_score(probabilities, target_index)


@pytest.mark.parametrize("temperature", [0.0, -1.0, float("nan"), float("inf")])
def test_temperature_scaling_rejects_invalid_temperature(temperature: float) -> None:
    with pytest.raises(ValueError):
        temperature_scale_logits([0.0, 1.0], temperature)


def test_ece_rejects_invalid_inputs() -> None:
    with pytest.raises(ValueError):
        expected_calibration_error([], [], bins=2)
    with pytest.raises(ValueError):
        expected_calibration_error([0.5], [True, False], bins=2)
    with pytest.raises(ValueError):
        expected_calibration_error([1.1], [True], bins=2)
    with pytest.raises(ValueError):
        expected_calibration_error([0.5], [True], bins=0)
