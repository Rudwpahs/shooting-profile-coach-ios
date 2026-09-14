from __future__ import annotations

from typing import ClassVar

import pytest
from conftest import valid_request, valid_response

from formpath_coach.schemas import CoachRequest, CoachResponse


class FakeCoach:
    """Stands in for FormPathCoach inside the API without loading anything."""

    instances: ClassVar[list[FakeCoach]] = []

    def __init__(self, base_model: str, adapter_path=None) -> None:
        self.base_model = base_model
        self.adapter_path = adapter_path
        self.requests: list[CoachRequest] = []
        FakeCoach.instances.append(self)

    def coach(self, request: CoachRequest) -> CoachResponse:
        self.requests.append(request)
        return CoachResponse.model_validate(valid_response())


class BrokenCoach:
    def __init__(self, base_model: str, adapter_path=None) -> None:
        raise RuntimeError("weights are not available offline")


class FailingCoach(FakeCoach):
    def coach(self, request: CoachRequest) -> CoachResponse:
        raise ValueError("model did not return JSON")


@pytest.fixture(autouse=True)
def _reset_fake_coach():
    FakeCoach.instances.clear()
    yield
    FakeCoach.instances.clear()


def test_import_does_not_construct_a_coach(api_module):
    assert api_module.get_coach.cache_info().currsize == 0


def test_health_returns_200_without_loading_a_model(client, api_module):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "model_loaded": False}
    assert api_module.get_coach.cache_info().currsize == 0


def test_coach_when_model_cannot_be_loaded_returns_503(client, api_module, monkeypatch):
    monkeypatch.setattr(api_module, "FormPathCoach", BrokenCoach)

    response = client.post("/v1/coach", json=valid_request())

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail.startswith("coach model is not loaded: RuntimeError")
    assert "weights are not available offline" in detail
    # A failed load is not cached, and health keeps reporting the truth.
    assert api_module.get_coach.cache_info().currsize == 0
    assert client.get("/health").json() == {"status": "ok", "model_loaded": False}


def test_coach_happy_path_with_a_loaded_model(client, api_module, monkeypatch):
    monkeypatch.setattr(api_module, "FormPathCoach", FakeCoach)

    response = client.post("/v1/coach", json=valid_request())

    assert response.status_code == 200
    assert CoachResponse.model_validate(response.json()).model_dump(mode="json") == valid_response()
    assert len(FakeCoach.instances) == 1
    assert FakeCoach.instances[0].base_model == "Qwen/Qwen3-4B"
    assert FakeCoach.instances[0].adapter_path is None
    assert client.get("/health").json() == {"status": "ok", "model_loaded": True}

    # The coach is built once and reused.
    client.post("/v1/coach", json=valid_request())
    assert len(FakeCoach.instances) == 1
    assert len(FakeCoach.instances[0].requests) == 2


def test_coach_reads_model_and_adapter_from_environment(client, api_module, monkeypatch, tmp_path):
    monkeypatch.setattr(api_module, "FormPathCoach", FakeCoach)
    monkeypatch.setenv("FORMPATH_COACH_BASE_MODEL", "local/base")
    monkeypatch.setenv("FORMPATH_COACH_ADAPTER", str(tmp_path))

    assert client.post("/v1/coach", json=valid_request()).status_code == 200
    assert FakeCoach.instances[0].base_model == "local/base"
    assert FakeCoach.instances[0].adapter_path == str(tmp_path)


def test_empty_adapter_env_means_no_adapter(client, api_module, monkeypatch):
    monkeypatch.setattr(api_module, "FormPathCoach", FakeCoach)
    monkeypatch.setenv("FORMPATH_COACH_ADAPTER", "")

    assert client.post("/v1/coach", json=valid_request()).status_code == 200
    assert FakeCoach.instances[0].adapter_path is None


def test_generation_failure_returns_500(client, api_module, monkeypatch):
    monkeypatch.setattr(api_module, "FormPathCoach", FailingCoach)

    response = client.post("/v1/coach", json=valid_request())

    assert response.status_code == 500
    assert response.json()["detail"].startswith("coach generation failed: ValueError")


def _without(payload: dict, key: str) -> dict:
    payload.pop(key)
    return payload


@pytest.mark.parametrize(
    "mutate",
    [
        pytest.param(lambda p: _without(p, "player"), id="missing-player"),
        pytest.param(lambda p: _without(p, "observations"), id="missing-observations"),
        pytest.param(
            lambda p: p["observations"][0].__setitem__("measurement_confidence", "certain"),
            id="bad-confidence",
        ),
        pytest.param(lambda p: p["player"].__setitem__("age", "seventeen"), id="wrong-type"),
    ],
)
def test_schema_violations_are_rejected_with_422(client, api_module, monkeypatch, mutate):
    monkeypatch.setattr(api_module, "FormPathCoach", FakeCoach)
    payload = valid_request()
    mutate(payload)

    response = client.post("/v1/coach", json=payload)

    assert response.status_code == 422
    assert FakeCoach.instances == []  # validation happens before the model is touched


def test_non_json_body_is_rejected_with_422(client, api_module, monkeypatch):
    monkeypatch.setattr(api_module, "FormPathCoach", FakeCoach)

    response = client.post("/v1/coach", content=b"not json", headers={"content-type": "application/json"})

    assert response.status_code == 422
    assert FakeCoach.instances == []
