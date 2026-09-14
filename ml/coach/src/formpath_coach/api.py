from __future__ import annotations

import os
from functools import lru_cache

from fastapi import FastAPI, HTTPException

from .inference import FormPathCoach
from .schemas import CoachRequest, CoachResponse

app = FastAPI(title="FormPath Coach", version="0.1.0")


@lru_cache(maxsize=1)
def get_coach() -> FormPathCoach:
    """Build the coach on first use. Importing this module never loads a model."""
    base_model = os.getenv("FORMPATH_COACH_BASE_MODEL", "Qwen/Qwen3-4B")
    adapter = os.getenv("FORMPATH_COACH_ADAPTER") or None
    return FormPathCoach(base_model=base_model, adapter_path=adapter)


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {"status": "ok", "model_loaded": get_coach.cache_info().currsize > 0}


@app.post("/v1/coach", response_model=CoachResponse)
def coach(request: CoachRequest) -> CoachResponse:
    try:
        model = get_coach()
    except Exception as exc:  # bad config, missing weights, offline hub, out of memory
        raise HTTPException(
            status_code=503,
            detail=f"coach model is not loaded: {type(exc).__name__}: {exc}",
        ) from exc
    try:
        return model.coach(request)
    except Exception as exc:  # generation failure or output that is not a CoachResponse
        raise HTTPException(
            status_code=500,
            detail=f"coach generation failed: {type(exc).__name__}: {exc}",
        ) from exc
