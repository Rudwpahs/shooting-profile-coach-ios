"""HTTP tests for the frozen V1 endpoint; no Firebase network or model loading."""
from __future__ import annotations

import asyncio
import importlib
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from formpath_coach.schemas import CoachRequestV1, CoachResponseV1, validate_response_for_request

FIXTURES = Path(__file__).resolve().parents[3] / "contracts/fixtures/coach/golden"
AUTH = {"authorization": "Bearer accepted-token"}


def request_data():
    return json.loads((FIXTURES / "request-basic.json").read_text(encoding="utf-8"))


class Verifier:
    async def verify(self, token):
        if token == "accepted-token":
            return "uid-a"
        if token == "second-token":
            return "uid-b"
        from formpath_coach.security import BoundaryError
        raise BoundaryError(401, "unauthenticated")


def make_app(**kwargs):
    return importlib.import_module("formpath_coach.service_v1").create_app(
        verifier=kwargs.pop("verifier", Verifier()), **kwargs)


def test_authenticated_v1_returns_grounded_deterministic_response():
    payload = request_data()
    with TestClient(make_app()) as client:
        reply = client.post("/v1/coach", json=payload, headers=AUTH)
    assert reply.status_code == 200
    parsed = CoachResponseV1.model_validate(reply.json())
    assert validate_response_for_request(CoachRequestV1.model_validate(payload), parsed) == []
    assert parsed.provider.id == "deterministic_v1"
    assert parsed.hypotheses == []
    assert parsed.evidence_used == []
    assert parsed.confidence == "medium"
    assert reply.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("headers", [{}, {"authorization": "Bearer forged-token"},
                                    {"authorization": "Basic accepted-token"}])
def test_no_coaching_without_verified_identity(headers):
    with TestClient(make_app()) as client:
        reply = client.post("/v1/coach", json=request_data(), headers=headers)
    assert reply.status_code == 401
    assert reply.json() == {"error": {"code": "unauthenticated"}}


def test_invalid_body_does_not_echo_private_input_or_pydantic_errors(caplog):
    payload = request_data()
    payload["private"] = "private-marker@example.com"
    with TestClient(make_app()) as client:
        reply = client.post("/v1/coach", json=payload, headers=AUTH)
    assert reply.status_code == 422
    assert reply.json() == {"error": {"code": "request_invalid"}}
    assert "private-marker" not in reply.text + caplog.text


@pytest.mark.parametrize("body", [b"not json", b'{"x":NaN}', b"[" * 2000])
def test_malformed_json_returns_safe_error(body):
    with TestClient(make_app()) as client:
        reply = client.post("/v1/coach", content=body,
                            headers={**AUTH, "content-type": "application/json"})
    assert reply.status_code == 422
    assert reply.json() == {"error": {"code": "request_invalid"}}


def test_chunked_body_is_capped_even_without_content_length():
    with TestClient(make_app()) as client:
        reply = client.post("/v1/coach", content=iter([b" " * 32768] * 3),
                            headers={**AUTH, "content-type": "application/json"})
    assert reply.status_code == 413


def test_declared_oversize_rejected_before_verifier_runs():
    class ExplodingVerifier:
        async def verify(self, token):
            raise AssertionError("must not authenticate oversize body")
    with TestClient(make_app(verifier=ExplodingVerifier())) as client:
        reply = client.post("/v1/coach", content=b"{}", headers={
            **AUTH, "content-type": "application/json", "content-length": "65537"})
    assert reply.status_code == 413


def test_rate_limit_cannot_be_changed_with_request_id_and_is_per_verified_uid():
    with TestClient(make_app()) as client:
        for i in range(10):
            payload = request_data()
            payload["request_id"] = f"req_{i:08d}"
            assert client.post("/v1/coach", json=payload, headers=AUTH).status_code == 200
        limited = client.post("/v1/coach", json=request_data(), headers=AUTH)
        assert limited.status_code == 429
        assert int(limited.headers["retry-after"]) > 0
        assert client.post("/v1/coach", json=request_data(), headers={
            "authorization": "Bearer second-token"}).status_code == 200


@pytest.mark.parametrize("quality,confidence,want", [(True, "very_high", "medium"),
    (False, "high", "low"), (False, "very_low", "very_low"), (True, "low", "low")])
def test_baseline_never_raises_measurement_or_quality_confidence(quality, confidence, want):
    payload = request_data()
    payload["context"]["quality_passed"] = quality
    payload["observations"][0]["measurement_confidence"] = confidence
    with TestClient(make_app()) as client:
        reply = client.post("/v1/coach", json=payload, headers=AUTH)
    assert reply.status_code == 200
    assert reply.json()["confidence"] == want
    assert reply.json()["drills"] == []


def test_provider_exception_is_redacted(caplog):
    class BrokenProvider:
        async def coach(self, request):
            raise ValueError("private-prompt uid-a accepted-token")
    with TestClient(make_app(provider=BrokenProvider())) as client:
        reply = client.post("/v1/coach", json=request_data(), headers=AUTH)
    assert reply.status_code == 503
    assert reply.json() == {"error": {"code": "provider_unavailable"}}
    assert all(marker not in reply.text + caplog.text
               for marker in ["private-prompt", "uid-a", "accepted-token"])


@pytest.mark.parametrize("mutation", ["request_id", "cue", "unknown_key"])
def test_provider_output_revalidated_and_grounded(mutation):
    class BadProvider:
        async def coach(self, request):
            from formpath_coach.provider_v1 import DeterministicBaselineV1
            response = (await DeterministicBaselineV1().coach(request)).model_dump(mode="json")
            if mutation == "request_id":
                response["request_id"] = "req_wrongrequest"
            elif mutation == "cue":
                response["primary_visual_cue"]["observation_id"] = "obs_unknown"
            else:
                response["coordinates"] = [1, 2, 3]
            return response
    with TestClient(make_app(provider=BadProvider())) as client:
        reply = client.post("/v1/coach", json=request_data(), headers=AUTH)
    assert reply.status_code == 503
    assert reply.json() == {"error": {"code": "provider_unavailable"}}


def test_timeout_cancels_provider_and_returns_retryable_http_status():
    from formpath_coach.security import ServiceSettings
    cancelled = []
    class SlowProvider:
        async def coach(self, request):
            try:
                await asyncio.sleep(30)
            finally:
                cancelled.append(True)
    with TestClient(make_app(provider=SlowProvider(),
                            settings=ServiceSettings(request_timeout_seconds=0.02))) as client:
        reply = client.post("/v1/coach", json=request_data(), headers=AUTH)
    assert reply.status_code == 504
    assert cancelled == [True]


def test_capacity_gate_limits_work_before_authentication():
    from formpath_coach.security import ServiceSettings
    async def scenario():
        entered = asyncio.Event()
        release = asyncio.Event()
        class SlowVerifier:
            async def verify(self, token):
                entered.set()
                await release.wait()
                return "uid-a"
        app = make_app(verifier=SlowVerifier(), settings=ServiceSettings(max_inflight=1))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                     base_url="http://testserver") as client:
            first = asyncio.create_task(client.post("/v1/coach", json=request_data(), headers=AUTH))
            await entered.wait()
            second = await client.post("/v1/coach", json=request_data(), headers=AUTH)
            release.set()
            assert (await first).status_code == 200
            assert second.status_code == 503
    asyncio.run(scenario())
