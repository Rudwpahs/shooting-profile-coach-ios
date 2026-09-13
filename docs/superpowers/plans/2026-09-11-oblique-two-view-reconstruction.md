# Oblique Two-View Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate and implement a safer two-view capture path that starts with front 0° plus shooting-side oblique 45–60°, then generalizes reconstruction to arbitrary known camera yaw while preserving the current front+side flow as a supported special case.

**Architecture:** Split the work into two independent concerns. First, make input quality evaluation view-aware so a valid oblique/side shot is not rejected merely because the far-side wrist is naturally occluded. Second, add explicit camera-view metadata and only after real-angle data exists generalize the two-view solver from implicit 0°/90° assumptions to arbitrary yaw constraints. Phase detection and release-proxy hardening remain separate gates so geometry work is not confounded with temporal detection changes.

**Tech Stack:** TypeScript 5.9, Zod 4, Vitest, Expo/React Native, MediaPipe Pose Landmarker, existing `LandmarkSequenceV2`/two-view reconstruction pipeline.

**Spec:** `docs/REAL_VIDEO_TEST_RESULTS.md` plus this plan. Baseline branch is `work/claude-real-video-e2e` at `e88ef03`.

## Global Constraints

- Do not lower an existing quality/reconstruction threshold merely to make the supplied real videos pass.
- Do not add subject-specific or filename-specific behavior.
- Raw MP4s and raw landmark JSON remain outside git, PRs, issues, and CI logs.
- Existing `front + shooting_side` behavior must remain supported until the generalized solver is proven.
- External MP4 remains local engineering evidence only; release provenance still requires admissible capture.
- A real-video failure with a stable reason code is a valid result.
- Every behavior change must be test-first and have a regression test.

---

### Task 1: Extract view-aware critical-joint policy

**Files:**
- Create: `lib/shooting-profile/view-quality-policy.ts`
- Modify: `lib/shooting-profile/landmark-sequence-contract.ts`
- Test: `tests/shooting-profile-landmark-sequence-contract.test.ts` (or the existing contract test file if named differently)

**Interfaces:**
- Produces: `getCriticalLandmarkIndices(view: CaptureViewV2, shootingHand: ShootingHandV2): readonly number[]`
- Produces: `getRequiredShootingArmLandmarks(shootingHand: ShootingHandV2): readonly number[]`
- Consumes: existing MediaPipe landmark indices and existing 0.85 coverage / 0.5 visibility defaults.

- [ ] Write a failing test proving a right-handed oblique/side sequence is rejected when right wrist visibility falls below the existing threshold.
- [ ] Write a failing test proving the same sequence is not rejected solely because the left (far-side) wrist falls below the existing threshold.
- [ ] Mirror both tests for left-handed shooting.
- [ ] Preserve current front behavior: both wrists remain critical in front view.
- [ ] Implement the minimal policy helper. Shooting arm mapping must be anatomical: left shoulder/elbow/wrist = 11/13/15; right = 12/14/16. Lower-body critical joints remain unchanged unless a separate test proves they should differ.
- [ ] Replace the global fixed critical-landmark list in the contract with the view/hand policy.
- [ ] Run focused contract tests, then `pnpm check`, `pnpm lint`, and `pnpm test:unit`.
- [ ] Commit as one reviewable change.

### Task 2: Add oblique camera-view metadata without changing reconstruction

**Files:**
- Modify: `lib/shooting-profile/types.ts`
- Modify: the corresponding Zod schemas/codecs for `LandmarkSequenceV2`
- Modify: capture-slot construction code that emits `view`
- Test: codec/type regression tests

**Interfaces:**
- Add semantic capture view `shooting_oblique` while retaining `front` and `shooting_side`.
- Add explicit metadata object at the sequence/session boundary:
  - `semanticView: "front" | "shooting_oblique" | "shooting_side"`
  - `yawDegrees: number`
  - `yawSource: "capture_instruction" | "estimated" | "calibrated"`
- Define one project-wide yaw sign convention in code comments and docs.

- [ ] Write failing codec tests for valid front yaw 0 and right-handed shooting-side oblique yaw +45/+60.
- [ ] Write failing tests for non-finite yaw and for metadata/view disagreement where the project requires exact declared capture semantics.
- [ ] Implement schema/type changes only; do not change reconstruction math in this task.
- [ ] Add backward-compatible parsing/migration if persisted V2 inputs without camera metadata still exist in supported code paths.
- [ ] Run focused tests and full typecheck/lint/unit suite.
- [ ] Commit separately from Task 1.

### Task 3: Build an angle-sweep evaluation harness

**Files:**
- Create: `scripts/evaluate-view-angle-sweep.ts`
- Create: `docs/oblique-view-capture-experiment.md`
- Test: `tests/evaluate-view-angle-sweep.test.ts`

**Interfaces:**
- Input: privacy-safe derived per-clip metrics plus declared yaw; no raw frames/landmarks in committed output.
- Output rows by yaw: detection ratio, shooting shoulder/elbow/wrist coverage, opposite wrist coverage, phase-detection status/reason, and processing time.

- [ ] Write parser/output-schema tests first.
- [ ] Implement a CLI that consumes local derived metric JSON and emits a privacy-safe comparison table/JSON.
- [ ] Capture protocol must test 0°, +30°, +45°, +60°, +75°, +90° for right-handed shooters, mirrored for left-handed shooters.
- [ ] Minimum pilot: 2 subjects × 3 shots per angle. Preferred calibration set: 3 subjects × 5 shots per angle.
- [ ] Do not choose a product default angle yet. The output must support comparing visibility and phase success first.
- [ ] Run tests and commit.

