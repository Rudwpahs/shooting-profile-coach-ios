# FormPath V4 System-1 Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reproducible, provenance-aware training pipeline for `System1BaselineV1`, prove gradients with a tiny overfit smoke run, and export model/calibration/metrics artifacts without changing the frozen motion or inference contracts.

**Architecture:** Training examples wrap the existing `RepresentativePoseInputV2` plus sparse per-head targets. A dedicated dataset/split module validates labels and prevents player leakage; a trainer computes masked per-head cross-entropy over the existing 12 heads, saves the best checkpoint, fits one temperature per head on validation logits, and exports versioned JSON artifacts. CI runs only CPU synthetic fixtures and never downloads model weights.

**Tech Stack:** Python 3.11, PyTorch, Pydantic v2, pytest, Ruff, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-19-formpath-v4-system1-training-design.md`

## Global Constraints

- Keep `RepresentativePoseInputV2`, 101 frames, 12 canonical joints, 96 feature channels, `System1BaselineV1`, DecisionPacket V1, and current runtime gate behavior unchanged.
- The 940-unit corpus may define rubrics; it is not video-linked ground truth.
- Split by `player_group_id`, never by clip.
- Unsupported heads may be absent and must be masked out of loss.
- Calibration uses validation data only; test data remains untouched until final evaluation.
- Default CI must not download foundation-model weights.
- Do not merge to `main` in this plan.

---

### Task 1: Training Example Contract and Leakage-Safe Split

**Files:**
- Create: `ml/coach/src/formpath_coach/decision_core/training_data.py`
- Create: `ml/coach/decision_core_tests/test_training_data.py`

**Interfaces:**
- Produces: `TrainingTargetV1`, `TrainingExampleV1`, `load_training_examples(path)`, `split_examples_by_player(examples, train_fraction, validation_fraction, seed)`.
- Consumes: `RepresentativePoseInputV2`, `DECISION_LABELS_V1`.

- [ ] **Step 1: Write failing parsing/split tests**
  - valid sparse target parsing
  - invalid label rejection
  - duplicate `example_id` rejection in JSONL loader
  - deterministic split
  - zero overlap of `player_group_id` across splits
- [ ] **Step 2: Push and verify RED**
  - Run in CI: `python -m pytest ml/coach/decision_core_tests/test_training_data.py -q`
  - Expected: import failure for `formpath_coach.decision_core.training_data`.
- [ ] **Step 3: Implement minimal schema/loader/split**
  - `TrainingTargetV1` fields: `label`, `source`, `review_status` (`machine`, `reviewed`, `teacher_only`).
  - `TrainingExampleV1` fields: `schema_version=1`, `example_id`, `player_group_id`, `pose`, `targets`.
  - Validate every target head and label against `DECISION_LABELS_V1`.
  - Group all examples by player before seeded split assignment.
- [ ] **Step 4: Verify GREEN and commit**
  - Focused tests pass.

### Task 2: Sparse Multi-Head Loss and Batch Collation

**Files:**
- Create: `ml/coach/src/formpath_coach/decision_core/training_loss.py`
- Create: `ml/coach/decision_core_tests/test_training_loss.py`

**Interfaces:**
- Produces: `encode_targets(examples)`, `multi_head_cross_entropy(logits_by_head, targets_by_head)` and `LossReport(total, per_head, counts)`.
- Consumes: head vocabularies from `DECISION_LABELS_V1` and logits from `System1BaselineV1`.

- [ ] **Step 1: Write failing loss tests**
  - missing head contributes no loss
  - present target maps to exact class index
  - per-head sample counts are correct
  - total loss is mean of active head losses
- [ ] **Step 2: Verify RED**
  - Expected missing `training_loss` module.
- [ ] **Step 3: Implement minimal masked CE**
  - No learned task weighting.
  - Reject logits with wrong class width or unknown heads.
- [ ] **Step 4: Verify GREEN and commit**

### Task 3: Trainer and One-Step Gradient Proof

**Files:**
- Create: `ml/coach/src/formpath_coach/decision_core/trainer.py`
- Create: `ml/coach/decision_core_tests/test_trainer.py`

**Interfaces:**
- Produces: `TrainingConfig`, `train_one_epoch(model, examples, optimizer, config)`, `evaluate(model, examples, config)`.
- Consumes: `adapt_representative_pose_v1`, `System1BaselineV1`, Task 2 loss helpers.

- [ ] **Step 1: Write failing trainer tests**
  - one optimizer step changes at least one trainable parameter
  - evaluation does not mutate parameters
  - deterministic seed produces repeatable first-step loss on a synthetic fixture
- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Implement minimal CPU trainer**
  - AdamW default `lr=3e-4`, `weight_decay=1e-4`
  - gradient clip norm `1.0`
  - deterministic seed `42`
  - simple full-batch or small-batch loop suitable for tiny fixtures
- [ ] **Step 4: Verify GREEN and commit**

### Task 4: Tiny Controlled Overfit Smoke Training

**Files:**
- Modify: `ml/coach/src/formpath_coach/decision_core/trainer.py`
- Create: `ml/coach/decision_core_tests/test_training_smoke.py`

**Interfaces:**
- Produces: `fit_tiny(model, train_examples, validation_examples, config, epochs)` returning history and best state.

- [ ] **Step 1: Write failing smoke test**
  - build a tiny deterministic synthetic pose fixture with one or two labeled heads
  - assert final training loss is materially lower than initial loss
  - assert best checkpoint state exists
- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Implement minimal epoch loop/best-checkpoint capture**
  - keep fixture small enough for CPU CI
  - do not claim generalization from this test
- [ ] **Step 4: Verify GREEN and commit**

### Task 5: Per-Head Temperature Fitting and Artifact Export

**Files:**
- Create: `ml/coach/src/formpath_coach/decision_core/training_artifacts.py`
- Create: `ml/coach/decision_core_tests/test_training_artifacts.py`

**Interfaces:**
- Produces: `fit_head_temperature(logits, targets)`, `fit_temperatures(validation_logits, validation_targets)`, `write_training_artifacts(output_dir, model, manifest, metrics, temperatures)`.
- Consumes: validation logits only.

- [ ] **Step 1: Write failing artifact/calibration tests**
  - fitted temperature is positive
  - controlled fixture calibrated NLL improves or stays equal within tolerance
  - JSON calibration artifact round-trips exactly
  - model checkpoint, manifest, metrics, calibration files are written
- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Implement temperature search and export**
  - deterministic 1D search/grid/refinement is sufficient for V1
  - never require SciPy
  - artifact names: `system1_model.pt`, `system1_training_manifest.json`, `system1_metrics.json`, `system1_calibration.json`
- [ ] **Step 4: Verify GREEN and commit**

### Task 6: Full Verification

**Files:**
- Modify only if needed: `.github/workflows/formpath-v4-decision-core-ci.yml`

- [ ] **Step 1: Run fresh focused suite**
  - `python -m pytest ml/coach/decision_core_tests -q`
- [ ] **Step 2: Run existing regressions**
  - `python -m pytest ml/coach/tests ml/coach/retrieval_tests ml/coach/evaluation_tests ml/coach/scenario_tests -q`
- [ ] **Step 3: Run Ruff**
  - `python -m ruff check ml/coach/src ml/coach/tests ml/coach/decision_core_tests ml/coach/retrieval_tests ml/coach/evaluation_tests ml/coach/scenario_tests`
- [ ] **Step 4: Compare branch against main**
  - verify no modifications to reconstruction, UI, Firestore, or frozen Coach API contracts.
- [ ] **Step 5: Record smoke evidence**
  - report initial/final train loss and whether best checkpoint/calibration artifacts were generated in the test fixture.
