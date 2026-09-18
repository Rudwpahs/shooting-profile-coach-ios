# FormPath V4 Decision Core Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify the first FormPath V4 Decision Core foundation: a strict multi-head probability contract, calibration metrics, deterministic abstention gate, and isolated CI, without changing any protected production behavior.

**Architecture:** Add a new `formpath_coach.decision_core` package alongside the frozen Coach V1 stack. The package owns only typed probability outputs, pure calibration/evaluation helpers, and deterministic abstention logic. Existing MotionPacket, representative reconstruction, Coach contracts, corpus, retrieval, UI, and mobile paths remain untouched.

**Tech Stack:** Python 3.11, Pydantic v2, standard library `math`, pytest, Ruff, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-19-formpath-v4-decision-core-foundation-design.md`

## Global Constraints

- Do not change reconstruction math or representative 4D semantics.
- Do not change MotionPacket fields, codec, thresholds, or native capture behavior.
- Do not change Coach V1 request/response fields or frozen fixtures.
- Do not change corpus bytes, retrieval behavior, Firestore/storage rules, privacy contracts, UI, or provider selection.
- No network calls or model-weight downloads in tests.
- Python tests must follow RED → GREEN → REFACTOR; production code is not added before a focused failing test has been observed.
- Branch stays unmerged until owner review.

---

### Task 1: Add isolated V4 CI harness and RED contract tests

**Files:**
- Create: `.github/workflows/formpath-v4-decision-core-ci.yml`
- Create: `ml/coach/decision_core_tests/__init__.py`
- Create: `ml/coach/decision_core_tests/test_schemas.py`

**Interfaces:**
- Consumes: existing `ml/coach/pyproject.toml`, `ml/coach/b2c-test-constraints.txt`.
- Produces: executable RED tests that define the contract API expected from `formpath_coach.decision_core.schemas`.

- [ ] **Step 1: Add the branch-specific offline CI workflow**

The workflow must install `./ml/coach[dev,service]`, run focused `decision_core_tests`, then existing `tests`, `retrieval_tests`, `evaluation_tests`, and `scenario_tests`, then Ruff. It must set `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, and `HF_HUB_DISABLE_TELEMETRY=1`.

- [ ] **Step 2: Write failing schema tests**

Tests import:

```python
from formpath_coach.decision_core.schemas import (
    DecisionDistributionV1,
    DecisionOptionV1,
    DecisionPacketV1,
)
```

Cover these behaviors:

```python
def test_valid_distribution_derives_top_label_and_probability(): ...
def test_distribution_rejects_missing_unknown_and_duplicate_labels(): ...
def test_distribution_rejects_probability_sum_outside_tolerance(): ...
def test_packet_rejects_duplicate_heads(): ...
```

Use `pydantic.ValidationError` for rejection assertions. A valid `elbow_alignment` distribution must contain exactly `good`, `minor_issue`, `major_issue`, and `unknown`, sum to 1, and expose `top_label == "good"` and the matching `top_probability`.

- [ ] **Step 3: Push RED and verify CI fails for the expected reason**

Expected focused failure: `ModuleNotFoundError: No module named 'formpath_coach.decision_core'` or equivalent missing-symbol import failure. The failure must come from the feature being absent, not from workflow setup.

---

### Task 2: Implement the strict DecisionPacket V1 contract

**Files:**
- Create: `ml/coach/src/formpath_coach/decision_core/__init__.py`
- Create: `ml/coach/src/formpath_coach/decision_core/schemas.py`
- Test: `ml/coach/decision_core_tests/test_schemas.py`

**Interfaces:**
- Produces:
  - `DecisionHeadV1`
  - `DECISION_LABELS_V1`
  - `DecisionOptionV1`
  - `DecisionDistributionV1`
  - `DecisionPacketV1`

- [ ] **Step 1: Implement strict closed models**

Use `ConfigDict(extra="forbid", strict=True)` and stable lowercase codes. `DecisionOptionV1.probability` is a finite strict float in `[0,1]`.

- [ ] **Step 2: Implement distribution validation**

For each head, options must contain exactly the corresponding label set from the spec, once each. Reject duplicates, missing labels, extras, non-finite values, and sums with `abs(sum - 1.0) > 1e-6`.

- [ ] **Step 3: Add derived properties**

`top_label` and `top_probability` are Python properties computed from `options`, not serialized fields.

- [ ] **Step 4: Implement packet validation**

`schema_version` is literal `1`; request ids match `^dec_[a-z0-9]{8,64}$`; revisions are lowercase stable codes of max length 80; distributions are non-empty and unique by head.

- [ ] **Step 5: Run focused tests and full regressions**

Expected: schema tests GREEN; existing frozen suites unchanged.

- [ ] **Step 6: Commit**

Commit message: `feat(decision-core): add typed probability contract`

---

