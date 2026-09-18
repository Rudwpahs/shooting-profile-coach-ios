from __future__ import annotations

import math
from typing import Annotated, Literal

import torch
from pydantic import BaseModel, ConfigDict, Field, model_validator

PERSISTED_JOINT_NAMES_V2 = (
    "leftShoulder",
    "leftElbow",
    "leftWrist",
    "rightShoulder",
    "rightElbow",
    "rightWrist",
    "leftHip",
    "leftKnee",
    "leftAnkle",
    "rightHip",
    "rightKnee",
    "rightAnkle",
)

FEATURE_CHANNELS_PER_JOINT_V1 = 8
FEATURE_DIM_V1 = len(PERSISTED_JOINT_NAMES_V2) * FEATURE_CHANNELS_PER_JOINT_V1

_FiniteFloat = Annotated[float, Field(strict=True, allow_inf_nan=False)]
_UnitFloat = Annotated[float, Field(strict=True, ge=0.0, le=1.0, allow_inf_nan=False)]
_ConeDegrees = Annotated[float, Field(strict=True, ge=0.0, le=180.0, allow_inf_nan=False)]


class _MotionInputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class JointUncertaintyInputV2(_MotionInputModel):
    model: Literal["heuristic_v1"]
    covariance: Annotated[list[_FiniteFloat], Field(min_length=6, max_length=6)]
    directional_cone_degrees: _ConeDegrees = Field(alias="directionalConeDegrees")

    @model_validator(mode="after")
    def _validate_covariance_diagonal(self) -> JointUncertaintyInputV2:
        if any(self.covariance[index] < 0.0 for index in (0, 3, 5)):
            raise ValueError("covariance diagonal entries must be nonnegative")
        return self


class PhaseAnchorInputV2(_MotionInputModel):
    id: str
    phase: _UnitFloat


class ReconstructionQualityInputV2(_MotionInputModel):
    passed: bool
    reasons: list[str]


class RepresentativePoseFrameInputV2(_MotionInputModel):
    phase: _UnitFloat
    joints: dict[str, Annotated[list[_FiniteFloat], Field(min_length=3, max_length=3)]]
    uncertainty: dict[str, JointUncertaintyInputV2]

    @model_validator(mode="after")
    def _validate_joint_coverage(self) -> RepresentativePoseFrameInputV2:
        expected = set(PERSISTED_JOINT_NAMES_V2)
        joint_names = set(self.joints)
        uncertainty_names = set(self.uncertainty)
        if joint_names != expected:
            missing = sorted(expected - joint_names)
            extra = sorted(joint_names - expected)
            raise ValueError(f"joints must match canonical V2 set; missing={missing}, extra={extra}")
        if uncertainty_names != expected:
            missing = sorted(expected - uncertainty_names)
            extra = sorted(uncertainty_names - expected)
            raise ValueError(
                f"uncertainty must match canonical V2 set; missing={missing}, extra={extra}"
            )
        return self


class RepresentativePoseInputV2(_MotionInputModel):
    schema_version: Literal[2] = Field(alias="schemaVersion")
    boundary: Literal["representative_phase_fused_4d_estimate_not_actual_3d"]
    mode: Literal["basic_1_plus_1", "high_accuracy_3_plus_3"]
    time_basis: Literal["normalized_shot_phase"] = Field(alias="timeBasis")
    units: Literal["template_shoulder_breadths"]
    frames: Annotated[list[RepresentativePoseFrameInputV2], Field(min_length=101, max_length=101)]
    phase_anchors: list[PhaseAnchorInputV2] = Field(alias="phaseAnchors")
    quality: ReconstructionQualityInputV2

    @model_validator(mode="after")
    def _validate_frame_phases(self) -> RepresentativePoseInputV2:
        phases = [frame.phase for frame in self.frames]
        if any(
            next_phase < phase
            for phase, next_phase in zip(phases[:-1], phases[1:], strict=True)
        ):
            raise ValueError("frame phases must be monotonic nondecreasing")
        return self


def adapt_representative_pose_v1(pose: RepresentativePoseInputV2) -> torch.Tensor:
    """Convert the frozen V2 representative pose contract into System-1 features.

    Per canonical joint the feature order is:
    x, y, z, dx, dy, dz, covariance trace, directional-cone fraction.
    The adapter is read-only: it does not alter reconstruction or persistence contracts.
    """

    rows: list[list[float]] = []
    previous_positions: dict[str, tuple[float, float, float]] | None = None

    for frame in pose.frames:
        row: list[float] = []
        current_positions: dict[str, tuple[float, float, float]] = {}

        for joint in PERSISTED_JOINT_NAMES_V2:
            position_values = frame.joints[joint]
            position = (position_values[0], position_values[1], position_values[2])
            current_positions[joint] = position

            if previous_positions is None:
                velocity = (0.0, 0.0, 0.0)
            else:
                previous = previous_positions[joint]
                velocity = tuple(current - prior for current, prior in zip(position, previous, strict=True))

            uncertainty = frame.uncertainty[joint]
            covariance_trace = math.fsum(
                uncertainty.covariance[index] for index in (0, 3, 5)
            )
            cone_fraction = uncertainty.directional_cone_degrees / 180.0

            row.extend((*position, *velocity, covariance_trace, cone_fraction))

        rows.append(row)
        previous_positions = current_positions

    features = torch.tensor(rows, dtype=torch.float32).unsqueeze(0)
    if features.shape[-1] != FEATURE_DIM_V1:
        raise RuntimeError("unexpected Decision Core feature width")
    if not torch.isfinite(features).all():
        raise ValueError("Decision Core features must be finite")
    return features
