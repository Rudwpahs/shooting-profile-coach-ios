from __future__ import annotations

import pytest
from conftest import scenario_row, write_jsonl

from formpath_coach.train_sft import parse_args


@pytest.fixture
def train_jsonl(tmp_path):
    return write_jsonl(tmp_path / "train.jsonl", [scenario_row()])


def test_parse_args_defaults(train_jsonl):
    args = parse_args(["--train-jsonl", str(train_jsonl)])

    assert args.model == "Qwen/Qwen3-4B"
    assert args.epochs == 2
    assert args.batch_size == 1
    assert args.grad_accum == 16
    assert args.max_length == 4096
    assert args.no_qlora is False


@pytest.mark.parametrize(
    ("flag", "value", "message"),
    [
        ("--epochs", "0", "--epochs"),
        ("--batch-size", "0", "--batch-size"),
        ("--grad-accum", "0", "--grad-accum"),
        ("--max-length", "0", "--max-length"),
        ("--lr", "0", "--lr"),
        ("--lr", "-0.0001", "--lr"),
        ("--warmup-ratio", "1.5", "--warmup-ratio"),
        ("--warmup-ratio", "-0.1", "--warmup-ratio"),
    ],
)
def test_parse_args_rejects_invalid_values(train_jsonl, flag, value, message):
    with pytest.raises(ValueError, match=message):
        parse_args(["--train-jsonl", str(train_jsonl), flag, value])


def test_parse_args_rejects_missing_train_file(tmp_path):
    with pytest.raises(ValueError, match=r"--train-jsonl not found"):
        parse_args(["--train-jsonl", str(tmp_path / "missing.jsonl")])


def test_train_jsonl_is_required():
    with pytest.raises(SystemExit):
        parse_args([])
