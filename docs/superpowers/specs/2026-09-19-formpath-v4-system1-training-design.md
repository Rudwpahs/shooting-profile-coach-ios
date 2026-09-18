# FormPath V4 System-1 Training Design

Date: 2026-09-19
Branch: `work/formpath-v4-decision-core`
Status: Design for Phase 4 training

## 1. Goal

Turn the existing FormPath V4 Decision Core from an untrained inference skeleton into a trainable, calibrated multi-head motion decision model without changing the frozen Representative Pose V2 reconstruction contract.

The training system must learn from 101-frame, 12-joint representative pose sequences and produce the existing 12 Decision Core heads defined by `DECISION_LABELS_V1`.

The first milestone is not production accuracy. The first milestone is a reproducible end-to-end learning loop that demonstrably reduces held-out loss on valid training examples, exports a model checkpoint plus calibration artifact, and preserves the existing inference contract.

## 2. Existing boundaries that remain frozen

The following contracts are inputs to Phase 4 and are not redesigned here:

- Representative Pose V2 input contract
- 101 normalized shot-phase frames
- 12 canonical joints
- Motion feature adapter output width of 96 features per frame
- `System1BaselineV1` shared temporal encoder
- the 12 existing Decision Core heads and vocabularies
- `DecisionPacketV1`
- existing confidence / quality gating behavior

Phase 4 adds training code around these components rather than changing their public behavior.

## 3. Training approaches considered

### A. Real-video supervised only

Train only from human-reviewed real shooting clips.

Advantages:
- highest label integrity
- cleanest scientific interpretation
- no teacher-model error leakage

Disadvantages:
- too few labeled clips to start immediately
- slow bootstrap

### B. Pseudo-label everything from a teacher model

Use geometry rules or a larger model to auto-label every Decision Core head.

Advantages:
- fast dataset growth
- cheap initial experiments

Disadvantages:
- teacher mistakes become training targets
- subjective coaching labels can become falsely authoritative
- confidence may be poorly calibrated

### C. Hybrid bootstrap — recommended

Use deterministic / geometry-derived targets only where the source measurements directly support them, and require explicit reviewed labels for interpretation-heavy coaching heads.

This allows training infrastructure to start immediately without pretending that unsupported pseudo-labels are ground truth.

Phase 4 will use this hybrid approach.

## 4. Label trust classes

Every target must carry provenance.

### 4.1 Objective / machine-derivable targets

These may be generated when the upstream evidence directly supports them:

- `capture_validity`
- `pose_quality`
- `view_quality`
- `shot_complete`
- `shot_phase`
- `release_event` when a validated release detector supplies the event

These labels still carry source and confidence metadata.

### 4.2 Reviewed coaching targets

These must not be silently generated as factual ground truth from text corpus material alone:

- `release_timing`
- `elbow_alignment`
- `lower_body_sequence`
- `balance`
- `left_right_asymmetry`
- `follow_through`

They may come from human annotation, a reviewed rubric, or later teacher-assisted annotation, but teacher-only labels must remain distinguishable from reviewed labels.

The existing 940-unit distilled basketball corpus can define rubrics and evidence rules. It must not be treated as video-linked motion ground truth.

## 5. Dataset contract

Add a versioned training example schema, conceptually:

```json
{
  "schema_version": 1,
  "example_id": "...",
  "player_group_id": "...",
  "pose": { "...": "RepresentativePoseInputV2" },
  "targets": {
    "capture_validity": {
      "label": "valid",
      "source": "geometry_rule_v1",
      "review_status": "machine"
    },
    "elbow_alignment": {
      "label": "minor_issue",
      "source": "human_annotation_v1",
      "review_status": "reviewed"
    }
  }
}
```

Required properties:

- player identity is represented only by an internal grouping key used for leakage-safe splitting
- unsupported heads may be absent
- no missing head is converted to `unknown` unless `unknown` is the semantically correct observed class
- each present target records provenance
- invalid vocabulary labels are rejected during dataset loading
- duplicate example IDs are rejected

## 6. Leakage-safe split

The split must be by `player_group_id`, not by clip.

Default split:

- train: 70%
- validation: 15%
- test: 15%

All clips belonging to one player remain in exactly one split.

For the first tiny smoke dataset, where the number of players is too small for a meaningful 70/15/15 split, the code will support an explicit deterministic split fixture for pipeline verification. Metrics from such a smoke split must be labelled non-production.

## 7. Loss

Each head uses masked categorical cross-entropy.

For head h:

`L_h = CE(logits_h, target_h)` for examples where the target exists.

