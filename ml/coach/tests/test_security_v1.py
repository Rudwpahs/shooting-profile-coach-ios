"""Security regressions run offline with the external Firebase boundary injected."""
from __future__ import annotations

import asyncio
import importlib

import pytest


def security():
    return importlib.import_module("formpath_coach.security")


def test_rate_limit_is_per_uid_and_recovers_after_window():
    clock = [0.0]
    limiter = security().UidRateLimiter(limit=2, window_seconds=60, max_uids=2,
                                        clock=lambda: clock[0])
    assert limiter.admit("user-a") is None
    assert limiter.admit("user-a") is None
    assert limiter.admit("user-a").status == 429
    assert limiter.admit("user-b") is None
    clock[0] = 60.0
    assert limiter.admit("user-a") is None


def test_full_uid_table_does_not_evict_live_quotas():
    clock = [0.0]
    limiter = security().UidRateLimiter(limit=1, window_seconds=60, max_uids=1,
                                        clock=lambda: clock[0])
    assert limiter.admit("user-a") is None
    assert limiter.admit("user-b").status == 503
    assert limiter.admit("user-a").status == 429
    clock[0] = 60.0
    assert limiter.admit("user-b") is None


@pytest.mark.parametrize("headers", [[], ["Basic secret"], ["Bearer"],
                                    ["Bearer token extra"], ["Bearer a", "Bearer b"],
                                    ["Bearer " + "a" * 8193]])
def test_ambiguous_or_oversized_credentials_rejected(headers):
    with pytest.raises(security().BoundaryError) as error:
        security().bearer_token(headers)
    assert error.value.status == 401
    assert "secret" not in str(error.value)


def test_verifier_fails_closed_without_project_or_credentials(monkeypatch):
    monkeypatch.delenv("FIREBASE_AUTH_EMULATOR_HOST", raising=False)
    verifier = security().FirebaseTokenVerifier(security().ServiceSettings())
    try:
        with pytest.raises(security().BoundaryError) as error:
            asyncio.run(verifier.verify("sensitive-token"))
        assert error.value.status == 503
        assert "sensitive-token" not in str(error.value)
    finally:
        verifier.close()


def test_production_rejects_auth_emulator(monkeypatch):
    monkeypatch.setenv("FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099")
    verifier = security().FirebaseTokenVerifier(security().ServiceSettings(
        firebase_project_id="test-project", use_adc=True))
    try:
        with pytest.raises(security().BoundaryError) as error:
            asyncio.run(verifier.verify("unsigned-emulator-token"))
        assert error.value.status == 503
    finally:
        verifier.close()


def test_firebase_verification_uses_pinned_project_and_revocation(monkeypatch):
    import firebase_admin
    from firebase_admin import auth, credentials

    monkeypatch.delenv("FIREBASE_AUTH_EMULATOR_HOST", raising=False)
    app = object()
    calls = []

    class Credential:
        def get_credential(self):
            return object()

    monkeypatch.setattr(credentials, "ApplicationDefault", Credential)

    def initialize(credential, options, name):
        assert options["projectId"] == "test-project"
        assert options["httpTimeout"] <= 5
        return app

    def verify(token, *, app, check_revoked, clock_skew_seconds):
        calls.append((token, app, check_revoked, clock_skew_seconds))
        return {"uid": "verified-user"}

    monkeypatch.setattr(firebase_admin, "initialize_app", initialize)
    monkeypatch.setattr(firebase_admin, "delete_app", lambda app: None)
    monkeypatch.setattr(auth, "verify_id_token", verify)
    verifier = security().FirebaseTokenVerifier(security().ServiceSettings(
        firebase_project_id="test-project", use_adc=True))
    try:
        assert asyncio.run(verifier.verify("signed-token")) == "verified-user"
        assert calls == [("signed-token", app, True, 0)]
    finally:
        verifier.close()


@pytest.mark.parametrize("claim", [None, "", "a" * 129, 42])
def test_verified_identity_must_be_a_bounded_nonempty_uid(claim):
    with pytest.raises(security().BoundaryError) as error:
        security().validated_uid(claim)
    assert error.value.status == 401
