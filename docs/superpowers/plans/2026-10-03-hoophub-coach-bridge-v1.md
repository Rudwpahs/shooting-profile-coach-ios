# Hoop Hub Coach Contract Parity + Representative Bridge v1

Date: 2026-10-03  
Base: `main@a9d717fb251996cdab6156c07dcc138d6d644710`  
Branch: `work/hoophub-coach-bridge-v1`  
Parent: `docs/superpowers/todos/2026-10-01-hoophub-compute-efficient-coach.md`

## Why this is the next executable slice

PR #32 completed the current UI / Explore / minimal-analysis integration on `main`.
Physical-iPhone and other hardware-only verification remains explicitly **external / NOT EVIDENCED** and is **not a development prerequisite** for this slice.

The Compute-Efficient Coach architecture is already locked. B2-C scenario/evaluation infrastructure is also already on `main` through merge commit `3462c2f`: the repository contains the 560-scenario train/dev/held-out seed, leakage audit, evaluator, retrieval scaffold, frozen Python Coach V1 models and JSON Schema artifacts.

Two concrete software gaps remain before model training should begin:

1. Python Coach documentation/tests state that the V1 contract mirrors `lib/coach/contract.ts` and `tests/coach-parity.test.ts`, but those TypeScript files do not exist in the current `main` tree.
2. The mobile/app side has `RepresentativePose4DV2` and 101 normalized phases, but no production bridge that converts that structured evidence into a frozen `CoachRequestV1`.

Therefore this slice restores cross-language contract parity and implements a deterministic **RepresentativePose4DV2 -> CoachRequestV1** bridge. It does **not** train a model.

## Non-negotiable boundaries

- Do not require, request, or wait for physical-iPhone validation.
- Do not change reconstruction math, phase normalization, admission thresholds, `RepresentativePose4DV2`, Firestore schemas/rules, or server persistence.
- Do not upload raw video, frames, URI/path, filename, EXIF, face/head landmarks, or raw detector output.
- Do not claim synchronized physical time, calibrated/metric/actual 3D, force, torque, muscle activation, tendon loading, or internal joint loading.
- Keep the output boundary exactly `representative_phase_fused_4d_estimate_not_actual_3d`.
- Do not download/train Qwen, run LoRA/QLoRA, spend GPU compute, implement KD, or compare 4B/8B in this slice.
- Do not alter B2-C split membership, held-out contents, gold labels, or evaluator thresholds to improve benchmark scores.
- Do not redesign UI.
- Do not merge old stacked PRs #20-#27 into this branch.

## Existing source of truth

### Frozen Coach artifacts

- `contracts/coach-observation-v1.schema.json`
- `contracts/coach-request-v1.schema.json`
- `contracts/coach-response-v1.schema.json`
- `contracts/fixtures/coach/manifest.json`
- `ml/coach/src/formpath_coach/schemas.py`
- `ml/coach/tests/test_contract_fixtures.py`

Frozen metrics:

- `release_elbow_angle_deg`
- `release_wrist_height_sb`
- `release_elbow_lateral_offset_sb`
- `release_shoulder_line_yaw_deg`
- `deepest_dip_knee_angle_deg`
- `follow_through_elbow_angle_deg`
- `follow_through_wrist_over_head_sb`
- `capture_quality`

Frozen observation source / boundary:

- source: `representative_phase_fused_4d`
- boundary: `representative_phase_fused_4d_estimate_not_actual_3d`
- phases: `ready`, `deepestDip`, `rise`, `releaseProxy`, `followThrough`

### App-side evidence

- `lib/shooting-profile/types.ts` — `RepresentativePose4DV2`
- `tests/support/representative-profile-fixture.ts`
- `lib/skeleton/analysis-evidence.ts`
- `lib/phase-space/geometry.ts`
- existing synthetic two-view / preview fixtures

The bridge consumes structured representative evidence only. It must never depend on raw media.

---

## Task 1 — Restore TypeScript Coach V1 contract parity

**Create**
- `lib/coach/contract.ts`
- `tests/coach-parity.test.ts`

### Requirements

1. Implement strict TypeScript validation for the frozen V1 request, response and observation contracts.
2. Match the committed JSON Schemas and Python Pydantic behavior, including cross-field rules that JSON Schema alone cannot express.
3. Implement request/response grounding validation:
   - response `request_id` must match;
   - cue observation id must exist in request;
   - hypothesis supporting observation ids must exist;
   - every `evidence_used` id must exist in request evidence.
4. Implement the cue-to-observation resolver needed by the app: a cue may point only to the joints and phase anchor already named by its observation.
5. Run every case in `contracts/fixtures/coach/manifest.json` through the TS implementation and assert the same expected verdict as Python.
6. Do not modify the frozen JSON fixtures merely to make TS pass. If parity exposes a real contradiction, document it and fix the implementation side that is wrong.

### Acceptance

- Shared fixture manifest is green in TS.
- Existing Python contract fixture suite remains green.
- Unknown keys and coercion fail closed.
- No contract widening.

---

## Task 2 — Deterministic RepresentativePose -> observation extraction

**Create, unless a better existing location is clearly preferable**
- `lib/coach/representative-observations.ts`
- `tests/coach-representative-observations.test.ts`

### Required behavior

Input should be production-domain data such as:

- `RepresentativePose4DV2`
- `ShootingHandV2`
- stored/profile confidence or quality information already available to the caller

