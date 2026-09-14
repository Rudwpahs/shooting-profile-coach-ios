from __future__ import annotations

import json

import pytest
from conftest import valid_request, valid_response

from formpath_coach.inference import FormPathCoach, _extract_json_object
from formpath_coach.schemas import CoachRequest, CoachResponse


def test_import_never_loads_a_model(fake_hub):
    # Importing the module and building the fixture must not call any loader.
    assert fake_hub.tokenizer_calls == []
    assert fake_hub.model_calls == []
    assert fake_hub.peft_calls == []


def test_adapter_is_optional(fake_hub):
    coach = FormPathCoach(base_model="fake/base")

    assert [name for name, _ in fake_hub.tokenizer_calls] == ["fake/base"]
    assert [name for name, _ in fake_hub.model_calls] == ["fake/base"]
    assert fake_hub.peft_calls == []
    assert coach.model is fake_hub.model


def test_adapter_is_loaded_when_a_local_directory_is_given(fake_hub, tmp_path):
    adapter_dir = tmp_path / "adapter"
    adapter_dir.mkdir()

    FormPathCoach(base_model="fake/base", adapter_path=adapter_dir)

    assert fake_hub.peft_calls == [(str(adapter_dir), {})]


def test_adapter_path_must_be_an_existing_directory(fake_hub, tmp_path):
    with pytest.raises(ValueError, match=r"adapter_path"):
        FormPathCoach(base_model="fake/base", adapter_path=tmp_path / "missing")

    # Config is rejected before anything is loaded.
    assert fake_hub.tokenizer_calls == []
    assert fake_hub.model_calls == []


@pytest.mark.parametrize("base_model", ["", "   ", None])
def test_base_model_must_be_a_non_empty_string(fake_hub, base_model):
    with pytest.raises(ValueError, match=r"base_model"):
        FormPathCoach(base_model=base_model)
    assert fake_hub.tokenizer_calls == []


def test_pad_token_falls_back_to_eos(fake_hub):
    fake_hub.tokenizer.pad_token_id = None

    coach = FormPathCoach(base_model="fake/base")

    assert coach.tokenizer.pad_token == fake_hub.tokenizer.eos_token


@pytest.mark.parametrize(
    "kwargs",
    [
        pytest.param({"max_new_tokens": 0}, id="max_new_tokens=0"),
        pytest.param({"max_new_tokens": -5}, id="max_new_tokens<0"),
        pytest.param({"temperature": -0.1}, id="temperature<0"),
    ],
)
def test_generation_config_is_validated(fake_hub, kwargs):
    coach = FormPathCoach(base_model="fake/base")

    with pytest.raises(ValueError):
        coach.coach(CoachRequest.model_validate(valid_request()), **kwargs)
    assert fake_hub.model.generate_calls == []


def test_coach_returns_a_validated_response(fake_hub):
    coach = FormPathCoach(base_model="fake/base")

    response = coach.coach(CoachRequest.model_validate(valid_request()), max_new_tokens=64)

    assert isinstance(response, CoachResponse)
    assert response.model_dump(mode="json") == valid_response()
    (call,) = fake_hub.model.generate_calls
    assert call["max_new_tokens"] == 64
    assert call["eos_token_id"] == fake_hub.tokenizer.eos_token_id


def test_greedy_when_temperature_is_zero(fake_hub):
    coach = FormPathCoach(base_model="fake/base")

    coach.coach(CoachRequest.model_validate(valid_request()), temperature=0)

    (call,) = fake_hub.model.generate_calls
    assert call["do_sample"] is False


def test_coach_accepts_json_wrapped_in_prose(fake_hub):
    fake_hub.model.reply = "Sure, here it is:\n```json\n" + json.dumps(valid_response()) + "\n```"
    coach = FormPathCoach(base_model="fake/base")

    response = coach.coach(CoachRequest.model_validate(valid_request()))

    assert response.coaching_comment == valid_response()["coaching_comment"]


def test_coach_rejects_output_that_is_not_a_coach_response(fake_hub):
    fake_hub.model.reply = json.dumps({"coaching_comment": "no other fields"})
    coach = FormPathCoach(base_model="fake/base")

    with pytest.raises(ValueError):  # pydantic.ValidationError is a ValueError
        coach.coach(CoachRequest.model_validate(valid_request()))


def test_coach_rejects_output_without_json(fake_hub):
    fake_hub.model.reply = "I cannot help with that."
    coach = FormPathCoach(base_model="fake/base")

    with pytest.raises(ValueError, match=r"did not return JSON"):
        coach.coach(CoachRequest.model_validate(valid_request()))


def test_extract_json_object_handles_plain_fenced_and_bad_input():
    assert _extract_json_object('{"a": 1}') == {"a": 1}
    assert _extract_json_object('text before {"a": {"b": 2}} text after') == {"a": {"b": 2}}
    with pytest.raises(ValueError, match=r"JSON object"):
        _extract_json_object("[1, 2, 3]")
    with pytest.raises(ValueError, match=r"did not return JSON"):
        _extract_json_object("no braces here")
