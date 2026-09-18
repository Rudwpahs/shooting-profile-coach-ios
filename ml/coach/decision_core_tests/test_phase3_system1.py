from __future__ import annotations

import math

import pytest
import torch
from pydantic import ValidationError

from formpath_coach.decision_core.motion_features import (
    FEATURE_CHANNELS_PER_JOINT_V1,
    PERSISTED_JOINT_NAMES_V2,
    RepresentativePoseInputV2,
    adapt_representative_pose_v1,
)
from formpath_coach.decision_core.pipeline import (
    GateContextV1,
    TemperatureTableV1,
    build_decision_result_v1,
)
from formpath_coach.decision_core.schemas import DECISION_LABELS_V1
from formpath_coach.decision_core.system1 import System1BaselineV1


def _pose_dict(*, missing_joint: str | None = None, moving: bool = True) -> dict[str, object]:
    frames: list[dict[str, object]] = []
    for index in range(101):
        phase = index / 100.0
        joints: dict[str, list[float]] = {}
        uncertainty: dict[str, dict[str, object]] = {}
        for joint_index, joint in enumerate(PERSISTED_JOINT_NAMES_V2):
            if joint == missing_joint:
                continue
            offset = phase if moving else 0.0
            joints[joint] = [
                joint_index * 0.01 + offset,
                joint_index * 0.02 + 0.5 * offset,
                joint_index * 0.03 - 0.25 * offset,
            ]
            uncertainty[joint] = {
                "model": "heuristic_v1",
                "covariance": [1.0, 0.0, 0.0, 1.5, 0.0, 2.0],
                "directionalConeDegrees": 18.0,
            }
        frames.append({"phase": phase, "joints": joints, "uncertainty": uncertainty})

    return {
        "schemaVersion": 2,
        "boundary": "representative_phase_fused_4d_estimate_not_actual_3d",
        "mode": "basic_1_plus_1",
        "timeBasis": "normalized_shot_phase",
        "units": "template_shoulder_breadths",
        "frames": frames,
        "phaseAnchors": [
            {"id": "ready", "phase": 0.0},
            {"id": "release", "phase": 0.75},
        ],
        "quality": {"passed": True, "reasons": []},
    }


def test_adapter_mirrors_v2_contract_and_emits_expected_tensor_shape() -> None:
    pose = RepresentativePoseInputV2.model_validate(_pose_dict())

    features = adapt_representative_pose_v1(pose)

    assert features.shape == (
        1,
        101,
        len(PERSISTED_JOINT_NAMES_V2) * FEATURE_CHANNELS_PER_JOINT_V1,
    )
    assert features.dtype == torch.float32
    assert torch.isfinite(features).all()

    # First-frame velocity slots for the first joint are causal zeros.
    assert torch.equal(features[0, 0, 3:6], torch.zeros(3, dtype=torch.float32))


def test_adapter_rejects_missing_canonical_joint() -> None:
    with pytest.raises(ValidationError):
        RepresentativePoseInputV2.model_validate(_pose_dict(missing_joint="leftWrist"))


def test_static_sequence_has_zero_velocity_channels() -> None:
    pose = RepresentativePoseInputV2.model_validate(_pose_dict(moving=False))
    features = adapt_representative_pose_v1(pose)[0]

    for joint_index in range(len(PERSISTED_JOINT_NAMES_V2)):
        base = joint_index * FEATURE_CHANNELS_PER_JOINT_V1
        assert torch.equal(
            features[:, base + 3 : base + 6],
            torch.zeros((101, 3), dtype=torch.float32),
        )


def test_system1_baseline_emits_every_v1_head_with_contract_sized_logits() -> None:
    model = System1BaselineV1(hidden_dim=32)
    pose = RepresentativePoseInputV2.model_validate(_pose_dict())
    features = adapt_representative_pose_v1(pose)

    logits = model(features)

    assert set(logits) == set(DECISION_LABELS_V1)
    for head, labels in DECISION_LABELS_V1.items():
        assert logits[head].shape == (1, len(labels))
        assert torch.isfinite(logits[head]).all()


def test_pipeline_calibrates_logits_builds_packet_and_applies_gate() -> None:
    logits = {
        head: torch.tensor([[8.0] + [0.0] * (len(labels) - 1)], dtype=torch.float32)
        for head, labels in DECISION_LABELS_V1.items()
    }
    temperatures = TemperatureTableV1(
        revision="temp_phase3_v1",
        by_head={head: 1.0 for head in DECISION_LABELS_V1},
    )

    result = build_decision_result_v1(
        request_id="dec_12345678",
        model_revision="system1_phase3_v1",
        logits_by_head=logits,
        temperatures=temperatures,
        gate_context=GateContextV1(ood_score=0.0),
    )

    assert result.gate.accepted is True
    assert result.gate.reason_codes == []
    assert len(result.packet.distributions) == len(DECISION_LABELS_V1)
    for distribution in result.packet.distributions:
        assert math.isclose(
            sum(option.probability for option in distribution.options),
            1.0,
            rel_tol=0.0,
            abs_tol=1e-6,
        )
        assert distribution.top_probability > 0.99


def test_temperature_table_requires_exact_head_coverage() -> None:
    with pytest.raises(ValidationError):
        TemperatureTableV1(
            revision="temp_phase3_v1",
            by_head={"capture_validity": 1.0},
        )