### Task 4: Generalize two-view geometry to arbitrary known yaw

**Files:**
- Modify: existing two-view direction/reconstruction module
- Create or extend: geometry-specific synthetic tests

**Interfaces:**
- Consume two observations plus `yawA`, `yawB`.
- Preserve current 0°/90° solution as a special case.
- Add conditioning output so near-collinear views can be rejected with a typed reason instead of silently producing unstable geometry.

- [ ] Before implementation, write synthetic projection/reconstruction tests at yaw separations 30°, 45°, 60°, 75°, and 90° across horizontal, vertical, diagonal, toward-camera, and away-from-camera vectors.
- [ ] Verify the legacy 0°/90° test vectors remain numerically equivalent within the existing tolerance.
- [ ] Implement the generalized projection-plane constraint / intersection solver.
- [ ] Add a typed conditioning metric and rejection result. Do not freeze a production yaw-separation threshold until synthetic plus real angle-sweep data are reviewed.
- [ ] Run geometry tests, full unit suite, typecheck, and lint.
- [ ] Commit separately.

### Task 5: Harden phase detection independently of camera geometry

**Files:**
- Modify: existing phase detector
- Test: `tests/shooting-profile-phase-normalization.test.ts`

**Interfaces:**
- Replace dependence on a globally deepest dip with ordered shot-cycle candidate validation.
- Preserve stable reason codes where possible.

- [ ] Add a regression test matching the real Subject B failure shape: clip begins after the actual dip, later crouch is deeper, and no false valid shot cycle should be produced.
- [ ] Add regression coverage for Subject A-style fast wrist descent after release without changing follow-through defaults yet.
- [ ] Implement candidate ordering: ready → dip → positive rise → release → follow-through.
- [ ] Keep current follow-through numeric defaults until a calibration dataset supports changing them.
- [ ] Run focused and full tests; commit.

### Task 6: Release proxy v2

**Files:**
- Modify: native sampling/release proxy code and offline adapter in parallel
- Test: native-policy unit tests where available plus deterministic TypeScript/Python fixtures

**Interfaces:**
- Produce `timestampMs`, `confidence`, and evidence components for wrist velocity, elbow extension, and wrist height. Keep the old strongest-motion proxy as an explicit fallback initially.

- [ ] Add a regression fixture where post-shot movement has the strongest raw motion peak but the true release occurs ~1 s earlier.
- [ ] Implement multi-signal candidate scoring without ball detection.
- [ ] Verify native and offline adapter choose equivalent candidates within sampling tolerance on shared synthetic fixtures.
- [ ] Do not add ball separation until a ball detector is separately validated.
- [ ] Run relevant tests; commit.

### Task 7: Real-video oblique E2E gate

**Files:**
- Update: `docs/REAL_VIDEO_TEST_RESULTS.md`
- Add only privacy-safe derived reports under the existing evaluation-report policy.

- [ ] Capture front 0° plus shooting-side 45° and 60° for the same shooter with ~1 s pre-dip and ~1 s post-release context.
- [ ] Run both pairs through MP4 → MediaPipe → LandmarkSequenceV2 → phase detection → cross-view alignment → generalized reconstruction.
- [ ] Record exact stable reason codes for every failure; do not tune thresholds during the run.
- [ ] A successful pilot requires at least one real pair to reach cross-view alignment and representative reconstruction.
- [ ] Compare 0+45, 0+60, and where possible 0+90 using phase-alignment confidence, bone-length drift, discontinuities, uncertainty cone, covariance trace, and repeatability.
- [ ] Only after this evidence choose the product default angular range.

### Task 8: Product capture UX and automatic yaw estimation (after E2E evidence)

**Files:**
- Modify capture UI only after Task 7 selects an angular range.
- Automatic yaw estimation is a later subsystem and must not block the known-angle MVP.

- [ ] Guide the user to front 0° and the selected shooting-side oblique range.
- [ ] Show a floor/angle guide rather than requiring exact 90° positioning.
- [ ] Keep declared capture-instruction yaw as the MVP source.
- [ ] Design automatic yaw estimation from shoulder/hip foreshortening, body/face orientation, and foot orientation only after a separate validation set exists.

## Execution ownership

### ChatGPT / review lane
- Own architecture decisions, invariants, acceptance gates, privacy boundary, and review of every Claude commit/PR.
- Own Task 1 policy semantics and Task 2 metadata contract decisions.
- Validate that no threshold is weakened to force success.
- Review angle-sweep results and decide whether 45°, 60°, or another range is promoted.
- Review generalized-solver math against the legacy 0°/90° solution.

### Claude / local execution lane
- Run all MP4/MediaPipe work requiring local dependencies or native-equivalent extraction.
- Implement and repeatedly execute Tasks 3–7 after review gates.
- Produce derived reports, runtime measurements, and exact failing reason codes.
- Run `pnpm check`, `pnpm lint`, `pnpm test:unit`, focused tests, and any native/offline equivalence checks before claiming completion.

## Stop conditions

Stop and report instead of forcing progress if any of these occur:
- The new view-aware gate causes front-view regression.
- Oblique metadata requires a breaking persisted-schema migration that cannot be made backward compatible in one task.
- The generalized solver fails legacy 0°/90° equivalence.
- Real-video failures can only be made to pass by lowering unrelated quality thresholds.
- Raw evidence appears in git status, a PR diff, or CI output.
