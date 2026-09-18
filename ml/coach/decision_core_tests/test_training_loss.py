from __future__ import annotations

from types import SimpleNamespace

import torch
from torch.nn import functional as F

from formpath_coach.decision_core.training_data import TrainingTargetV1
from formpath_coach.decision_core.training_loss import (
    encode_targets,
    multi_head_cross_entropy,
)


def _target(label: str) -> TrainingTargetV1:
    return TrainingTargetV1(
        label=label,
        source="test_fixture_v1",
        review_status="reviewed",
    )


def test_encode_targets_maps_labels_and_masks_missing_heads() -> None:
    examples = [
        SimpleNamespace(targets={"capture_validity": _target("valid")}),
        SimpleNamespace(targets={"elbow_alignment": _target("minor_issue")}),
    ]

    encoded = encode_targets(examples)

    assert encoded["capture_validity"].tolist() == [0, -100]
    assert encoded["elbow_alignment"].tolist() == [-100, 1]
    assert encoded["balance"].tolist() == [-100, -100]


def test_multi_head_loss_ignores_missing_targets_and_reports_counts() -> None:
    targets = {
        "capture_validity": torch.tensor([0, -100], dtype=torch.long),
        "elbow_alignment": torch.tensor([-100, 1], dtype=torch.long),
    }
    logits = {
        "capture_validity": torch.tensor([[2.0, 0.0], [0.0, 2.0]], requires_grad=True),
        "elbow_alignment": torch.tensor(
            [[1.0, 0.0, 0.0, 0.0], [0.0, 2.0, 0.0, 0.0]],
            requires_grad=True,
        ),
    }

    report = multi_head_cross_entropy(logits, targets)

    expected_capture = F.cross_entropy(logits["capture_validity"][:1], torch.tensor([0]))
    expected_elbow = F.cross_entropy(logits["elbow_alignment"][1:], torch.tensor([1]))
    expected_total = torch.stack([expected_capture, expected_elbow]).mean()

    assert report.counts == {"capture_validity": 1, "elbow_alignment": 1}
    assert torch.allclose(report.per_head["capture_validity"], expected_capture)
    assert torch.allclose(report.per_head["elbow_alignment"], expected_elbow)
    assert torch.allclose(report.total, expected_total)


def test_inactive_head_does_not_contribute_to_total_loss() -> None:
    logits = {
        "capture_validity": torch.tensor([[4.0, -1.0]], requires_grad=True),
        "balance": torch.tensor([[9.0, -9.0, -9.0, -9.0]], requires_grad=True),
    }
    targets = {
        "capture_validity": torch.tensor([0], dtype=torch.long),
        "balance": torch.tensor([-100], dtype=torch.long),
    }

    report = multi_head_cross_entropy(logits, targets)

    expected = F.cross_entropy(logits["capture_validity"], torch.tensor([0]))
    assert set(report.per_head) == {"capture_validity"}
    assert report.counts == {"capture_validity": 1, "balance": 0}
    assert torch.allclose(report.total, expected)


def test_multi_head_loss_rejects_wrong_class_width() -> None:
    logits = {"capture_validity": torch.zeros((1, 3), requires_grad=True)}
    targets = {"capture_validity": torch.tensor([0], dtype=torch.long)}

    try:
        multi_head_cross_entropy(logits, targets)
    except ValueError as exc:
        assert "capture_validity" in str(exc)
    else:  # pragma: no cover - assertion guard
        raise AssertionError("expected wrong class width to be rejected")
