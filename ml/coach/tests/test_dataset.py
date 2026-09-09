from __future__ import annotations

import json

import pytest
import torch
from conftest import FakeTokenizer, scenario_row, valid_request, valid_response, write_jsonl

from formpath_coach.dataset import SYSTEM_PROMPT, ScenarioDataset, make_collate_fn
from formpath_coach.schemas import CoachRequest, CoachResponse

# ----------------------------------------------------------------- loading


def test_loads_valid_jsonl_and_skips_blank_lines(tmp_path):
    second = scenario_row()
    second["request"]["user_goal"] = "more arc"
    path = write_jsonl(tmp_path / "train.jsonl", [scenario_row(), "", "   ", second])

    dataset = ScenarioDataset(path)

    assert len(dataset) == 2
    assert dataset[0] == scenario_row()
    assert dataset[1]["request"]["user_goal"] == "more arc"


def test_malformed_json_line_is_rejected_with_line_number(tmp_path):
    path = write_jsonl(tmp_path / "bad.jsonl", [scenario_row(), "{not json"])

    with pytest.raises(ValueError, match=r"line 2: malformed JSON"):
        ScenarioDataset(path)


def test_non_object_line_is_rejected(tmp_path):
    path = write_jsonl(tmp_path / "list.jsonl", ["[1, 2, 3]"])

    with pytest.raises(ValueError, match=r"line 1: expected a JSON object"):
        ScenarioDataset(path)


def test_row_without_response_is_rejected(tmp_path):
    path = write_jsonl(tmp_path / "half.jsonl", [{"request": valid_request()}])

    with pytest.raises(ValueError, match=r"line 1: expected request and response"):
        ScenarioDataset(path)


def test_request_missing_required_field_is_rejected(tmp_path):
    row = scenario_row()
    del row["request"]["player"]
    path = write_jsonl(tmp_path / "noplayer.jsonl", [scenario_row(), row])

    with pytest.raises(ValueError, match=r"line 2") as excinfo:
        ScenarioDataset(path)
    assert "player" in str(excinfo.value)


def test_response_missing_required_field_is_rejected(tmp_path):
    row = scenario_row()
    del row["response"]["coaching_comment"]
    path = write_jsonl(tmp_path / "nocomment.jsonl", [row])

    with pytest.raises(ValueError, match=r"line 1") as excinfo:
        ScenarioDataset(path)
    assert "coaching_comment" in str(excinfo.value)


@pytest.mark.parametrize("content", ["", "\n\n   \n"], ids=["empty", "whitespace-only"])
def test_empty_dataset_is_rejected(tmp_path, content):
    path = tmp_path / "empty.jsonl"
    path.write_text(content, encoding="utf-8")

    with pytest.raises(ValueError, match=r"no scenarios found"):
        ScenarioDataset(path)


def test_missing_file_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        ScenarioDataset(tmp_path / "does-not-exist.jsonl")


# ----------------------------------------------------------------- collation


def _prompt_len(tokenizer: FakeTokenizer, row: dict) -> int:
    request_text = json.dumps(row["request"], ensure_ascii=False, separators=(",", ":"))
    prompt = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": request_text},
    ]
    return len(tokenizer.apply_chat_template(prompt, tokenize=True, add_generation_prompt=True))


def test_collate_shapes_and_padding(fake_tokenizer):
    short = scenario_row()
    long = scenario_row()
    long["response"]["coaching_comment"] = "x" * 200
    batch = make_collate_fn(fake_tokenizer, max_length=100_000)([short, long])

    assert set(batch) == {"input_ids", "attention_mask", "labels"}
    assert batch["input_ids"].shape == batch["labels"].shape == batch["attention_mask"].shape
    assert batch["input_ids"].shape[0] == 2
    assert batch["input_ids"].dtype == batch["labels"].dtype == torch.long

    n_short = int(batch["attention_mask"][0].sum())
    n_long = int(batch["attention_mask"][1].sum())
    assert n_short < n_long == batch["input_ids"].shape[1]
    assert torch.all(batch["input_ids"][0, n_short:] == fake_tokenizer.pad_token_id)
    assert torch.all(batch["labels"][0, n_short:] == -100)
    assert torch.all(batch["attention_mask"][0, n_short:] == 0)


