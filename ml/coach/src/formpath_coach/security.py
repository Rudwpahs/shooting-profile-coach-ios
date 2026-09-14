"""Security primitives for the authenticated Coach V1 service.

The module deliberately keeps authentication and admission control outside the
model code.  It fails closed when Firebase is not configured and never includes
credentials, request bodies, or provider exceptions in a public error.
"""
from __future__ import annotations

import math
import os
import re
import time
from collections import deque
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from typing import Any


class BoundaryError(Exception):
    """An intentionally small, non-sensitive error crossing the HTTP boundary."""

    def __init__(self, status: int, code: str, *, retry_after: int | None = None) -> None:
        super().__init__(code)
        self.status = status
        self.code = code
        self.retry_after = retry_after

    def __str__(self) -> str:  # pragma: no cover - Exception's safe representation
        return self.code


@dataclass(slots=True)
class ServiceSettings:
    """Configuration with conservative production defaults.

    ``use_adc`` is optional so a test or deployment can explicitly select ADC;
    otherwise a configured service-account path is used when present.
    """

    max_body_bytes: int = 64 * 1024
    request_timeout_seconds: float = 6.0
    rate_limit: int = 10
    rate_window_seconds: float = 60.0
    max_uid_buckets: int = 10_000
    max_inflight: int = 32
    firebase_project_id: str | None = field(
        default_factory=lambda: os.getenv("FORMPATH_COACH_FIREBASE_PROJECT_ID")
    )
    credentials_path: str | None = field(
        default_factory=lambda: os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    )
    use_adc: bool | None = None

    def __post_init__(self) -> None:
        if self.use_adc is None:
            raw = os.getenv("FORMPATH_COACH_USE_ADC", "")
            self.use_adc = raw.lower() in {"1", "true", "yes"}
        if self.max_body_bytes < 1 or self.max_body_bytes > 1024 * 1024:
            raise ValueError("max_body_bytes must be between 1 and 1048576")
        if self.request_timeout_seconds <= 0 or self.request_timeout_seconds > 30:
            raise ValueError("request_timeout_seconds must be between 0 and 30")
        if self.rate_limit < 1 or self.rate_window_seconds <= 0:
            raise ValueError("rate limit must be positive")
        if self.max_uid_buckets < 1 or self.max_inflight < 1:
            raise ValueError("capacity limits must be positive")


_BEARER = re.compile(r"^Bearer ([A-Za-z0-9._~+/=-]+)$")


def bearer_token(values: Iterable[str] | str) -> str:
    """Return exactly one bounded Bearer credential, or a redacted 401 error."""

    if isinstance(values, str):
        candidates = [values]
    else:
        candidates = list(values)
    if len(candidates) != 1:
        raise BoundaryError(401, "unauthenticated")
    value = candidates[0]
    if len(value) > 8200:
        raise BoundaryError(401, "unauthenticated")
    match = _BEARER.fullmatch(value)
    if match is None:
        raise BoundaryError(401, "unauthenticated")
    token = match.group(1)
    if not 1 <= len(token) <= 8192:
        raise BoundaryError(401, "unauthenticated")
    return token


class UidRateLimiter:
    """A bounded fixed-window limiter keyed only by verified Firebase UID."""

    def __init__(
        self,
        *,
        limit: int = 10,
        window_seconds: float = 60.0,
        max_uids: int = 10_000,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.max_uids = max_uids
        self.clock = clock
        self._events: dict[str, deque[float]] = {}

    def _prune(self, now: float) -> None:
        for uid, events in list(self._events.items()):
            while events and now - events[0] >= self.window_seconds:
                events.popleft()
            if not events:
                del self._events[uid]

    def admit(self, uid: str) -> BoundaryError | None:
        now = self.clock()
        self._prune(now)
        events = self._events.get(uid)
        if events is None:
            if len(self._events) >= self.max_uids:
                return BoundaryError(503, "capacity_unavailable", retry_after=1)
            events = deque()
            self._events[uid] = events
        if len(events) >= self.limit:
            retry = max(1, math.ceil(self.window_seconds - (now - events[0])))
            return BoundaryError(429, "rate_limited", retry_after=retry)
        events.append(now)
        return None


class FirebaseTokenVerifier:
    """Lazy Firebase ID-token verifier pinned to one project.

    Firebase imports and credential discovery happen only on the first verify,
    making local schema tests deterministic and allowing a fail-closed health
    state when deployment configuration is absent.
    """

    def __init__(self, settings: ServiceSettings) -> None:
        self.settings = settings
        self._app: Any | None = None
        self._firebase_admin: Any | None = None
        self._auth: Any | None = None
        self._credentials: Any | None = None

    def _ensure_app(self) -> None:
        if self._app is not None:
            return
        if os.getenv("FIREBASE_AUTH_EMULATOR_HOST"):
            raise BoundaryError(503, "auth_unavailable")
        project_id = self.settings.firebase_project_id
        if not project_id or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", project_id):
            raise BoundaryError(503, "auth_unavailable")
        try:
            import firebase_admin
            from firebase_admin import auth, credentials
        except Exception as exc:  # pragma: no cover - dependency is deployment optional
            raise BoundaryError(503, "auth_unavailable") from exc
        try:
            if self.settings.use_adc:
                credential = credentials.ApplicationDefault()
            elif self.settings.credentials_path:
                credential = credentials.Certificate(self.settings.credentials_path)
            else:
                raise BoundaryError(503, "auth_unavailable")
            name = f"formpath-coach-{id(self)}"
            self._app = firebase_admin.initialize_app(
                credential,
                {"projectId": project_id, "httpTimeout": 5},
                name,
            )
            self._firebase_admin = firebase_admin
            self._auth = auth
            self._credentials = credentials
        except BoundaryError:
            raise
        except Exception as exc:
            raise BoundaryError(503, "auth_unavailable") from exc

    async def verify(self, token: str) -> str:
        if os.getenv("FIREBASE_AUTH_EMULATOR_HOST"):
            raise BoundaryError(503, "auth_unavailable")
        try:
            self._ensure_app()
            assert self._auth is not None and self._app is not None
            claims = self._auth.verify_id_token(
                token,
                app=self._app,
                check_revoked=True,
                clock_skew_seconds=0,
            )
        except BoundaryError:
            raise
        except Exception as exc:
            # The exception is chained for local diagnostics but never rendered.
            raise BoundaryError(401, "unauthenticated") from exc
        return validated_uid(claims.get("uid") if isinstance(claims, dict) else None)

    def close(self) -> None:
        if self._firebase_admin is not None and self._app is not None:
            try:
                self._firebase_admin.delete_app(self._app)
            except Exception:  # noqa: BLE001,S110 - shutdown must be best effort
                pass
        self._app = None


def validated_uid(value: Any) -> str:
    """Accept only the bounded non-empty UID used by admission control."""

    if not isinstance(value, str) or not 1 <= len(value) <= 128:
        raise BoundaryError(401, "unauthenticated")
    return value


class InflightGate:
    """Small async capacity gate used before authentication and model work."""

    def __init__(self, maximum: int) -> None:
        import asyncio

        self.maximum = maximum
        self._inflight = 0
        self._lock = asyncio.Lock()

    async def acquire(self) -> bool:
        async with self._lock:
            if self._inflight >= self.maximum:
                return False
            self._inflight += 1
            return True

    async def release(self) -> None:
        async with self._lock:
            self._inflight = max(0, self._inflight - 1)
