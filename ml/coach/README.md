# FormPath Coach — PyTorch

Self-hosted basketball coaching reasoner for FormPath / Hooper's Hub.

## Goal

Train and serve our own basketball coaching model without depending on a hosted LLM API at inference time.

The model does **not** ingest raw video in v0. The existing perception pipeline produces structured observations (pose/event/context/confidence). FormPath Coach turns those observations plus retrieved research evidence into calibrated coaching.

```text
video
  -> perception / pose / ball / event pipeline
  -> structured PlayerState JSON
  -> retrieve FormPath research units
  -> FormPath Coach (PyTorch)
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

## Model plan

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

## Package layout

```text
ml/coach/
  pyproject.toml
  src/formpath_coach/
    schemas.py
    dataset.py
    train_sft.py
    inference.py
    api.py
  data/
    README.md
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

## Hardware

Start with QLoRA on the 4B model. A 24 GB CUDA GPU is a practical first target for experimentation; exact memory depends on sequence length, batch size, optimizer and quantization settings. Full-parameter training is intentionally not the v0 path.
