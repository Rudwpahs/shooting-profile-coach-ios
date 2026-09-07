"""Offline test harness for the FormPath Coach scaffold.

No test here may touch the network or download a model. The Hugging Face hub is
forced offline before any library import, every socket connection is refused for
the duration of a test, and model/tokenizer loading is replaced by small
deterministic stand-ins.
"""

from __future__ import annotations

import json
import os
import socket
from pathlib import Path
from typing import Any

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import pytest
import torch

# --------------------------------------------------------------------------- data


def valid_request() -> dict[str, Any]:
    return {
        "player": {
            "age": 17,
            "sex": "male",
            "skill_level": "high_school",
            "handedness": "right",
            "height_cm": 183.0,
            "training_age_years": 4,
        },
        "context": {
            "action": "catch_and_shoot",
            "shot_family": "jump_shot",
            "distance_m": 6.75,
            "defender_present": False,
            "court_zone": "right_wing",
            "notes": ["practice session"],
        },
        "observations": [
            {
                "metric": "release_time_s",
                "value": 0.62,
                "unit": "s",
                "reference": "self_baseline",
                "measurement_confidence": "medium",
                "source": "phone_2d",
                "caveats": ["single camera"],
            }
        ],
        "evidence": [
            {
                "research_unit_id": 12,
                "claim": "Release time is associated with contest rate in this cohort.",
                "evidence_tier": "B",
                "supported_inferences": ["association"],
                "forbidden_inferences": ["causation"],
                "limitations": ["small sample"],
                "contradiction_group": None,
            }
        ],
        "recent_history": ["3 sessions this week"],
        "user_goal": "quicker release without losing accuracy",
    }


def valid_response() -> dict[str, Any]:
    return {
        "observation_summary": ["Release time 0.62 s from a single phone view."],
        "hypotheses": [
            {
                "statement": "An earlier set point may shorten release time.",
                "confidence": "low",
                "supporting_observations": ["release_time_s"],
                "competing_explanations": ["camera timing error"],
            }
        ],
        "confidence": "low",
        "coaching_comment": "Try an earlier set point for one week and retest.",
        "do_not_infer": ["force", "muscle activation"],
        "drills": [
            {
                "name": "one-dribble pull-up",
                "purpose": "earlier set point",
                "constraints": ["10 reps"],
                "success_criteria": ["release under 0.6 s"],
                "retest": "same camera setup next week",
            }
        ],
        "retest_plan": ["retest release time next week"],
        "evidence_used": [12],
    }


def scenario_row() -> dict[str, Any]:
    return {"request": valid_request(), "response": valid_response()}


def write_jsonl(path: Path, rows: list[Any]) -> Path:
    lines = [row if isinstance(row, str) else json.dumps(row, ensure_ascii=False) for row in rows]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


# ---------------------------------------------------------------------- stand-ins


class FakeTokenizer:
    """Deterministic character-level tokenizer with a chat template.

    Ids are ``ord(char) + 2``; 0 and 1 are the pad and eos ids. The template renders
    ``<role>\\n{content}\\n</role>\\n`` per message and ``<assistant>\\n`` as the
    generation prompt, so the prompt is always a prefix of the full conversation.
    """

    OFFSET = 2
    pad_token_id: int | None = 0
    eos_token_id = 1
    pad_token = "<pad>"
    eos_token = "<eos>"

    def render(self, messages: list[dict[str, str]], add_generation_prompt: bool) -> str:
        text = "".join(f"<{m['role']}>\n{m['content']}\n</{m['role']}>\n" for m in messages)
        if add_generation_prompt:
            text += self.generation_prompt()
        return text

    def generation_prompt(self) -> str:
        return "<assistant>\n"

    def encode(self, text: str) -> list[int]:
        return [ord(c) + self.OFFSET for c in text]

    def apply_chat_template(
        self,
        messages: list[dict[str, str]],
        *,
        tokenize: bool = True,
        add_generation_prompt: bool = False,
        return_dict: bool = False,
        return_tensors: str | None = None,
        **_: Any,
    ):
        text = self.render(messages, add_generation_prompt)
        if not tokenize:
            return text
        ids = self.encode(text)
        if return_tensors == "pt":
            tensor = torch.tensor([ids], dtype=torch.long)
            if return_dict:
                return {"input_ids": tensor, "attention_mask": torch.ones_like(tensor)}
            return tensor
        if return_dict:
            return {"input_ids": ids, "attention_mask": [1] * len(ids)}
        return ids

    def decode(self, ids, skip_special_tokens: bool = True) -> str:
        if hasattr(ids, "tolist"):
            ids = ids.tolist()
        return "".join(chr(i - self.OFFSET) for i in ids if i >= self.OFFSET)


