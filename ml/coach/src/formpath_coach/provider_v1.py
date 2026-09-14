"""Contract-valid deterministic provider used while the learned model is experimental."""
from __future__ import annotations

from typing import Any

from .schemas import CoachRequestV1, CoachResponseV1

_RANK = {"very_low": 0, "low": 1, "medium": 2, "high": 3, "very_high": 4}
_NAMES = ("very_low", "low", "medium", "high", "very_high")


def _baseline_confidence(request: CoachRequestV1) -> str:
    """Conservatively combine measurement and capture quality confidence.

    The baseline is intentionally capped at ``medium``: it is a safe wiring
    provider, not evidence that a learned causal model has been trained.
    """

    lowest = min((_RANK[item.measurement_confidence] for item in request.observations), default=0)
    result = min(lowest, _RANK["medium"])
    if not request.context.quality_passed:
        result = min(result, _RANK["low"])
    return _NAMES[result]


def _format_value(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:.3g}"
    return str(value)


class DeterministicBaselineV1:
    """Returns a grounded, no-causal-inference CoachResponseV1."""

    async def coach(self, request: CoachRequestV1) -> CoachResponseV1:
        first = request.observations[0]
        summary = (
            f"{first.metric} measured at {_format_value(first.value)} {first.unit}; "
            f"source is a representative phase-fused estimate."
        )[:160]
        cue = None
        if first.joints and first.phase_anchor is not None:
            cue = {"observation_id": first.id, "label": first.metric[:40]}
        payload = {
            "schema_version": 1,
            "request_id": request.request_id,
            "observation_summary": [summary],
            "hypotheses": [],
            "confidence": _baseline_confidence(request),
            "coaching_comment": (
                "Use this measurement as a repeatable cue; retest with the same capture protocol."
            ),
            "do_not_infer": [
                "ground_reaction_force",
                "joint_torque",
                "muscle_activation",
                "actual_metric_3d_position",
            ],
            "drills": [],
            "retest_plan": [
                "Repeat the same capture protocol and compare this observation next session."
            ],
            "evidence_used": [],
            "primary_visual_cue": cue,
            "provider": {"id": "deterministic_v1", "revision": "service_baseline_v1"},
        }
        return CoachResponseV1.model_validate(payload)
