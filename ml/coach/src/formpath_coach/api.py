from __future__ import annotations

import os
from functools import lru_cache

from fastapi import FastAPI, HTTPException

from .inference import FormPathCoach
from .schemas import CoachRequest, CoachResponse


app = FastAPI(title="FormPath Coach", version="0.1.0")


@lru_cache(maxsize=1)
def get_coach() -> FormPathCoach:
    base_model = os.getenv("FORMPATH_COACH_BASE_MODEL", "Qwen/Qwen3-4B")
    adapter = os.getenv("FORMPATH_COACH_ADAPTER") or None
    return FormPathCoach(base_model=base_model, adapter_path=adapter)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/coach", response_model=CoachResponse)
def coach(request: CoachRequest) -> CoachResponse:
    try:
        return get_coach().coach(request)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