def test_prompt_tokens_are_masked(fake_tokenizer):
    row = scenario_row()
    prompt_len = _prompt_len(fake_tokenizer, row)
    batch = make_collate_fn(fake_tokenizer, max_length=100_000)([row])

    assert prompt_len > 0
    assert torch.all(batch["labels"][0, :prompt_len] == -100)


def test_assistant_response_tokens_remain_trainable(fake_tokenizer):
    row = scenario_row()
    prompt_len = _prompt_len(fake_tokenizer, row)
    batch = make_collate_fn(fake_tokenizer, max_length=100_000)([row])
    n = int(batch["attention_mask"][0].sum())

    trainable = batch["labels"][0, prompt_len:n]
    assert trainable.numel() > 0
    assert torch.all(trainable != -100)
    assert torch.equal(trainable, batch["input_ids"][0, prompt_len:n])

    response_text = json.dumps(row["response"], ensure_ascii=False, separators=(",", ":"))
    assert response_text in fake_tokenizer.decode(trainable)


def test_max_length_truncates_the_sequence(fake_tokenizer):
    row = scenario_row()
    prompt_len = _prompt_len(fake_tokenizer, row)
    max_length = prompt_len + 5
    batch = make_collate_fn(fake_tokenizer, max_length=max_length)([row])

    assert batch["input_ids"].shape[1] == max_length
    assert int((batch["labels"][0] != -100).sum()) == 5


def test_truncation_that_removes_every_response_token_is_an_error(fake_tokenizer):
    row = scenario_row()
    prompt_len = _prompt_len(fake_tokenizer, row)

    with pytest.raises(ValueError, match=r"no trainable response tokens"):
        make_collate_fn(fake_tokenizer, max_length=prompt_len)([row])


def test_make_collate_fn_rejects_non_positive_max_length(fake_tokenizer):
    with pytest.raises(ValueError, match=r"max_length"):
        make_collate_fn(fake_tokenizer, max_length=0)


def test_collate_rejects_empty_batch(fake_tokenizer):
    with pytest.raises(ValueError, match=r"empty batch"):
        make_collate_fn(fake_tokenizer)([])


def test_collate_rejects_template_whose_prompt_is_not_a_prefix():
    class DriftingTokenizer(FakeTokenizer):
        def generation_prompt(self) -> str:
            return "<assistant>\n<think>\n\n</think>\n\nOK "

    with pytest.raises(ValueError, match=r"not a prefix"):
        make_collate_fn(DriftingTokenizer())([scenario_row()])


def test_collate_falls_back_to_eos_when_pad_is_missing(fake_tokenizer):
    fake_tokenizer.pad_token_id = None
    short = scenario_row()
    long = scenario_row()
    long["response"]["coaching_comment"] = "y" * 50
    batch = make_collate_fn(fake_tokenizer)([short, long])
    n_short = int(batch["attention_mask"][0].sum())

    assert torch.all(batch["input_ids"][0, n_short:] == fake_tokenizer.eos_token_id)


# --------------------------------------------------------------- round trip


def test_synthetic_jsonl_round_trip(tmp_path, fake_tokenizer):
    rows = []
    for i in range(4):
        request = CoachRequest.model_validate(valid_request())
        request.user_goal = f"goal {i}"
        response = CoachResponse.model_validate(valid_response())
        response.coaching_comment = f"comment {i}"
        rows.append(
            {"request": request.model_dump(mode="json"), "response": response.model_dump(mode="json")}
        )
    path = write_jsonl(tmp_path / "synthetic.jsonl", rows)

    dataset = ScenarioDataset(path)
    assert [dataset[i] for i in range(len(dataset))] == rows

    batch = make_collate_fn(fake_tokenizer, max_length=100_000)([dataset[i] for i in range(4)])
    assert batch["input_ids"].shape[0] == 4
    for i in range(4):
        n = int(batch["attention_mask"][i].sum())
        trainable = batch["labels"][i][batch["labels"][i] != -100]
        assert f"comment {i}" in fake_tokenizer.decode(trainable)
        assert n == int((batch["input_ids"][i] != fake_tokenizer.pad_token_id).sum())
