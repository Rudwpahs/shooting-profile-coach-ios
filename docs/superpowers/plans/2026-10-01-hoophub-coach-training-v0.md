# Hoop Hub Coach Training v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the first reproducible, contract-valid Qwen3-4B QLoRA Coach candidate from the existing B2-C scenario/evaluation stack without changing the frozen Coach V1 contract, Firestore schema, Motion/Phase/Film behavior, or raw-video policy.

**Architecture:** Reuse the existing 560-scenario B2-C train/dev/held-out split and evaluator. Harden the current `train_sft.py` scaffold with a deterministic Linux/WSL2 preflight, explicit run configuration, token-length audit, fail-closed run manifest, and a learned `CoachRequestV1 -> CoachResponseV1` provider. Research remains retrieved evidence; training teaches response behavior and inference boundaries.

**Tech Stack:** Python 3.11; WSL2 Ubuntu as the canonical owner-machine training environment; PyTorch 2.13 CUDA 12.6 line; Transformers 4.56+; PEFT 0.17+; bitsandbytes 0.47+; Qwen/Qwen3-4B; 4-bit NF4 double quantization; Pydantic v2; pytest/ruff.

**Spec:** `docs/superpowers/specs/2026-10-01-hoophub-compute-efficient-coach-design.md`

**Supporting experiment protocol:** `docs/ai/b3-first-experiment-plan.md`

## Global Constraints

- Start from the latest `main`; do not base this work on PR #19, #20, or #21.
- Do not modify Motion/Phase/Film UI files or `RepresentativePose4DV2` semantics.
- Do not change `contracts/coach-*-v1.schema.json` in Training v0.
- Do not change Firestore schema/rules or upload raw video.
- First learned baseline is `Qwen/Qwen3-4B`; 8B/KD/selective multi-pass remain later gated experiments.
- Canonical local training environment is WSL2 Ubuntu + Python 3.11; normal app development may remain on Windows.
- Resolve and record the exact base-model/tokenizer revision at execution time; never train against a floating revision without recording the resolved hash.
- Use 4-bit QLoRA: NF4, double quantization, BF16 compute only when runtime support is verified, otherwise FP16.
- Preserve the current LoRA shape for the first baseline: rank 32, alpha 64, dropout 0.05, targets `q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj` after verifying those names on the resolved model revision.
- Batch size 1, gradient accumulation 16, learning rate `2e-4`, seed 42 for the first baseline.
- Sequence-length ladder is 512 -> 768 -> 1024. Choose the smallest length that fits every selected row without truncation. If 1024 is insufficient, stop and version a smaller evidence payload; do not silently truncate required prompt/response content.
- Smoke run uses exactly 32 train rows sorted deterministically by request/scenario identity and at most 20 optimizer steps. It must not touch held-out.
- Dev may tune choices; held-out is evaluated only after the candidate configuration is selected.
- Adapter/model outputs stay git-ignored. Only manifests, metrics, hashes, and small structured evaluation outputs may be committed.
- A failed/OOM/non-finite run remains a failed run; do not repair logs or label an artifact trained.

## Review Focus

- 8 GB VRAM pressure: OOM must stop cleanly and preserve a failure manifest without a success adapter.
- Token overflow: no selected row may be silently truncated to fit the configured sequence length.
- WSL/CUDA mismatch: CPU torch, unavailable 4-bit kernels, or wrong CUDA runtime must fail preflight before model download/training.
- Split leakage: held-out IDs/evidence partitions must never enter training, prompt tuning, or early stopping.
- Learned-provider output: malformed JSON, out-of-contract references, or unsupported inferences must remain evaluation failures rather than being auto-repaired.

---

### Task 1: Add a deterministic training-environment preflight

**Files:**
- Create: `ml/coach/src/formpath_coach/training_preflight.py`
- Create: `ml/coach/tests/test_training_preflight.py`

**Interfaces:**
- Produces: `TrainingEnvironmentV1` record with Python/platform, torch/CUDA, GPU name/VRAM, BF16 support, bitsandbytes availability, and free disk.
- Produces: `collect_training_environment() -> TrainingEnvironmentV1`.
- Produces: `validate_owner_training_environment(env: TrainingEnvironmentV1) -> list[str]`; empty means the canonical WSL2/CUDA training prerequisites pass.

