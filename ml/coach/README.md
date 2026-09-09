# FormPath Coach — experimental scaffold (PyTorch)

> **Status: experimental scaffold, not a finished Hoop Hub AI.**
> Nothing in this directory has been trained, evaluated, or connected to the mobile
> app. The sections [IMPLEMENTED](#implemented), [PLANNED / NOT IMPLEMENTED](#planned--not-implemented)
> and [EXPERIMENTAL / UNVERIFIED](#experimental--unverified) are the source of truth
> for what exists.

Self-hosted basketball coaching reasoner for FormPath / Hooper's Hub.

## Goal

Train and serve our own basketball coaching model without depending on a hosted LLM API at inference time.

The model does **not** ingest raw video in v0. The existing perception pipeline produces structured observations (pose/event/context/confidence). FormPath Coach turns those observations plus retrieved research evidence into calibrated coaching.

```text
video
  -> perception / pose / ball / event pipeline
  -> structured PlayerState JSON            (planned, not implemented)
  -> retrieve FormPath research units       (planned, not implemented)
  -> FormPath Coach (PyTorch)               (scaffold only, untrained)
  -> observation / hypotheses / confidence / coaching / drill / retest
```

## Core rule

We train the model to reason like FormPath, not to hallucinate biomechanics.

- visible pose != force / torque / muscle activation
- correlation != cause
- population average != personal optimum
- practice improvement != game transfer
- contradictory evidence must stay contradictory
- low measurement confidence must reduce coaching confidence

## IMPLEMENTED

Everything below exists in `src/formpath_coach/` and is covered by the offline test
suite in `tests/` (79 tests, no network, no model download).

| Piece | File | What it does today |
| --- | --- | --- |
| Schemas | `schemas.py` | Pydantic v2 contracts: `CoachRequest` (player, context, observations with measurement confidence and source, evidence items with tiers) and `CoachResponse` (observation summary, hypotheses, confidence, coaching comment, do-not-infer list, drills with a mandatory retest, evidence ids). Invalid literals, ranges and missing fields are rejected. |
| Scenario JSONL loader | `dataset.py` `ScenarioDataset` | Reads `{"request": ..., "response": ...}` lines, validates both halves against the schemas, reports the offending line number, skips blank lines, refuses malformed JSON, non-object rows and empty files. |
| PyTorch SFT scaffold | `dataset.py` `make_collate_fn`, `train_sft.py` | Chat-template collator that masks system+user prompt tokens to `-100` and trains only on the assistant JSON; checks the generation prompt is a prefix of the full conversation; truncates to `max_length` and refuses rows left with no trainable tokens. Plain PyTorch loop: AdamW, warmup + linear decay, gradient accumulation, grad clipping, adapter + tokenizer save. CLI values are validated and the dataset is loaded before any model download. |
| LoRA/QLoRA configuration scaffold | `train_sft.py` | PEFT `LoraConfig` (r=32, alpha=64, all attention and MLP projections) and a `BitsAndBytesConfig` NF4 double-quant 4-bit path that is enabled only when CUDA is available and `--no-qlora` is not passed. |
| Inference scaffold | `inference.py` `FormPathCoach` | Loads a base causal LM plus an optional **local** LoRA adapter directory, builds the same chat prompt as training, generates, extracts the JSON object and validates it as `CoachResponse`. Configuration (`base_model`, `adapter_path`, `max_new_tokens`, `temperature`) is validated before anything is loaded. |
| FastAPI scaffold | `api.py` | `GET /health` (never loads a model, reports `model_loaded`) and `POST /v1/coach` (lazy model construction on first call; 422 on schema violation, 503 when the model cannot be loaded, 500 when generation fails). |
| Corpus package, read-only (B2-A) | `corpus/knowledge-machine-v2/`, `corpus.py` | The FormPath Knowledge Machine v2 vendored byte-exact (940 units, RU-0061..RU-1000, normalized codes, checksummed manifest). `corpus.py` opens it read-only, answers with machine codes (stats; by domain, metric, policy; FTS hits) and returns text only for one explicitly named unit; `validate_corpus()` checks checksums, range, ids, vocabulary, counts and sources. No embedding, retrieval or training. |

## PLANNED / NOT IMPLEMENTED

None of the following exists in this repository. Do not read any file here as
evidence that it does.

- research corpus **ingestion into retrieval** (the v2 package itself is vendored and validated, see IMPLEMENTED; nothing indexes or embeds it)
- canonical research ledger and the evidence-code mapping to `CoachEvidenceItemV1` (the corpus uses `A, B, C, D, E, U`; the frozen contract uses `A, A-, B+, B, C, D, H`)
- training scenarios (there is no `data/` directory and no scenario JSONL yet; the
  loader has only been exercised on synthetic rows generated in the tests)
- RAG, embedding model, vector database / index, reranker
- citation resolver, source / evidence validation
- a trained adapter or a trained model (nothing has been trained; `outputs/` is git-ignored and empty)
- `PlayerState` and the perception-to-request bridge
- representative-profile adapter
- mobile integration with the Expo app
- authentication, rate limiting, deployment
- DPO (v1), reward / evaluation model (v2)

## EXPERIMENTAL / UNVERIFIED

These are the intended paths and they have **not** been run here. Treat every
number as an estimate until a run is recorded with its command and output.

- Qwen3-4B actual training with `train_sft.py` (never executed; no download was performed)
- 4-bit QLoRA on the owner's hardware (Ryzen 5 5600, 16 GB RAM, RTX 4060 8 GB)
- Windows-native bitsandbytes CUDA kernels (only `import bitsandbytes` 0.50.2 with
  CPU-only torch was checked on Windows; no 4-bit kernel was executed)
- training inside 8 GB of VRAM (see the estimate below; likely not at the default `--max-length 4096`)
- production inference latency / throughput (no measurement exists)
- the Qwen3 chat template with `enable_thinking`; the collator checks prefix
  consistency at runtime, but the template itself was only exercised with the test
  suite's fake tokenizer

## Package layout

```text
ml/coach/
  pyproject.toml
  README.md
  .gitignore                  (.venv/, outputs/, caches)
  src/formpath_coach/
    __init__.py
    schemas.py
    dataset.py
    train_sft.py
    inference.py
    api.py
  tests/
    conftest.py               (offline guard, fake tokenizer + fake model)
    test_schemas.py
    test_dataset.py
    test_inference.py
    test_api.py
    test_train_sft.py
```

## Data contract

Training examples should be scenarios, not copied papers.

Each scenario contains:
- player context
- basketball context
- measured observations and measurement confidence
- retrieved evidence IDs / evidence tiers
- contradictions / limitations
- gold FormPath coaching response

The research corpus remains external knowledge. Fine-tuning teaches behavior and inference boundaries.

One JSONL line per scenario; `request` must validate as `CoachRequest` and
`response` as `CoachResponse`:

```json
{"request": {"player": {"age": 17, "handedness": "right"},
             "context": {"action": "catch_and_shoot", "distance_m": 6.75},
             "observations": [{"metric": "release_time_s", "value": 0.62, "unit": "s",
                               "measurement_confidence": "medium", "source": "phone_2d"}],
             "evidence": [{"research_unit_id": 12, "claim": "...", "evidence_tier": "B"}]},
 "response": {"observation_summary": ["..."], "hypotheses": [{"statement": "...", "confidence": "low"}],
              "confidence": "low", "coaching_comment": "...", "do_not_infer": ["force"],
              "drills": [{"name": "...", "purpose": "...", "retest": "..."}], "evidence_used": [12]}}
```

`ScenarioDataset` raises `ValueError` with the file and line number for malformed
JSON, non-object rows, missing `request`/`response`, schema violations, and for an
empty file. The collator serialises the raw dictionaries exactly as written.

## Running locally

```bash
cd ml/coach
uv venv .venv --python 3.11
# CPU-only torch is enough for the test suite:
uv pip install --python .venv --index https://download.pytorch.org/whl/cpu "torch==2.13.0"
uv pip install --python .venv -e ".[dev]"
.venv/Scripts/python -m pytest -q          # Windows; use .venv/bin/python elsewhere
.venv/Scripts/python -m ruff check src tests
```

The tests force `HF_HUB_OFFLINE=1`, refuse every non-loopback socket connection and
replace the tokenizer/model loaders with deterministic stand-ins, so they never
download anything.

Training (unverified; downloads the base model on first use unless it is cached):

```bash
python -m formpath_coach.train_sft --train-jsonl path/to/scenarios.jsonl \
  --max-length 1024 --batch-size 1 --grad-accum 16 --output-dir outputs/formpath-coach-v0
```

Serving (unverified; the first `POST /v1/coach` constructs the model, `GET /health` never does):

```bash
FORMPATH_COACH_BASE_MODEL=Qwen/Qwen3-4B \
FORMPATH_COACH_ADAPTER=outputs/formpath-coach-v0 \
uvicorn formpath_coach.api:app --port 8000
```

`FORMPATH_COACH_ADAPTER` must be an existing local directory; an unset or empty
value means "base model only". Error details from the loader are returned in the
503 body to make local debugging possible; this API is not hardened for public exposure.

## Hardware and environment support

Derived from the code, `pyproject.toml` and the package indexes on 2026-09-07. No
training or inference run backs any row; "expected VRAM" is arithmetic, not measurement.

| Environment | torch 2.13 | PEFT | bitsandbytes / 4-bit QLoRA | Expected VRAM |
| --- | --- | --- | --- | --- |
| Native Windows (owner: RTX 4060 8 GB) | The plain PyPI `torch` wheel for Windows is CPU-only; CUDA builds exist as `torch-2.13.0+cu126` / `+cu130` `win_amd64` on `download.pytorch.org` and must be installed from that index before `pip install -e .` | pure Python, no platform constraint | `win_amd64` wheels ship from 0.47; the bitsandbytes README lists Windows 11 x86-64 + NVIDIA CUDA (SM60+, SM75+ recommended) with QLoRA 4-bit as supported. Only the import was checked here, on CPU torch. | Estimate below; 8 GB is likely insufficient at `--max-length 4096`, plausible but unverified at 512–1024 |
| WSL2 (Ubuntu, Windows NVIDIA driver with WSL support) | `manylinux_2_28` CUDA wheels (`+cu126` / `+cu130`); PyPI Linux wheels bundle CUDA via `nvidia-*` dependencies | works | `manylinux_2_24` wheels; this is the Linux path the library is primarily tested on. Unverified here. | Same GPU, same estimate |
| Linux cloud GPU (24 GB+, e.g. A10/L4/A100-class) | PyPI or `download.pytorch.org` CUDA wheels | works | supported (Linux x86-64 / aarch64 wheels) | Comfortably above the estimate; the practical first target for a real run |

Dependency marker: `bitsandbytes>=0.47; platform_system != 'Darwin'`. The previous
`platform_system == 'Linux'` marker excluded native Windows although `win_amd64`
wheels exist from 0.47.0 (PyPI file list) and Windows CUDA 4-bit is listed as
supported in the library's own README. macOS is excluded on purpose: wheels for
macOS arm64 only appear from 0.49 and the scaffold's 4-bit path is CUDA-only.

### VRAM estimate for Qwen3-4B QLoRA (not measured)

Assumptions: about 4.0 B parameters; Qwen-family vocabulary of roughly 152 k
entries; hidden size 2560, 36 layers, intermediate size 9728, 32 query / 8 key-value
heads of dimension 128 — these come from memory of the model config and must be
checked against the model's `config.json` before being relied on.

- NF4 weights: ~0.5 byte/parameter plus quantisation constants, with embeddings /
  `lm_head` left in 16-bit → roughly 2.5–3 GB resident
- LoRA r=32 on the seven projections: ~66 M trainable parameters; fp32 AdamW keeps
  weight + gradient + two moments ≈ 16 bytes each → ~1 GB
- Logits: `seq × vocab` in bf16 plus an fp32 upcast in the loss ≈ 4096 × 152 k × 6 bytes
  ≈ 3.7 GB at `--max-length 4096`, ≈ 0.9 GB at 1024, ≈ 0.5 GB at 512
- Checkpointed layer activations, CUDA context and allocator fragmentation on top

At the default `--max-length 4096` the sum already exceeds 8 GB, so an RTX 4060 8 GB
run at defaults should be expected to fail with out-of-memory. Documented options,
none of them verified:

- `--max-length 1024` or `512` with `--batch-size 1 --grad-accum 16` or higher
- a smaller base model (`--model Qwen/Qwen3-1.7B` or `Qwen/Qwen3-0.6B`)
- a Linux cloud GPU with 24 GB or more
- `--no-qlora` is **not** an option on 8 GB: bf16 weights alone are ~8 GB

CPU inference with `FormPathCoach` loads the 4 B model in float32 (~16 GB), which
does not fit the owner's 16 GB machine; CPU use is only realistic with a much
smaller base model.

## Model plan (planned, nothing below is implemented)

### v0
- Base: `Qwen/Qwen3-4B`
- Framework: PyTorch + Transformers + PEFT
- Training: supervised fine-tuning with LoRA/QLoRA
- Retrieval: research-unit JSONL + embedding index (separate from weights)
- Output: structured coaching response

### v1
- DPO on preferred vs rejected FormPath coaching answers
- source-level held-out evaluation
- 8B benchmark against 4B

### v2
- real-user loop: analysis -> recommendation -> retest -> game transfer
- reward/evaluation model for evidence grounding, uncertainty and coaching usefulness

## Why not train from random weights?

The 1,000 research units are valuable domain evidence, but nowhere near enough text to pretrain a competent language model from scratch. We therefore own the training pipeline and resulting adapter/model while starting from a permissively licensed open-weight foundation model.
