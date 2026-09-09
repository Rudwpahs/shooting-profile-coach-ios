"""Authenticated HTTP boundary for the frozen CoachRequest/CoachResponse V1 contract."""
from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .provider_v1 import DeterministicBaselineV1
from .schemas import CoachRequestV1, CoachResponseV1, validate_response_for_request
from .security import (
    BoundaryError,
    FirebaseTokenVerifier,
    InflightGate,
    ServiceSettings,
    UidRateLimiter,
    bearer_token,
)


def _error(error: BoundaryError | tuple[int, str]) -> JSONResponse:
    status, code = (
        (error.status, error.code) if isinstance(error, BoundaryError) else error
    )
    response = JSONResponse(status_code=status, content={"error": {"code": code}})
    response.headers["cache-control"] = "no-store"
    if isinstance(error, BoundaryError) and error.retry_after is not None:
        response.headers["retry-after"] = str(error.retry_after)
    return response


async def _read_capped_body(request: Request, maximum: int) -> bytes:
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            if int(declared) > maximum:
                raise BoundaryError(413, "request_too_large")
        except ValueError:
            # A malformed length is not trusted; the streaming cap below still applies.
            pass
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > maximum:
            raise BoundaryError(413, "request_too_large")
        chunks.append(chunk)
    return b"".join(chunks)


def _parse_json(raw: bytes) -> Any:
    def reject_constant(_: str) -> Any:
        raise ValueError("non-finite JSON number")

    return json.loads(raw.decode("utf-8"), parse_constant=reject_constant)


async def _invoke_provider(provider: Any, request: CoachRequestV1, timeout: float) -> Any:
    result = provider.coach(request)
    if not hasattr(result, "__await__"):
        raise RuntimeError("provider must return an awaitable")
    return await asyncio.wait_for(result, timeout=timeout)


def create_app(
    *,
    verifier: Any | None = None,
    provider: Any | None = None,
    settings: ServiceSettings | None = None,
) -> FastAPI:
    """Build an app with injectable boundaries for offline tests and deployment."""

    config = settings or ServiceSettings()
    token_verifier = verifier or FirebaseTokenVerifier(config)
    coach_provider = provider or DeterministicBaselineV1()
    limiter = UidRateLimiter(
        limit=config.rate_limit,
        window_seconds=config.rate_window_seconds,
        max_uids=config.max_uid_buckets,
    )
    capacity = InflightGate(config.max_inflight)
    app = FastAPI(title="FormPath Coach V1", version="1.0.0", docs_url=None, redoc_url=None)
    app.state.settings = config
    app.state.verifier = token_verifier
    app.state.provider = coach_provider

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/coach")
    async def coach(request: Request) -> JSONResponse:
        if not await capacity.acquire():
            return _error((503, "capacity_unavailable"))
        try:
            try:
                raw = await _read_capped_body(request, config.max_body_bytes)
            except BoundaryError as exc:
                return _error(exc)
            try:
                decoded = _parse_json(raw)
                if not isinstance(decoded, dict):
                    raise TypeError("object required")
                coach_request = CoachRequestV1.model_validate(decoded)
            except (UnicodeDecodeError, ValueError, TypeError, RecursionError, ValidationError):
                return _error((422, "request_invalid"))

            try:
                token = bearer_token(request.headers.getlist("authorization"))
                uid = await token_verifier.verify(token)
            except BoundaryError as exc:
                return _error(exc)
            except Exception:  # noqa: BLE001 - redact all verifier implementation details
                return _error((401, "unauthenticated"))

            # Authentication must precede the UID-keyed limiter. The UID is not
            # passed to the model or included in response/error text.
            limited = limiter.admit(uid)
            if limited is not None:
                return _error(limited)

            try:
                result = await _invoke_provider(
                    coach_provider, coach_request, config.request_timeout_seconds
                )
                response = (
                    result
                    if isinstance(result, CoachResponseV1)
                    else CoachResponseV1.model_validate(result)
                )
                if validate_response_for_request(coach_request, response):
                    raise ValueError("provider response was not grounded in request")
            except asyncio.TimeoutError:
                return _error((504, "provider_timeout"))
            except Exception:  # noqa: BLE001 - provider failures never cross the boundary
                return _error((503, "provider_unavailable"))
            output = JSONResponse(status_code=200, content=response.model_dump(mode="json"))
            output.headers["cache-control"] = "no-store"
            return output
        finally:
            await capacity.release()

    return app


app = create_app()