- [ ] **Step 1: Write failing tests for valid WSL2 CUDA, CPU-only torch, missing bitsandbytes 4-bit support, and insufficient/unknown GPU memory reporting.**
- [ ] **Step 2: Run `python -m pytest ml/coach/tests/test_training_preflight.py -q` and verify RED.**
- [ ] **Step 3: Implement the pure validation functions and injectable runtime probes; imports must not download/load a model.**
- [ ] **Step 4: Re-run the focused tests and Ruff; verify GREEN.**
- [ ] **Step 5: Commit `feat(coach): add training environment preflight`.**

### Task 2: Freeze a reproducible Training v0 run contract

**Files:**
- Create: `ml/coach/src/formpath_coach/training_run.py`
- Create: `ml/coach/tests/test_training_run.py`
- Modify: `ml/coach/src/formpath_coach/train_sft.py`
- Modify: `ml/coach/tests/test_train_sft.py`

**Interfaces:**
- Produces: `TrainingRunConfigV1` containing model ID/revision, dataset path/hash, max length, batch/accumulation, epochs/max steps, LR, seed, QLoRA and LoRA parameters.
- Produces: `TrainingRunManifestV1` containing source commit, resolved model/tokenizer revision, environment snapshot, dataset/manifest hashes, run status, elapsed time, peak CUDA allocated/reserved bytes, and artifact hashes when successful.
- Produces: `write_run_manifest(path, manifest) -> None` with deterministic JSON ordering.

- [ ] **Step 1: Write failing tests that pin the locked baseline values (r32/alpha64/dropout0.05, batch1/accum16, LR 2e-4, seed42) and reject missing resolved model revision for a real run.**
- [ ] **Step 2: Add tests that `max_steps` can bound the 32-row smoke run and that non-finite loss/OOM records failure rather than saving a success adapter.**
- [ ] **Step 3: Implement `TrainingRunConfigV1`/manifest serialization and thread explicit config values through `train_sft.py`; keep legacy defaults compatible for offline tests.**
- [ ] **Step 4: Add gradient checkpointing as an explicit config flag defaulting on for the 4B owner-machine baseline.**
- [ ] **Step 5: Run the focused suite plus `ml/coach/tests/test_train_sft.py`; verify GREEN and Ruff clean.**
- [ ] **Step 6: Commit `feat(coach): freeze training v0 run contract`.**

### Task 3: Add a no-truncation token audit and deterministic smoke subset

**Files:**
- Create: `ml/coach/src/formpath_coach/training_data.py`
- Create: `ml/coach/tests/test_training_data.py`
- Modify: `ml/coach/src/formpath_coach/dataset.py`

**Interfaces:**
- Produces: `select_smoke_rows(rows, count=32) -> list[...]`, sorted by stable request/scenario identity with no held-out input accepted.
- Produces: `audit_token_lengths(tokenizer, rows, candidate_lengths=(512, 768, 1024)) -> TokenAuditV1`.
- `TokenAuditV1.selected_max_length` is the smallest candidate length that fits every complete serialized row; it is `None` if 1024 still truncates any row.

- [ ] **Step 1: Write failing tests proving selection is deterministic, exactly 32 rows, train-only, and independent of filesystem ordering.**
- [ ] **Step 2: Write failing token-audit tests where 512 fails/768 passes and where all three lengths fail.**
- [ ] **Step 3: Implement selection/audit using the same chat template as the real collator; do not create a second prompt format.**
- [ ] **Step 4: Make `train_sft.py` refuse a Training v0 run when the selected length would truncate a row.**
- [ ] **Step 5: Run focused + dataset tests and Ruff; verify GREEN.**
- [ ] **Step 6: Commit `feat(coach): add training token audit`.**

### Task 4: Add a frozen V1 learned-provider adapter

**Files:**
- Create: `ml/coach/src/formpath_coach/learned_provider_v1.py`
- Create: `ml/coach/tests/test_learned_provider_v1.py`
- Reuse: `ml/coach/src/formpath_coach/schemas.py`
- Reuse: `ml/coach/src/formpath_coach/scenarios/evaluate.py`

