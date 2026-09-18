# FormPath V4 Decision Core Foundation Design

## Status

Approved direction from the Jev/System-One research: FormPath V4 will separate fast typed probabilistic decisions from deterministic safety/rubric logic and from natural-language coaching. This document specifies the first implementation slice only.

## Goal

Build a versioned, offline-testable foundation for a future lightweight FormPath Decision Core without changing the existing motion reconstruction, MotionPacket, Coach V1 contract, corpus, retrieval, UI, Firestore, or mobile capture behavior.

The first slice provides:

1. a strict `DecisionPacketV1` contract for typed multi-head probability distributions;
2. pure deterministic calibration/evaluation utilities for probability quality;
3. a deterministic abstention gate that refuses low-confidence or low-quality cases;
4. isolated tests and CI that prove these behaviors before any learned model is introduced.

No model training, model weights, raw-video ingestion, MotionPacket rewrite, Coach V1 rewrite, or mobile integration is part of this slice.

## Architectural boundary

```text
existing capture / reconstruction / MotionPacket
                  |
                  |  future adapter (not in this slice)
                  v
          Decision Core model
                  |
           raw probabilities
                  v
       calibration utilities
                  |
                  v
        DecisionPacketV1
                  |
                  v
          abstention gate
                  |
        +---------+----------+
        |                    |
      accept               reject
        |                    |
 deterministic rubric     recapture /
 and Coach bridge         defer review
   (future slice)         (future UI)
```

`DecisionPacketV1` is deliberately independent from the frozen Coach V1 API. A later adapter may convert accepted decisions into Coach observations. The existing Coach request/response contract remains unchanged.

## Protected areas

This slice MUST NOT change:

- reconstruction math or representative 4D semantics;
- MotionPacket fields, codec, thresholds, or native capture behavior;
- Coach V1 request/response fields or frozen fixtures;
- corpus bytes or evidence-tier mapping;
- retrieval behavior;
- Firestore/storage rules or privacy contracts;
- UI or app navigation;
- any production provider selection.

If implementation appears to require any protected-area change, stop and redesign the boundary instead.

## Decision heads

V1 reserves stable head identifiers in three groups.

### Reliability

- `capture_validity`
- `pose_quality`
- `view_quality`
- `shot_complete`

### Phase/event

- `shot_phase`
- `release_event`

### Form assessment

- `release_timing`
- `elbow_alignment`
- `lower_body_sequence`
- `balance`
- `left_right_asymmetry`
- `follow_through`

The first contract does not claim that all heads are already measurable from current production inputs. Reserving the vocabulary allows datasets, evaluation, and later model work to use stable identifiers without silently changing meaning.

## Allowed label sets

Each head has a closed label vocabulary:

- `capture_validity`: `valid`, `invalid`
- `pose_quality`: `good`, `degraded`, `poor`
- `view_quality`: `good`, `degraded`, `poor`
- `shot_complete`: `complete`, `incomplete`
- `shot_phase`: `ready`, `deepest_dip`, `rise`, `release`, `follow_through`
- `release_event`: `before`, `at`, `after`, `not_observed`
- `release_timing`: `early`, `good`, `late`, `unknown`
- `elbow_alignment`: `good`, `minor_issue`, `major_issue`, `unknown`
- `lower_body_sequence`: `good`, `minor_issue`, `major_issue`, `unknown`
- `balance`: `good`, `minor_issue`, `major_issue`, `unknown`
- `left_right_asymmetry`: `low`, `moderate`, `high`, `unknown`
- `follow_through`: `good`, `minor_issue`, `major_issue`, `unknown`

These are observational/rubric labels. They do not authorize force, torque, muscle-activation, injury, or causal biomechanical claims.

## Contract

Create `ml/coach/src/formpath_coach/decision_core/schemas.py` with strict Pydantic models.

### `DecisionOptionV1`

- `label: str` — must be a stable lowercase code and must belong to the selected head's closed vocabulary.
- `probability: float` — finite and in `[0, 1]`.

### `DecisionDistributionV1`

- `head: DecisionHeadV1`
- `options: list[DecisionOptionV1]`

Validation requirements:

- every required label for the head appears exactly once;
- no unknown label appears;
- probabilities are finite and each lies in `[0, 1]`;
- probabilities sum to `1.0` within absolute tolerance `1e-6`;
- options cannot be empty.

Convenience properties may expose `top_label` and `top_probability`, but those values must be derived rather than serialized as independent sources of truth.

### `DecisionPacketV1`

- `schema_version: Literal[1]`
- `request_id: str` matching `^dec_[a-z0-9]{8,64}$`
- `model_revision: str` stable code, max 80 characters
- `calibration_revision: str` stable code, max 80 characters; use `uncalibrated` until fitted calibration exists
- `distributions: list[DecisionDistributionV1]`

