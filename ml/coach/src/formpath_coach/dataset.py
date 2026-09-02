from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import torch
from torch.utils.data import Dataset


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
    """JSONL dataset of {"request": {...}, "response": {...}} examples."""

    def __init__(self, path: str | Path):
        self.rows: list[dict[str, Any]] = []
        with Path(path).open("r", encoding="utf-8") as f:
            for line_no, line in enumerate(f, start=1):
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                if "request" not in row or "response" not in row:
                    raise ValueError(f"line {line_no}: expected request and response")
                self.rows.append(row)

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int) -> dict[str, Any]:
        return self.rows[index]


def make_collate_fn(tokenizer, max_length: int = 4096):
    def collate(rows: list[dict[str, Any]]) -> dict[str, torch.Tensor]:
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

            prompt_ids = tokenizer.apply_chat_template(
                prompt_messages,
                tokenize=True,
                add_generation_prompt=True,
            )
            full_ids = tokenizer.apply_chat_template(
                full_messages,
                tokenize=True,
                add_generation_prompt=False,
            )

            full_ids = full_ids[:max_length]
            prompt_len = min(len(prompt_ids), len(full_ids))
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
