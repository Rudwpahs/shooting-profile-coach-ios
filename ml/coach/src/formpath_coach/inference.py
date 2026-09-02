from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

from .dataset import SYSTEM_PROMPT
from .schemas import CoachRequest, CoachResponse


class FormPathCoach:
    def __init__(
        self,
        base_model: str = "Qwen/Qwen3-4B",
        adapter_path: str | Path | None = None,
    ) -> None:
        self.tokenizer = AutoTokenizer.from_pretrained(base_model, use_fast=True)
        if self.tokenizer.pad_token_id is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        dtype = None
        if torch.cuda.is_available():
            dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16

        model = AutoModelForCausalLM.from_pretrained(
            base_model,
            torch_dtype=dtype,
            device_map="auto" if torch.cuda.is_available() else None,
        )
        if adapter_path is not None:
            model = PeftModel.from_pretrained(model, str(adapter_path))
        self.model = model.eval()

    @torch.inference_mode()
    def coach(
        self,
        request: CoachRequest,
        *,
        max_new_tokens: int = 1400,
        temperature: float = 0.2,
    ) -> CoachResponse:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(request.model_dump(), ensure_ascii=False, separators=(",", ":")),
            },
        ]
        tensors: dict[str, Any] = self.tokenizer.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=True,
            return_tensors="pt",
            return_dict=True,
        )
        device = next(self.model.parameters()).device
        tensors = {k: v.to(device) for k, v in tensors.items()}

        output = self.model.generate(
            **tensors,
            max_new_tokens=max_new_tokens,
            do_sample=temperature > 0,
            temperature=max(temperature, 1e-5),
            top_p=0.9,
            repetition_penalty=1.05,
            eos_token_id=self.tokenizer.eos_token_id,
        )
        generated = output[0][tensors["input_ids"].shape[-1] :]
        text = self.tokenizer.decode(generated, skip_special_tokens=True).strip()

        payload = _extract_json_object(text)
        return CoachResponse.model_validate(payload)


def _extract_json_object(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise ValueError(f"model did not return JSON: {text[:300]!r}")
        return json.loads(text[start : end + 1])