Missing labels contribute zero loss and are excluded from the denominator for that head.

The initial total loss is the mean of active head losses:

`L_total = mean(L_h for active heads)`

No learned task weighting is introduced in the first trainer. This avoids adding uncertainty-weighting complexity before there is enough real data to validate it.

The trainer must report per-head sample counts so that a head with sparse labels cannot appear healthy merely because the aggregate loss falls.

## 8. Training loop

Add a small dedicated trainer for `System1BaselineV1`:

1. load and validate JSONL examples
2. adapt each pose through `adapt_representative_pose_v1`
3. batch tensors as `[batch, 101, 96]`
4. run `System1BaselineV1`
5. compute masked per-head cross-entropy
6. sum/mean active losses
7. backpropagate
8. gradient clip
9. optimizer step
10. evaluate validation loss and per-head metrics
11. save best checkpoint by validation loss

Initial optimizer defaults:

- AdamW
- learning rate: `3e-4`
- weight decay: `1e-4`
- gradient clip norm: `1.0`
- deterministic seed: `42`

These are baseline defaults, not claimed optimal hyperparameters.

## 9. Metrics

For each head with sufficient labels, report:

- cross-entropy / NLL
- top-1 accuracy
- class support counts
- confusion matrix counts
- Brier score

After temperature fitting, also report:

- ECE
- calibrated NLL
- calibrated Brier score

Aggregate metrics must never hide head-level results.

## 10. Calibration

Temperature scaling occurs after model training using validation predictions only.

Initial implementation:

- one positive scalar temperature per head
- optimize temperature against validation NLL
- save temperatures in a versioned JSON artifact
- never fit calibration on the held-out test split

The test split is used once for final evaluation of the frozen model checkpoint plus frozen calibration artifact.

## 11. Confidence / abstention threshold selection

The current runtime gate remains separate from model training.

Phase 4 will produce validation curves for candidate confidence thresholds. It will not hard-code a new production threshold solely from the tiny bootstrap dataset.

Threshold selection requires enough validation examples to estimate selective risk. Until then, the existing conservative gate remains in place.

## 12. Artifacts

A successful training run writes:

- `system1_model.pt`
- `system1_training_manifest.json`
- `system1_calibration.json`
- `system1_metrics.json`

The manifest records:

- model revision
- Decision Core schema revision
- dataset hash
- split seed / split membership hashes
- hyperparameters
- software version information when available

No raw video is embedded in model artifacts.

## 13. Initial data strategy

The currently available shooting videos are suitable as bootstrap material for validating the extraction / annotation path, but they are not enough to claim generalization.

The initial training sequence is:

1. materialize representative pose features from available clips
2. generate only directly-supported objective labels automatically
3. create reviewed annotations for coaching heads
4. run a tiny smoke train to prove the model can overfit a tiny controlled subset
5. run a leakage-safe held-out experiment once enough distinct players exist
6. fit temperature calibration on validation data
7. evaluate the frozen model on test data

Overfitting a tiny subset is a deliberate debugging test, not a quality claim.

## 14. Test strategy

TDD is required.

Before implementation, failing tests will cover:

- valid training-example parsing
- invalid label rejection
- duplicate example rejection
- missing-head masking
- player-group split leakage prevention
- deterministic split behavior
- multi-head loss math
- one optimizer step changes parameters
- tiny-dataset overfit smoke behavior
- checkpoint manifest creation
- temperature fitting improves or preserves validation NLL on a controlled fixture
- calibration artifact round-trip

Existing Decision Core and Coach regression suites must continue passing.

## 15. CI / resource rules

The default CI must not download foundation-model weights.

The Decision Core trainer uses the small local PyTorch model only. CI may run CPU smoke training on tiny synthetic fixtures.

Full dataset training is a separate explicit command and must not run automatically on every push.

## 16. Success criteria for Phase 4

Phase 4 is complete when all of the following are demonstrated:

1. a validated, provenance-aware motion-training dataset schema exists
2. player-group leakage-safe splitting exists
3. the multi-head trainer handles sparse per-head labels correctly
4. a tiny controlled dataset can be intentionally overfit, proving gradients and labels are wired correctly
5. a held-out evaluation command exists
6. per-head temperature calibration is fitted only from validation data
7. versioned model, manifest, metrics, and calibration artifacts are exportable
8. all new tests, existing Decision Core tests, existing Coach regressions, and Ruff pass

Production basketball accuracy is explicitly outside this milestone until a sufficiently diverse reviewed video dataset exists.