**Interfaces:**
- Produces: `LearnedCoachProviderV1` with `async coach(request: CoachRequestV1) -> CoachResponseV1`.
- It loads the resolved Qwen base + local adapter, uses the Training v0 prompt/template, parses one JSON object, validates `CoachResponseV1`, and runs existing request/response grounding validation.
- No repair path is allowed for invalid generations.

- [ ] **Step 1: Write failing tests for valid response, malformed JSON, unknown observation/evidence IDs, provider stamp mismatch, and missing adapter directory.**
- [ ] **Step 2: Implement the adapter without changing legacy `FormPathCoach` behavior.**
- [ ] **Step 3: Run provider, contract, and evaluator tests; verify GREEN and Ruff clean.**
- [ ] **Step 4: Commit `feat(coach): add learned v1 provider`.**

### Task 5: Execute and record the 32-row Training v0 smoke run

**Files:**
- Create after the run: `docs/ai/runs/<run-id>/manifest.json`
- Create after the run: `docs/ai/runs/<run-id>/metrics.json`
- Create after the run: `docs/ai/runs/<run-id>/README.md`
- Do not commit: adapter weights, tokenizer/model cache, raw prompts containing private user data.

**Interfaces:**
- Consumes Tasks 1-4 and the checked-in `ml/coach/data/seed-v1` train/dev artifacts.
- Produces a machine-readable success/failure record; success is not deployment approval.

- [ ] **Step 1: In WSL2, run the preflight and record exact driver/CUDA/torch/transformers/PEFT/bitsandbytes versions plus resolved Qwen revision.**
- [ ] **Step 2: Regenerate/check B2-C artifacts and verify the checked-in manifest/leakage audit before any training.**
- [ ] **Step 3: Run the token audit and choose only 512/768/1024 according to the no-truncation rule.**
- [ ] **Step 4: Run exactly 32 deterministic train rows, max 20 optimizer steps, batch1/accum16, seed42.**
- [ ] **Step 5: Record loss, elapsed time, peak allocated/reserved VRAM, selected length, adapter checksum, and any failure reason.**
- [ ] **Step 6: Evaluate on dev only; preserve malformed outputs as failures.**
- [ ] **Step 7: Commit only the run evidence with `docs(coach): record training v0 smoke run`.**

### Task 6: Run the first 4B supervised baseline and freeze its benchmark result

**Files:**
- Reuse Training v0 code and seed/gold-set artifacts.
- Create: `docs/ai/runs/<baseline-run-id>/manifest.json`
- Create: `docs/ai/runs/<baseline-run-id>/metrics.json`
- Create: `docs/ai/runs/<baseline-run-id>/held-out-results.jsonl` only if it contains no secrets/private user data and stays reasonably small.
- Update: `docs/ai/b3-first-experiment-plan.md` status section after evidence exists.

**Interfaces:**
- Produces the first evidence-backed `Baseline 4B` candidate compatible with `evaluate_provider`.

- [ ] **Step 1: Train only after the smoke run is valid and the frozen benchmark/gold-set gate required by the parent TODO is satisfied.**
- [ ] **Step 2: Use train for optimization and dev for candidate choice; do not inspect held-out outputs while tuning.**
- [ ] **Step 3: Evaluate the selected adapter once on held-out and run every existing schema/grounding/safety/calibration/retest invariant.**
- [ ] **Step 4: Record p50/p95 latency, peak VRAM, generated tokens, GPU wall time, training GPU time, and quality metrics required by the Efficient Frontier spec.**
- [ ] **Step 5: Compare unchanged `deterministic_v1`, untrained base, and trained adapter under the same evaluator.**
- [ ] **Step 6: Run full Coach tests/Ruff and repository CI-relevant tests before committing reports.**
- [ ] **Step 7: Commit `docs(coach): record first 4b supervised baseline`.**

## Execution Boundary

This plan may be implemented independently of PR #19/#20/#21 because its code surface is restricted to `ml/coach/**` plus AI documentation. App integration, Decision Core wiring, and personalization are separate plans/gates. Do not merge or rebase UI branches merely to execute this plan.