### Task 3: Add calibration and probability-quality utilities with TDD

**Files:**
- Create: `ml/coach/decision_core_tests/test_calibration.py`
- Create: `ml/coach/src/formpath_coach/decision_core/calibration.py`

**Interfaces:**
- Produces:
  - `softmax(logits: Sequence[float]) -> tuple[float, ...]`
  - `temperature_scale_logits(logits: Sequence[float], temperature: float) -> tuple[float, ...]`
  - `negative_log_likelihood(probabilities: Sequence[float], target_index: int) -> float`
  - `brier_score(probabilities: Sequence[float], target_index: int) -> float`
  - `expected_calibration_error(confidences: Sequence[float], correctness: Sequence[bool], bins: int = 15) -> float`

- [ ] **Step 1: Write failing calibration tests**

Required examples:

```python
def test_softmax_is_normalized_and_stable_for_large_logits(): ...
def test_higher_temperature_flattens_distribution(): ...
def test_nll_matches_negative_log_of_target_probability(): ...
def test_brier_matches_hand_computed_multiclass_example(): ...
def test_ece_matches_two_bin_hand_computed_example_and_includes_one(): ...
def test_probability_metrics_reject_invalid_vectors(): ...
```

Use `math.isclose` with explicit tolerances.

- [ ] **Step 2: Push RED and verify expected missing-module/symbol failure**

The focused calibration tests must fail before `calibration.py` exists.

- [ ] **Step 3: Implement minimal pure-Python utilities**

Subtract max logit before exponentiation. Validate all numbers with `math.isfinite`. Validate probability vectors against `[0,1]` and sum tolerance `1e-6`. ECE uses equal-width bins; confidence `1.0` belongs to the last bin.

- [ ] **Step 4: Run focused tests, full regressions, and Ruff**

Expected: all GREEN.

- [ ] **Step 5: Commit**

Commit message: `feat(decision-core): add calibration metrics`

---

### Task 4: Add deterministic abstention gate with TDD

**Files:**
- Create: `ml/coach/decision_core_tests/test_gating.py`
- Create: `ml/coach/src/formpath_coach/decision_core/gating.py`

**Interfaces:**
- Produces:
  - `GateReasonV1`
  - `AbstentionPolicyV1`
  - `GateInputV1`
  - `GateDecisionV1`
  - `evaluate_abstention(policy: AbstentionPolicyV1, inputs: GateInputV1) -> GateDecisionV1`

- [ ] **Step 1: Write failing gate tests**

Required tests:

```python
def test_gate_accepts_clean_input(): ...
def test_gate_returns_all_triggered_reasons_in_stable_order(): ...
def test_gate_threshold_boundaries_are_inclusive(): ...
def test_gate_models_reject_out_of_range_or_non_finite_values(): ...
```

Stable reason order is exactly:

```text
low_prediction_confidence
low_pose_quality
low_capture_quality
ood_detected
incomplete_shot
```

Threshold behavior:

- probability, pose quality, and capture quality equal to minimum are accepted;
- OOD score equal to maximum is accepted;
- incomplete shot rejects only when `require_complete_shot` is true.

- [ ] **Step 2: Push RED and verify expected missing-module/symbol failure**

- [ ] **Step 3: Implement minimal deterministic gate**

Return all triggered reasons; `accepted` is true only when the reason list is empty. Do not mutate prediction probabilities.

- [ ] **Step 4: Run focused tests, full regressions, and Ruff**

Expected: all GREEN.

- [ ] **Step 5: Commit**

Commit message: `feat(decision-core): add abstention gate`

---

### Task 5: Final verification and handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-09-19-formpath-v4-decision-core-foundation.md` only to check completed boxes if desired.

**Interfaces:**
- Consumes: all outputs from Tasks 1-4.
- Produces: verified branch ready for owner review, not merged.

- [ ] **Step 1: Verify the final branch diff**

Confirm only these areas changed:

```text
.github/workflows/formpath-v4-decision-core-ci.yml
docs/superpowers/specs/2026-09-19-formpath-v4-decision-core-foundation-design.md
docs/superpowers/plans/2026-09-19-formpath-v4-decision-core-foundation.md
ml/coach/src/formpath_coach/decision_core/**
ml/coach/decision_core_tests/**
```

- [ ] **Step 2: Verify final CI**

Focused Decision Core tests, all existing Coach/retrieval/evaluation/scenario regressions, and Ruff must be GREEN on the same final commit.

- [ ] **Step 3: Verify protected areas**

Use commit comparison to confirm no MotionPacket, reconstruction, Coach V1 contract, corpus, retrieval, UI, Firestore, or privacy files changed.

- [ ] **Step 4: Report branch, commit SHAs, RED evidence, GREEN evidence, and deferred next slice**

Do not merge or create a non-draft release path without owner instruction.