Validation requirements:

- head identifiers in a packet are unique;
- at least one distribution is required;
- unknown fields are rejected and coercion is disabled.

## Calibration utilities

Create `ml/coach/src/formpath_coach/decision_core/calibration.py` as a pure-Python module. It must not load models or require network access.

Provide:

- `temperature_scale_logits(logits: Sequence[float], temperature: float) -> tuple[float, ...]`
- `softmax(logits: Sequence[float]) -> tuple[float, ...]`
- `negative_log_likelihood(probabilities: Sequence[float], target_index: int) -> float`
- `brier_score(probabilities: Sequence[float], target_index: int) -> float`
- `expected_calibration_error(confidences: Sequence[float], correctness: Sequence[bool], bins: int = 15) -> float`

Requirements:

- reject empty inputs, non-finite numbers, invalid target indices, non-positive temperatures, probability vectors outside `[0,1]`, or probability vectors not summing to one within `1e-6`;
- implement numerically stable softmax by subtracting the maximum logit;
- ECE uses equal-width confidence bins over `[0,1]`, includes confidence `1.0` in the final bin, and returns a weighted absolute gap between mean confidence and empirical accuracy;
- these utilities evaluate or transform probabilities only; they do not claim calibration under distribution shift.

## Abstention gate

Create `ml/coach/src/formpath_coach/decision_core/gating.py`.

### `GateReasonV1`

Closed reason codes:

- `low_prediction_confidence`
- `low_pose_quality`
- `low_capture_quality`
- `ood_detected`
- `incomplete_shot`

### `AbstentionPolicyV1`

Strict fields:

- `min_prediction_probability: float = 0.70`
- `min_pose_quality: float = 0.70`
- `min_capture_quality: float = 0.70`
- `max_ood_score: float = 0.30`
- `require_complete_shot: bool = True`

All numeric thresholds are finite and in `[0,1]`.

### `GateInputV1`

- `top_probability: float`
- `pose_quality: float`
- `capture_quality: float`
- `ood_score: float`
- `shot_complete: bool`

All numeric values are finite and in `[0,1]`.

### `GateDecisionV1`

- `accepted: bool`
- `reason_codes: list[GateReasonV1]`

`evaluate_abstention(policy, inputs)` returns every triggered reason in stable order. Acceptance is true if and only if no reason is triggered. The gate does not rewrite probabilities and does not attempt to infer why the model is uncertain.

## Test strategy

Tests live in a new isolated package `ml/coach/decision_core_tests/` so they do not collide with existing test-package `conftest` behavior.

Required coverage:

1. valid probability distributions are accepted;
2. missing, duplicate, or unknown labels are rejected;
3. probability sums outside tolerance are rejected;
4. duplicate heads in a packet are rejected;
5. softmax and temperature scaling are stable and normalized;
6. NLL and Brier score match hand-computable examples;
7. ECE matches a small hand-computable example and handles confidence `1.0` correctly;
8. gate accepts a clean example;
9. gate returns all applicable reject reasons in deterministic order;
10. boundary thresholds are inclusive exactly as specified.

The V4 CI also runs all existing Coach/retrieval/evaluation/scenario regressions to prove the frozen behavior is unchanged.

## CI

Add `.github/workflows/formpath-v4-decision-core-ci.yml` triggered on pushes to `work/formpath-v4-decision-core` and pull requests touching `ml/coach/**` or the workflow itself.

The workflow must:

- use Python 3.11;
- install from the existing `ml/coach/b2c-test-constraints.txt` and `./ml/coach[dev,service]`;
- set Hugging Face/Transformers offline environment variables;
- run `ml/coach/decision_core_tests` first;
- run all existing Coach, retrieval, evaluation, and scenario tests;
- run Ruff over new and existing Python paths;
- never download model weights.

## Success criteria

This slice is complete only when:

- RED is observed in CI from tests that import or exercise missing Decision Core behavior;
- the minimal implementation turns the same focused tests GREEN;
- full existing regressions are GREEN;
- Ruff is GREEN;
- no protected-area file changes are required;
- the branch remains unmerged until owner review.

## Explicitly deferred

The following belong to later V4 slices:

- MotionPacket -> Decision Core feature adapter;
- ST-GCN/TCN/Transformer model architecture;
- training datasets and coach annotations;
- proper-scoring-rule training losses;
- temperature fitting from held-out data;
- learned selector/OOD detector;
- teacher/student distillation;
- conversion from accepted decisions into Coach observations;
- mobile/Core ML deployment;
- real-user outcome feedback or contextual-bandit/RL work.