class FakeModel(torch.nn.Module):
    """Echoes the prompt and appends a canned reply followed by eos."""

    def __init__(self, tokenizer: FakeTokenizer, reply: str) -> None:
        super().__init__()
        self.weight = torch.nn.Parameter(torch.zeros(1))
        self.tokenizer = tokenizer
        self.reply = reply
        self.generate_calls: list[dict[str, Any]] = []

    def generate(self, input_ids: torch.Tensor, attention_mask=None, **kwargs):
        self.generate_calls.append(kwargs)
        reply_ids = self.tokenizer.encode(self.reply) + [self.tokenizer.eos_token_id]
        reply = torch.tensor([reply_ids], dtype=torch.long)
        return torch.cat([input_ids, reply], dim=1)


class HubRecorder:
    def __init__(self, tokenizer: FakeTokenizer, model: FakeModel) -> None:
        self.tokenizer = tokenizer
        self.model = model
        self.tokenizer_calls: list[tuple[Any, dict[str, Any]]] = []
        self.model_calls: list[tuple[Any, dict[str, Any]]] = []
        self.peft_calls: list[tuple[Any, dict[str, Any]]] = []


# ----------------------------------------------------------------------- fixtures


_LOOPBACK = {"127.0.0.1", "::1", "localhost"}


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """Refuse every non-loopback socket connection for the duration of a test.

    Loopback stays open because asyncio's Windows event loop builds its self-pipe
    with ``socket.socketpair()``; nothing on loopback can reach a model hub.
    """
    original_connect = socket.socket.connect
    original_connect_ex = socket.socket.connect_ex

    def guarded(original):
        def connect(self, address, *args, **kwargs):
            host = address[0] if isinstance(address, tuple) else address
            if host not in _LOOPBACK:
                raise RuntimeError(f"network access is blocked in the coach test suite: {address!r}")
            return original(self, address, *args, **kwargs)

        return connect

    monkeypatch.setattr(socket.socket, "connect", guarded(original_connect))
    monkeypatch.setattr(socket.socket, "connect_ex", guarded(original_connect_ex))
    yield


@pytest.fixture
def fake_tokenizer() -> FakeTokenizer:
    return FakeTokenizer()


@pytest.fixture
def fake_hub(monkeypatch, fake_tokenizer) -> HubRecorder:
    """Replace the hub loaders used by formpath_coach.inference with recorders."""
    from formpath_coach import inference

    model = FakeModel(fake_tokenizer, json.dumps(valid_response()))
    recorder = HubRecorder(fake_tokenizer, model)

    class _AutoTokenizer:
        @staticmethod
        def from_pretrained(name, **kwargs):
            recorder.tokenizer_calls.append((name, kwargs))
            return recorder.tokenizer

    class _AutoModel:
        @staticmethod
        def from_pretrained(name, **kwargs):
            recorder.model_calls.append((name, kwargs))
            return recorder.model

    class _PeftModel:
        @staticmethod
        def from_pretrained(model, path, **kwargs):
            recorder.peft_calls.append((path, kwargs))
            return model

    monkeypatch.setattr(inference, "AutoTokenizer", _AutoTokenizer)
    monkeypatch.setattr(inference, "AutoModelForCausalLM", _AutoModel)
    monkeypatch.setattr(inference, "PeftModel", _PeftModel)
    return recorder


@pytest.fixture
def api_module(monkeypatch):
    """The FastAPI module with a cleared coach cache and no adapter/model env leakage."""
    from formpath_coach import api

    monkeypatch.delenv("FORMPATH_COACH_BASE_MODEL", raising=False)
    monkeypatch.delenv("FORMPATH_COACH_ADAPTER", raising=False)
    api.get_coach.cache_clear()
    yield api
    api.get_coach.cache_clear()


@pytest.fixture
def client(api_module):
    from fastapi.testclient import TestClient

    with TestClient(api_module.app) as test_client:
        yield test_client