Output: deterministic frozen `CoachObservationV1[]`.

Derive only the eight frozen metrics.

For pose metrics:

- use the profile's named phase anchors rather than treating source videos as synchronized time;
- select shooting-side joints from `ShootingHandV2`; do not hard-code the right side;
- compute elbow/knee angles from the 3-point representative geometry;
- compute wrist height and elbow lateral offset in the profile's declared shoulder-breadth units;
- compute shoulder-line yaw only from the representative coordinate convention that actually exists in the profile; document the mathematical convention in code/tests. If the semantic meaning cannot be justified from the stored coordinate system, fail closed instead of inventing a camera/physical yaw;
- derive follow-through metrics only at `followThrough`;
- emit `capture_quality` without pretending it is a pose measurement.

Every observation must include exact:

- id
- metric/unit
- value
- measurement confidence
- source
- evidence boundary
- phase anchor where applicable
- contributing joints
- caveats

### Confidence / failure behavior

- Confidence mapping must be deterministic and based only on evidence already present in the representative profile / caller.
- Existing `heuristic_v1` uncertainty must never be described as calibrated probability.
- Missing/non-finite geometry, unavailable joints, invalid phase anchors or insufficient confidence must fail closed: lower confidence, omit an unsupported measurement when the contract allows the higher-level builder to do so, or emit quality failure. Never manufacture a plausible value.
- Same input must produce deep-equal output.

### Tests

Cover at minimum:

- right-handed profile;
- left-handed profile;
- Basic and High mode where meaningful;
- all five anchors;
- deterministic repeated invocation;
- missing/invalid geometry fail-closed behavior;
- no unsupported physical quantities;
- no raw media/path fields;
- output validates against the restored TS Coach contract.

---

## Task 3 — Build a frozen CoachRequestV1 from app evidence

**Create**
- `lib/coach/build-coach-request.ts`
- `tests/coach-request-bridge.test.ts`

### Interface

Build a strict `CoachRequestV1` from:

- representative profile + shooting hand;
- explicit locale;
- optional product-known skill level / training goal / shot action;
- capture quality/confidence inputs that already exist;
- optional stable recent-history codes.

For this slice:

- `evidence` is **empty by default**.
- Do not wire HoopDB retrieval into the mobile app yet.
- Do not call a remote Coach/model yet.
- Do not introduce Firebase persistence.

### Determinism / privacy

- Stable request construction must not use raw-video identifiers.
- No URI, path, filename, EXIF, frame image, raw landmark sequence or user-private prose.
- The resulting object must pass the TS V1 contract and serialize predictably.
- If required structured evidence is unavailable, return an explicit typed unavailable/fail-closed result rather than a partially valid-looking request.

---

## Task 4 — Reconcile Coach docs with actual main state

Update the relevant documentation after implementation.

Required corrections:

- B2-C scenario/evaluation infrastructure is already on `main`; do not describe it as missing.
- TS contract parity and the representative-profile bridge should be marked implemented only after tests pass.
- A trained adapter/model still does not exist.
- Mobile remote-model integration still does not exist.
- Training v0 remains blocked by the benchmark/gold review gate, **not by physical-device QA**.
- Physical-device items remain external/not-evidenced and must not be presented as the next development action.

Do not rewrite historical handoff documents.

---

## Task 5 — Verification

Run the strongest environment-available checks.

### TypeScript/app

```bash
corepack pnpm check
corepack pnpm lint
corepack pnpm vitest run tests/coach-parity.test.ts tests/coach-representative-observations.test.ts tests/coach-request-bridge.test.ts
corepack pnpm test:unit
CI=true EXPO_NO_TELEMETRY=1 corepack pnpm exec expo export --platform web
```

The exact focused test filenames may change if implementation placement differs, but equivalent coverage is required.

### Python Coach

From the existing Coach environment:

```bash
python -m pytest ml/coach/tests ml/coach/retrieval_tests ml/coach/evaluation_tests ml/coach/scenario_tests -q
python -m ruff check ml/coach/src ml/coach/tests ml/coach/retrieval_tests ml/coach/evaluation_tests ml/coach/scenario_tests
python -m formpath_coach.scenario_cli check --output ml/coach/data/seed-v1
python -m formpath_coach.scenario_cli evaluate --output ml/coach/data/seed-v1
```

The existing deterministic baseline may honestly remain `all_invariants_passed=false`. Do not change gold/evaluator behavior simply to make that report green.

### Diff audit

Confirm this slice does not change:

- reconstruction / two-view math;
- Firestore rules/schema;
- raw-video upload/storage behavior;
- Phase Space / Film Space evidence meaning;
- B2-C train/dev/held-out membership.

---

## Completion boundary

This slice is complete when:

1. TypeScript and Python agree on the frozen Coach V1 fixture contract.
2. A real `RepresentativePose4DV2` can be converted deterministically into schema-valid, evidence-bounded Coach observations/request without raw media.
3. Left/right handedness and missing/low-confidence cases are covered.
4. Existing Coach/B2-C and app regressions remain green, except already documented honest benchmark failures.
5. Documentation reflects the actual repository state.
6. A draft PR contains implementation + verification evidence.

Do **not** continue into model training in the same PR. The next decision after this slice is whether the frozen evaluation/gold contract is adequate for Training v0.
