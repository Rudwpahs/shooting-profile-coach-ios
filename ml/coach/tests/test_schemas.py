from __future__ import annotations

import pytest
from conftest import valid_request, valid_response
from pydantic import ValidationError

from formpath_coach.schemas import CoachRequest, CoachResponse


def test_valid_coach_request_round_trips():
    payload = valid_request()
    request = CoachRequest.model_validate(payload)
    assert request.player.age == 17
    assert request.context.action == "catch_and_shoot"
    assert request.observations[0].measurement_confidence == "medium"
    assert request.evidence[0].evidence_tier == "B"
    # Unset optional fields are filled with defaults on dump, so compare only what was sent.
    assert request.model_dump(mode="json", exclude_unset=True) == payload
    assert request.evidence[0].source_title is None


def _without(payload: dict, key: str) -> dict:
    payload.pop(key)
    return payload


@pytest.mark.parametrize(
    "mutate",
    [
        pytest.param(lambda p: _without(p, "player"), id="missing-player"),
        pytest.param(lambda p: _without(p, "observations"), id="missing-observations"),
        pytest.param(lambda p: _without(p["context"], "action"), id="missing-context-action"),
        pytest.param(lambda p: p["player"].__setitem__("age", 130), id="age-out-of-range"),
        pytest.param(lambda p: p["player"].__setitem__("handedness", "both"), id="bad-handedness"),
        pytest.param(
            lambda p: p["observations"][0].__setitem__("measurement_confidence", "certain"),
            id="bad-confidence",
        ),
        pytest.param(lambda p: p["observations"][0].__setitem__("source", "guess"), id="bad-source"),
        pytest.param(lambda p: p["evidence"][0].__setitem__("evidence_tier", "Z"), id="bad-tier"),
        pytest.param(lambda p: p["evidence"][0].__setitem__("research_unit_id", 0), id="unit-id-zero"),
        pytest.param(lambda p: p["context"].__setitem__("distance_m", -1), id="negative-distance"),
        pytest.param(lambda p: p.__setitem__("observations", "not-a-list"), id="wrong-type"),
    ],
)
def test_invalid_coach_request_is_rejected(mutate):
    payload = valid_request()
    mutate(payload)
    with pytest.raises(ValidationError):
        CoachRequest.model_validate(payload)


def test_valid_coach_response_round_trips():
    payload = valid_response()
    response = CoachResponse.model_validate(payload)
    assert response.confidence == "low"
    assert response.drills[0].retest == "same camera setup next week"
    assert response.evidence_used == [12]
    assert response.model_dump(mode="json") == payload


@pytest.mark.parametrize(
    "mutate",
    [
        pytest.param(lambda p: _without(p, "coaching_comment"), id="missing-comment"),
        pytest.param(lambda p: _without(p, "do_not_infer"), id="missing-do-not-infer"),
        pytest.param(lambda p: _without(p, "hypotheses"), id="missing-hypotheses"),
        pytest.param(lambda p: p.__setitem__("confidence", "sure"), id="bad-confidence"),
        pytest.param(lambda p: p["hypotheses"][0].__setitem__("confidence", 0.9), id="numeric-confidence"),
        pytest.param(lambda p: _without(p["drills"][0], "retest"), id="drill-without-retest"),
        pytest.param(lambda p: p.__setitem__("evidence_used", ["twelve"]), id="evidence-ids-not-int"),
    ],
)
def test_invalid_coach_response_is_rejected(mutate):
    payload = valid_response()
    mutate(payload)
    with pytest.raises(ValidationError):
        CoachResponse.model_validate(payload)
