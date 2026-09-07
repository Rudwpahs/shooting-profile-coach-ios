from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import torch
from pydantic import ValidationError
from torch.utils.data import Dataset

from .schemas import CoachRequest, CoachResponse

SYSTEM_PROMPT = """You are FormPath Coach, an evidence-aware basketball development model.

Rules:
1. Separate observation from interpretation.
2. Never infer force, torque, muscle activation, injury risk, or true 3D mechanics from ordinary RGB pose unless the input explicitly provides validated measurements.
3. Preserve competing explanations and contradictory evidence.
4. Population averages are context, not personal optimums.
5. Correlation is not causation. Association alone does not justify a corrective cue.
6. Lower measurement confidence must lower coaching confidence.
7. Distinguish practice performance, retention, transfer, and game performance.
8. Prefer the smallest testable intervention and always include a retest.
9. Output only valid JSON matching the requested FormPath coaching schema.
"""


class ScenarioDataset(Dataset):
    """JSONL dataset of {"request": {...}, "response": {...}} examples.

    Every non-empty line must be a JSON object whose ``request`` validates as
    :class:`CoachRequest` and whose ``response`` validates as :class:`CoachResponse`.
    Rows are kept as the raw dictionaries so the collator serialises exactly what
    was written. An empty file is an error: there is nothing to train on.
    """

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.rows: list[dict[str, Any]] = []
        with self.path.open("r", encoding="utf-8") as f:
            for line_no, line in enumerate(f, start=1):
                line = line.strip()
                if not line:
                    continue
                where = f"{self.path}: line {line_no}"
                try:
                    row = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"{where}: malformed JSON: {exc.msg}") from exc
                if not isinstance(row, dict):
                    # Every bad line is a ValueError so callers have one exception to handle.
                    raise ValueError(f"{where}: expected a JSON object")  # noqa: TRY004
                if "request" not in row or "response" not in row:
                    raise ValueError(f"{where}: expected request and response")
                try:
                    CoachRequest.model_validate(row["request"])
                    CoachResponse.model_validate(row["response"])
                except ValidationError as exc:
                    raise ValueError(f"{where}: {exc}") from exc
                self.rows.append(row)
        if not self.rows:
            raise ValueError(f"{self.path}: no scenarios found")

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int) -> dict[str, Any]:
        return self.rows[index]


def make_collate_fn(tokenizer, max_length: int = 4096):
    """Build a collator that masks the prompt to -100 and trains on the assistant turn only."""
    if max_length < 1:
        raise ValueError("max_length must be >= 1")

    def collate(rows: list[dict[str, Any]]) -> dict[str, torch.Tensor]:
        if not rows:
            raise ValueError("cannot collate an empty batch")

        input_ids_batch: list[torch.Tensor] = []
        labels_batch: list[torch.Tensor] = []

        for row in rows:
            request_text = json.dumps(row["request"], ensure_ascii=False, separators=(",", ":"))
            response_text = json.dumps(row["response"], ensure_ascii=False, separators=(",", ":"))

            prompt_messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": request_text},
            ]
            full_messages = prompt_messages + [{"role": "assistant", "content": response_text}]

            # return_dict=False pins the list[int] return shape across transformers versions.
            prompt_ids = list(
                tokenizer.apply_chat_template(
                    prompt_messages,
                    tokenize=True,
                    add_generation_prompt=True,
                    return_dict=False,
                )
            )
            full_ids = list(
                tokenizer.apply_chat_template(
                    full_messages,
                    tokenize=True,
                    add_generation_prompt=False,
                    return_dict=False,
                )
            )

            if full_ids[: len(prompt_ids)] != prompt_ids:
                raise ValueError(
                    "chat template: the generation prompt is not a prefix of the full "
                    "conversation, so prompt masking would be wrong for this tokenizer"
                )

            full_ids = full_ids[:max_length]
            prompt_len = min(len(prompt_ids), len(full_ids))
            if prompt_len == len(full_ids):
                raise ValueError(
                    f"no trainable response tokens after truncation to max_length={max_length} "
                    f"(prompt is {len(prompt_ids)} tokens); raise max_length or shorten the scenario"
                )
            labels = [-100] * prompt_len + full_ids[prompt_len:]

            input_ids_batch.append(torch.tensor(full_ids, dtype=torch.long))
            labels_batch.append(torch.tensor(labels, dtype=torch.long))

        max_len = max(x.numel() for x in input_ids_batch)
        pad_id = tokenizer.pad_token_id
        if pad_id is None:
            pad_id = tokenizer.eos_token_id

        padded_inputs = torch.full((len(rows), max_len), pad_id, dtype=torch.long)
        padded_labels = torch.full((len(rows), max_len), -100, dtype=torch.long)
        attention_mask = torch.zeros((len(rows), max_len), dtype=torch.long)

        for i, (ids, labels) in enumerate(zip(input_ids_batch, labels_batch, strict=True)):
            n = ids.numel()
            padded_inputs[i, :n] = ids
            padded_labels[i, :n] = labels
            attention_mask[i, :n] = 1

        return {
            "input_ids": padded_inputs,
            "attention_mask": attention_mask,
            "labels": padded_labels,
        }

    return collate
