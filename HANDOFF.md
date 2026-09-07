# FormPath repository handoff

Last updated: 2026-09-02 UTC

## P1 Two-View 3D/4D Handoff - 2026-09-02 08:20 UTC

### Repository State
- Status: **`code_complete_but_real_video_validation_blocked`** - merged into `main`; only the
  lawful real-video evaluation gate is open (see Open Blockers).
- Feature branch: `feat/p1-two-view-4d-e2e`, created from `origin/main`
  `7223b34aefab2f414a0fac695c3153b7b4833a25` (the work order's historical checkpoint; `main` had
  not advanced), 6 commits: `b1fe0af`, `f7913bb`, `d5613e7`, `1c60eef`, `99126e4`, `3f7e0c3`.
- PR: https://github.com/Rudwpahs/shooting-profile-coach-ios/pull/2 - merged non-forcefully
  (merge commit, no squash/rebase) at 2026-09-02T09:20:48Z.
- Merge SHA on `main`: `e8cde6b337ca3ffcc288b22638596595c41f0190`.
- PR CI: run https://github.com/Rudwpahs/shooting-profile-coach-ios/actions/runs/33612978713 on
  `99126e4` = success and run https://github.com/Rudwpahs/shooting-profile-coach-ios/actions/runs/33613359757
  on `3f7e0c3` = success: typecheck, lint, hermetic unit 32 files passed + 1 skipped / 463 tests
  passed + 1 skipped, Firestore Rules in the emulator **42 passed (42)** with Temurin 21, Expo web
  export `Exported: web-dist`.
- Post-merge `main` CI: run https://github.com/Rudwpahs/shooting-profile-coach-ios/actions/runs/33613602694
  on `e8cde6b` = **success** (unit 463 passed + 1 skipped, emulator 42 passed (42)).
- Working tree status: clean; `web-dist/` is a gitignored export output.

### Completed
- Task IDs completed: P1-00 (synchronize and trace), P1-01 (reconstruction mathematics),
  P1-02 (alignment and uncertainty gates).
- Behavioral changes:
  - P1-01: none. The 11 new cases in `tests/shooting-profile-direction.test.ts` (golden 0/45/45/60/90
    degree pairs, the documented 60-degree vectors, a 2x(11^2+9^2) tangent-ratio equivalence sweep
    with `conditioning = sqrt(cos^2 a + cos^2 b - cos^2 a cos^2 b)`, mirror invariance, typed
    degenerate rejections, a 24x24x2x2x5 singular/wrapped sweep with no NaN/Infinity) all passed on
    first run, so the projection-constraint solver was left untouched.
  - P1-02: `buildRepresentativeSequence` now calls `assessCrossViewPhaseAlignment` on the retained
    front/side takes right after per-view consensus and returns
    `recapture_required { reason: "cross_view_phase_mismatch" | "invalid_phase_anchors" | ... }`
    with the alignment result attached; an accepted alignment's `1 - confidence` penalty is added
    linearly to every observed bone's evidence cone (+3 deg at the limit, inspected by the 25-degree
    admission gate), evidence variance (+0.015), and multiplies confidence by `1 - 0.5 * penalty`
    before the Basic 0.65 cap; retained anchor dispersion now pools takes across both views so
    front/side timing disagreement widens the deterministic phase-perturbation radius; every
    complete result carries `crossViewAlignment` and a non-identifying `evidenceSummary`
    (mean/min conditioning, mean/min availability, retained spread, anchor dispersion, sensitivity,
    max cone). Gains live in `CROSS_VIEW_PHASE_ALIGNMENT_V1.uncertaintyPropagation` and are
    provisional engineering defaults.
  - P1-03: new `lib/shooting-profile/two-view-pipeline.ts` `buildTwoViewRepresentativeProfile`
    is the single application boundary: validated front/side `LandmarkSequenceV2` (1+1 or 3+3,
    hand/take/quality checked -> `attempt_set_invalid`) -> `detectPhaseAnchors`
    (`PhaseDetectionError` -> `phase_detection_failed` + `detail`) -> `resampleAttemptToPhaseGrid`
    -> `buildRepresentativeSequence` (alignment gate, reconstruction, kinematics, uncertainty) ->
    `validateShootingProfileWriteV2` -> `{ status: "complete", saveInput, profile, confidence,
    normalizedAttempts, selectedAttemptsByView, crossViewAlignment, evidenceSummary,
    normalizedAnchorPositionsByAttempt }` or `{ status: "recapture_required", reason, detail?,
    affectedAttemptIds, affectedBones, crossViewAlignment? }` with no partial payload.
    `hooks/use-shooting-profile-capture.ts` now calls it instead of normalizing inline, maps the
    stable code to user copy (new copy for `cross_view_phase_mismatch`, `phase_detection_failed`,
    `uncertainty_exceeds_limit`) and forwards `reasonCode`; the reducer stores it as
    `recaptureReasonCode` next to `errorMessage`. No UI component changed.
  - P1-04 (tool only; real-video run blocked): `lib/shooting-profile/evaluation-report.ts`
    (`buildTwoViewEvaluationReport`, strict zod `twoViewEvaluationReportSchema`,
    `assertReportContainsNoRawEvidence`) and `scripts/evaluate-two-view-landmark-pair.ts`
    (`pnpm eval:two-view`, exit 0 complete / 3 recapture / 2 invalid input / 1 other) run the real
    entry point on local `LandmarkSequenceV2` JSON and emit only derived metrics: per-attempt
    accepted-frame ratio, required-joint visibility median/lower decile, anchor detection outcome
    and normalized anchor positions; cross-view alignment; pipeline outcome with stable reason;
    evidence summary; bone-length drift, joint-angle velocity distribution, discontinuity count,
    cone/trace distributions; runtime. The strict public sequence codec was moved out of
    `lib/pose-detection-v2.ts` (which binds the native Expo module and cannot load under Node)
    into pure `lib/shooting-profile/landmark-sequence-contract.ts`; `pose-detection-v2.ts`
    re-exports it unchanged. The raw fixture now satisfies that public contract exactly
    (integer ms timestamps, 9-element crop transform, duration beyond the last frame), asserted in
    the pipeline test. `docs/evaluation/two-view-evaluation-report.synthetic-example.json` is a
    committed example generated from the synthetic fixture (`sourceClass: "synthetic_fixture"`);
    it documents the shape and is not real-video evidence.
- Commits: `b1fe0af` docs baseline, `f7913bb` direction proof tests, `d5613e7` cross-view gates,
  `1c60eef` two-view pipeline, then `test: add private real-video reconstruction evaluation`
  (this commit).

### Actual Call Path (traced from source, default V2 flags)
1. Video/capture entry: `app/private-capture.tsx` renders `<CaptureSession>` only when
   `FORMPATH_FLAGS.captureV2 && profileV2` (both default-off, exact `"1"` compare in
   `lib/feature-flags.ts`). `hooks/use-shooting-profile-capture.ts` `acquireSlot` -> `expo-image-picker`
   (camera or library, videos only, 20 s max) -> `lib/video-intake.ts` `validateSelectedShootingVideo`.
2. Crop/person/pose extraction: `lib/pose-detection-v2.ts` `detectPoseClipV2` -> native
   `modules/formpath-pose` `analyzeClipAsync` (MediaPipe on device; JS returns
   `native_build_required` without the custom build) -> `parseNativeLandmarkSequenceV2` ->
   `LandmarkSequenceV2` (`upright_source_top_left_v1`, 33 landmarks incl. face indices, native `z`,
   frame `timestampMs`; all of this stays on device). `sequence.quality.passed` gates `SLOT_ACCEPTED`.
3. Attempt construction: the hook's `ready_to_aggregate` effect maps each accepted slot to
   `NormalizedViewAttemptV2 { id: slot.id, phaseAnchors, frames }`.
4. Phase normalization/alignment: `lib/shooting-profile/phase-normalization.ts`
   `detectPhaseAnchors` (ready/deepestDip/rise/releaseProxy/followThrough from shooting-arm
   wrist/elbow + pelvis/knee/ankle motion; throws `PhaseDetectionError`) ->
   `resampleAttemptToPhaseGrid` (101 samples, isotropic source-height units, visibility-weighted
   2D smoothing). Per-view take consensus: `lib/shooting-profile/repeated-shot.ts`
   `aggregateViewAttempts` (1-of-1 Basic, deterministic >=2-of-3 High).
   **DISCONNECTED:** `lib/shooting-profile/cross-view-alignment.ts` `assessCrossViewPhaseAlignment`
   (front-vs-side anchor delta <= 0.10, interval RMSE <= 0.08) has no caller outside its own
   module; neither the hook nor `buildRepresentativeSequence` invokes it. Cross-view anchor
   disagreement therefore reaches neither the recapture decision nor uncertainty today:
   `maximumRetainedAnchorDispersion` in `representative-sequence.ts` only compares takes within
   one view, so Basic (1+1) always has dispersion 0.
5. Direction reconstruction: `lib/shooting-profile/representative-sequence.ts`
   `buildRepresentativeSequence` -> `reconstructObservedBone` per frame x 12 observed bones ->
   `lib/shooting-profile/direction-reconstruction.ts` `reconstructBoneDirection`
   (`alpha = atan2(front.x, -front.y)`, `beta = atan2(side.x, -side.y)`, `sideAxisSign = +1` right /
   `-1` left, projection-constraint cross product; typed rejections; `conditioning` = sine of the
   angle between the two constraint normals, minimum 0.1).
6. Forward kinematics: `lib/shooting-profile/kinematics.ts` `forwardKinematicsFrame` from a
   non-persisted pelvis root with `ENGINEERING_THRESHOLDS_V1.templateBoneLengths`
   (tolerance 1e-5) after unit-direction smoothing (radius 2) -> 12 persisted joints.
7. Uncertainty/release gate: deterministic 9-pattern perturbation scenarios
   (`lib/shooting-profile/uncertainty.ts`) -> sample covariance + floors -> 25-degree cone gate ->
   `representativeConfidence` (dispersion/conditioning/availability weights, sensitivity penalty,
   Basic cap 0.65). Result is `complete` or `recapture_required { reason, affectedBones }`.
   `lib/shooting-profile/release-gate.ts` `assessRepresentativeReleaseGate` is the
   feature-flag-rollout gate (certificate based) and is **not called by any production module**;
   it is only reachable from tests.
8. Codec/persistence boundary: `parseRepresentativePose4D` (`codec.ts`, strict zod, 101 frames,
   canonical anchors, PSD covariance, boundary literal) inside `buildRepresentativeSequence` ->
   reducer `AGGREGATE_COMPLETED { profile, confidence }` -> `matchingShootingProfileSaveInputV2`
   (`capture-session-reducer.ts`, returns `SaveShootingProfileInputV2 | null`) ->
   `runCaptureSaveOperationV2` -> `lib/firebase-shooting-profiles.ts` `saveShootingProfileV2` ->
   `buildShootingProfileWritePlanV2` / `executeShootingProfileWritePlanV2` (Basic 5 docs / High 9,
   observation payload 14,544 B, representative payload 48,480 B, head last). Recapture dispatches
   `AGGREGATE_RECAPTURE_REQUIRED { reason: <Korean user copy> }`; the stable reason code is
   dropped at the hook (`recaptureReason()` collapses everything except
   `no_complete_agreeing_subset` into one generic sentence).

Coordinate convention actually used (documented here because no doc declares it):
source landmarks are upright-source top-left normalized (`x` right, `y` down);
`uprightSourceNormalizedToIsotropic` keeps `y` down; `reconstructObservedBone` negates `y` so
canonical 3D `+y` is image-up; canonical `+x` is front-view image right; canonical `z` is the
shooting-side-view image-right axis multiplied by `sideAxisSign` (`+1` right-handed, `-1`
left-handed). Angles are radians, `atan2(horizontal, vertical)` measured from `+y`, unbounded.
Left/right anatomical identity comes from MediaPipe landmark indices and is never swapped;
handedness only mirrors depth.

### Existing coverage per stage (baseline, hermetic)
- Stage 2 contract: `tests/pose-detection-v2-contract.test.ts` (56), `tests/pose-detection-contract.test.ts` (3)
- Stage 3/4 phase normalization: `tests/shooting-profile-phase-normalization.test.ts` (23);
  consensus: `tests/shooting-profile-repeated-shot.test.ts` (22)
- Stage 4 cross-view gate: **no test file imports `assessCrossViewPhaseAlignment`**
- Stage 5 direction: `tests/shooting-profile-direction.test.ts` (15) - signed quadrants, side-axis
  sign, sign disagreement, non-finite, collapsed, both-horizontal, ill-conditioned; **no golden 3D
  angle cases (0/45/60/90), no tangent-ratio equivalence, no mirror-preserves-angle case**
- Stage 6/7: `tests/shooting-profile-representative-sequence.test.ts` (52) - 101-frame golden,
  determinism, Basic cap, visibility/jitter monotonicity within a view, cone gate, closure,
  left/right depth mirroring, vertical-sign rejection; `tests/representative-4d-integration.test.ts` (3)
- Stage 7 release gate: **no test file imports `assessRepresentativeReleaseGate`**
- Stage 8: `tests/firebase-shooting-profile-contract.test.ts` (66), `tests/shooting-profile-contract.test.ts` (13),
  `tests/shooting-profile-capture-reducer.test.ts` (42), `tests/firestore-shooting-profile-rules.test.ts` (12),
  emulator `tests/emulator/firestore-rules.emulator.test.ts` (42, CI only)
- **No test starts from front/side `LandmarkSequenceV2` and reaches a persistence-ready payload**;
  `tests/fixtures/synthetic-dual-view.ts` produces already-normalized `NormalizedViewAttemptV2`.

### Verification Evidence (baseline on `7223b34`, this machine)
- `corepack pnpm --version` = 9.12.0; `CI=true corepack pnpm install --frozen-lockfile` passed
- Typecheck: `corepack pnpm check` exit 0
- Lint: `corepack pnpm lint` exit 0, 0 warnings
- Full unit tests: `corepack pnpm test:unit` = 28 files passed, 1 skipped; 411 tests passed, 1 skipped
- Firestore Emulator: `corepack pnpm test:rules` exit 1 - `Could not spawn java -version` (no Java
  on this Windows machine). Same blocker class as the P0 handoff; rules evidence must come from
  PR CI, which installs Temurin 21.
- Expo export: `CI=true EXPO_NO_TELEMETRY=1 corepack pnpm exec expo export --platform web --output-dir web-dist`
  exit 0, 18 HTML routes in `web-dist/`
- Real-video evaluation: **not run - `real_video_fixture_unavailable`.** No lawful video exists in
  the repository or on this machine; `git ls-files` has no media; Node 24 has no pose detector
  (detection is a native iOS module); Python 3.13 has OpenCV 5.0.0 but **no `mediapipe`**; the
  `python`/`py` launchers on PATH are a broken `graphify-out` shim. The evaluation tool exists and
  was smoke-tested only on synthetic sequences (see P1-04). Final status therefore stays
  `code_complete_but_real_video_validation_blocked`.
- Environment: Node v24.18.0 (CI uses 22), pnpm 9.12.0 via Corepack, ripgrep 14.1.1, `gh` logged in
  as `Rudwpahs` with `repo`+`workflow` scopes, `core.autocrlf=true` but the working tree is LF
  (`git ls-files --eol`: 434 `i/lf w/lf`).

### Changed Files
- `HANDOFF.md`: this section.
- `tests/shooting-profile-direction.test.ts`: +11 proof cases (15 -> 26), no production change.
- `lib/shooting-profile/cross-view-alignment.ts`: `uncertaintyPropagation` gains,
  `CrossViewPhaseAlignmentAcceptedV1`, `crossViewAlignmentPenalty` (sub-1e-9 rounding snapped to 0).
- `lib/shooting-profile/representative-sequence.ts`: alignment gate after consensus, penalty into
  `uncertaintyFor`/`representativeConfidence`, cross-view anchor pooling in
  `maximumRetainedAnchorDispersion` (with a 1e-9 noise floor so re-timed takes stay byte-identical),
  `crossViewAlignment` + `evidenceSummary` on results, alignment attached to every later recapture.
- `tests/fixtures/synthetic-dual-view.ts`: `sideAnchorShiftNormalized` option (moves only the side
  view's intermediate anchors, frames unchanged).
- `tests/shooting-profile-cross-view-alignment.test.ts`: new, 14 cases - gate unit tests, re-timed
  side view yields an identical profile, mismatch -> stable recapture reason, monotone uncertainty /
  confidence in Basic and High, corrupted anchor, missing landmark, low visibility, mirrored images
  and left-handed depth mirroring without anatomical swap.
- `tests/shooting-profile-representative-sequence.test.ts`: two exact-shape recapture assertions
  now expect the attached accepted `crossViewAlignment`.

Verification after P1-02: focused 3 files 69/69; full `vitest run --exclude tests/firebase-configuration.test.ts`
29 files passed + 1 skipped, 436 tests passed + 1 skipped; `eslint --max-warnings 0` on the six
changed files clean; `tsc --noEmit` clean.

P1-03 files:
- `lib/shooting-profile/two-view-pipeline.ts`: new orchestrator (see Completed).
- `hooks/use-shooting-profile-capture.ts`: aggregation effect routed through the orchestrator;
  imports of `detectPhaseAnchors`/`resampleAttemptToPhaseGrid`/`buildRepresentativeSequence` removed;
  `normalizedAttempts: attempts`, save-envelope and cancellation guard strings unchanged.
- `lib/shooting-profile/capture-session-reducer.ts`: `recaptureReasonCode?` on state,
  `reasonCode?` on `AGGREGATE_RECAPTURE_REQUIRED`.
- `tests/fixtures/synthetic-landmark-sequence.ts` + `tests/shooting-profile-synthetic-landmark-sequence.test.ts`
  (8): deterministic raw `LandmarkSequenceV2` front/side generator (1080x1920, 30 fps, ~2 s, 33
  landmarks, native-evidence metadata) whose anchors the production detector finds; generated by
  Codex under a read-only-elsewhere brief and reviewed here.
- `tests/shooting-profile-two-view-pipeline.test.ts` (11): raw sequences -> complete Basic/High
  profile (101 x 12, finite, canonical phases, boundary literal, bone lengths within 1e-5,
  `saveInput` accepted by `validateShootingProfileWriteV2`, 48,480 B representative and 14,544 B
  observation payloads, no timestamp/URI/face fields); determinism; left-handed; slower-dip side
  clip -> `cross_view_phase_mismatch` (delta > 0.10) with no payload; frozen shooting arm ->
  `phase_detection_failed`; protocol/hand/quality set failures -> `attempt_set_invalid`; whole-clip
  re-timing still fuses; reducer keeps recapture out of the save envelope and stores the code;
  hook source guard.

Verification after P1-03: `corepack pnpm test:unit` = 31 files passed + 1 skipped, 457 tests passed
+ 1 skipped; `corepack pnpm lint` clean; `corepack pnpm check` clean.

P1-04 files:
- `lib/shooting-profile/landmark-sequence-contract.ts`: pure move of `POSE_V2_ENGINEERING_DEFAULTS`,
  both zod sequence schemas, `parseNativeLandmarkSequenceV2`, `parseLandmarkSequenceV2` (no logic change).
- `lib/pose-detection-v2.ts`: imports and re-exports them; keeps request/progress schemas and the detector.
- `lib/shooting-profile/evaluation-report.ts`, `scripts/evaluate-two-view-landmark-pair.ts`,
  `tests/shooting-profile-evaluation-report.test.ts` (5): drafted by Codex under a three-file brief,
  then fixed here (raw-evidence guard used `filename` which matched the report's own
  `privacy.containsFilenames` key; now word-bounded) and reviewed.
- `tests/fixtures/synthetic-landmark-sequence.ts`: contract-valid timestamps/transform/duration.
- `tests/shooting-profile-two-view-pipeline.test.ts` (12): + "starts from sequences that satisfy
  the exact public on-device contract".
- `package.json`: `eval:two-view` script. `docs/two-view-evaluation-tool.md`,
  `docs/evaluation/two-view-evaluation-report.synthetic-example.json`.

Verification after P1-04: `corepack pnpm test:unit` = 32 files passed + 1 skipped, 463 tests passed
+ 1 skipped; `corepack pnpm lint` clean; `corepack pnpm check` clean. CLI smoke on synthetic JSON
written to the OS temp directory (never in the repo): complete -> exit 0
`pipeline=complete reason=none confidence=0.65 alignmentDelta=0`; frozen shooting arm -> exit 3
`reason=phase_detection_failed` detail `missing_release_proxy`, no reconstruction block; a non-sequence
JSON -> exit 2 naming only the argument position.

### Open Blockers
- Blocker: `real_video_fixture_unavailable` for Task 4. Evidence: no consented front/side pair on
  disk or in git; no on-machine pose extractor (no MediaPipe in Python, no native module in Node).
  Required resolution: owner supplies a self-captured, consented front+side pair on the local
  workstation (never committed), exports each clip's on-device `LandmarkSequenceV2` JSON from the
  iOS custom build (or adds a MediaPipe-to-`LandmarkSequenceV2` exporter that reproduces the native
  evidence block), then runs:
  `corepack pnpm eval:two-view --mode basic_1_plus_1 --hand right --front C:\local\front.json --side C:\local\side.json --source consented_self_capture --consent-record <id> --output C:\local\report.json`
  and records the report's derived metrics in this file. Do not commit the JSON inputs.
- Blocker: local Firestore emulator (no Java). Evidence above. Resolution: rely on PR CI.

### Residual Risks
- Risk: the synthetic shoulder line is deliberately near-horizontal (evidence cone ~20-22 deg),
  so it reaches the 25-degree admission gate before other bones when cross-view timing disagrees;
  real shoulder lines are near-horizontal too, which makes the shoulder line the most likely
  `uncertainty_exceeds_limit` bone in practice. Current mitigation: the gate fails closed and names
  the bone; the alignment cone gain is kept small (3 deg) and provisional.
- Risk: a single corrupted phase anchor in any take (even a High take that consensus would
  exclude) fails the whole session with `invalid_attempt` because attempt validation runs before
  take selection. Current mitigation: fail-closed, typed; documented, not changed in P1.
- Risk: `reconstructBoneDirection` never checks supplied front/side projected lengths against the
  solved direction, so a bone lying along `x` with a non-collapsed side projection is accepted.
  Current mitigation: cone/closure gates downstream; recorded as a follow-up, not fixed in P1.

### Task 5 record
- `origin/main` re-fetched before push: still `7223b34`; branch 5 ahead / 0 behind, no rebase needed,
  no force push. Final-HEAD Expo export (`99126e4`): exit 0, 18 HTML routes. Diff scan: no media,
  credential, cache, or unrelated paths (21 files, +3,478 / -422).
- PR #2 opened with the acceptance checklist; its CI run (above) executed the 42-case emulator
  suite for real and passed. `gh pr view 2` = `MERGEABLE` / `CLEAN`.

### Exact Next Action
1. Obtain one lawful (self-captured, consented) front + shooting-side pair and its on-device
   `LandmarkSequenceV2` JSON exports; keep both outside git.
2. Run the command in Open Blockers (`corepack pnpm eval:two-view ...`), then record the report's
   derived metrics (accepted frame ratio, alignment score, conditioning, drift, discontinuities,
   release outcome) in this file through a PR.
3. Expected: `pipeline=complete` (exit 0) or a typed recapture (exit 3) with a stable reason; either
   result is evidence. Only after that may the status move beyond
   `code_complete_but_real_video_validation_blocked`.


## Active work: P0 privacy / rules / auth

- Branch: `fix/p0-privacy-rules-auth`
- Remote `main` SHA at start: `dba64d67cc010a62ad37a02079d547021a27f919`
- Remote `main` unchanged during this work; no force push, no direct push to `main`.
- Verification environment note: the Firestore Emulator jar cannot be downloaded in the
  environment used for local verification (`storage.googleapis.com` is blocked by the
  network policy: `download failed, status 403: request blocked`). The emulator suite is
  therefore implemented and wired into CI, and its evidence must come from a GitHub
  Actions run on this branch. Run #45 on `main` predates the suite and is **not** rules
  evidence.
- Line endings: the Windows clone checked out CRLF while every tracked text blob is LF
  (`git ls-files --eol`: 424 `i/lf`, 38 binary, 2 empty). Local verification normalises the
  working tree to LF so it matches the CI checkout; without this,
  `tests/pose-detection-v2-contract.test.ts` fails on a `\n` regex against `pnpm-lock.yaml`.

### Task 1 — legacy V1 cloud writes disabled (done)

Reproduction of the defect, before the change:

- `app/(tabs)/profile.tsx` renders `PrivatePoseCapture` unconditionally; with all three V2
  flags off (the default, `lib/feature-flags.ts`) the rendered branch is
  `LegacyPrivatePoseCapture`.
- `components/private-pose-capture.tsx` then called `saveFirebasePrivatePose` with
  `poseJson: JSON.stringify(output.candidate)` — every sampled frame with all 33 MediaPipe
  landmarks (face indices 0-10 included), native `z`, and per-frame `timestampMs` — plus
  `sourceLabel` derived from `asset.fileName`.
- `firestore.rules` treated `poseJson` as an opaque bounded string, so the rules layer
  could not constrain the content.
- A second, unguarded cloud write path existed: tRPC `personalProfile.savePose`
  (`server/routers.ts`) accepted the same payload (`poseJson` up to 1,000,000 chars,
  `sourceLabel` up to 160 chars) and inserted it into MySQL through
  `savePersonalPoseAnalysis` (`server/db.ts`). This was found by the independent review of
  the first implementation and closed in the same task.

Red evidence: `tests/legacy-private-pose-write-boundary.test.ts` initially failed with
`promise resolved "'generated-id'" instead of rejecting` — the pre-change code completed the
Firestore write.

Fixed files and functions:

| File | Change |
| --- | --- |
| `shared/const.ts` | New shared `LEGACY_CLOUD_SAVE_DISABLED` code |
| `lib/firebase-private-data.ts` | `LegacyCloudSaveDisabledError`; `saveFirebasePrivatePose` now `Promise<never>` and throws before creating any Firestore reference. `ensureFirebaseProfile`, `listFirebasePrivatePoses`, `removeFirebasePrivatePose` unchanged |
| `lib/legacy-capture-status.ts` | New pure mapper `describeLegacySaveFailure` → `blocked` / `error` outcome and user copy |
| `components/private-pose-capture.tsx` | Save failure routed through the mapper with an early return, so `setState("complete")` is unreachable on failure; `asset.fileName` no longer read; subtitle and tip state the limitation before the user grants photo access |
| `app/(tabs)/profile.tsx` | V1 empty-state copy no longer promises a saved vault record |
| `server/routers.ts` | `personalProfile.savePose` accepts no pose payload and throws `TRPCError FORBIDDEN` with the shared code |
| `server/db.ts` | `savePersonalPoseAnalysis` fails closed before any database work; list/delete untouched |
| `firestore.rules` | `/users/{userId}/poses/{poseId}`: `allow read, delete: if signedInOwner(userId); allow create, update: if false;` |
| `docs/current-admission-matrix.md` | V1 row now states on-device analysis only, cloud persistence disabled |
| `tests/firestore-rules.test.ts`, `tests/firestore-shooting-profile-rules.test.ts` | Assertions rewritten for the new policy and anchored to the `poses` block |

New tests: `tests/legacy-private-pose-write-boundary.test.ts` (7),
`tests/legacy-capture-status.test.ts` (3), `tests/legacy-server-pose-write-boundary.test.ts` (5).
The boundary tests mock the Firestore SDK to resolve successfully and still assert that
`setDoc` / `doc` / `collection` / `serverTimestamp` are never called, so a reintroduced write
fails the suite.

V2 untouched: `git diff --name-only -- lib/shooting-profile lib/firebase-shooting-profiles.ts
lib/firebase-shooting-profile-contract.ts hooks/ app/private-capture.tsx
components/shooting-profile` is empty. 101 phases, 12 joints, Basic 0.65 cap, 1+1 / 3+3,
exact `"1"` flag comparison and `representative_phase_fused_4d_estimate_not_actual_3d` are
unchanged.

Independent review outcome: the tRPC/SQL bypass, a false V1 empty-state message, an
unanchored rules assertion and an overstated docstring were raised and all fixed. Two
accepted limitations are recorded under "Follow-up decisions".

### Task 2 - Firestore Rules executed in the emulator (done)

Before this task no test issued a single real Firestore request. `tests/firestore-rules.test.ts`
and the 886-line `tests/firestore-shooting-profile-rules.test.ts` read `firestore.rules` as text
and assert on the source string; nothing in the repository imported
`@firebase/rules-unit-testing`. Those static suites are kept as-is for now and remain a
follow-up cleanup, exactly as instructed.

Added:

| File | Role |
| --- | --- |
| `tests/emulator/firestore-rules.emulator.test.ts` | 31 cases issuing real authorized/unauthorized requests against the emulator with the repository's own `firestore.rules` loaded |
| `vitest.rules.config.ts` | Emulator-only include, 30s/60s timeouts, single fork and no file parallelism so `clearFirestore()` between tests is not raced |
| `firebase.json` | `emulators.firestore.port 8080`, `singleProjectMode`, UI disabled |

Changed: `vitest.config.ts` excludes `tests/emulator/**` from the hermetic run;
`package.json` gains `test:rules`; `.gitignore` gains `.firebase/` and `firebase-export-*/`;
`.github/workflows/representative-4d-ci.yml` gains a SHA-pinned
`actions/setup-java@b6effb05e454b25005698d916606bdc6ffcbf961 # v5.7.0` step and a
`pnpm test:rules` step after `pnpm test:unit`.

Pinned dependencies: `@firebase/rules-unit-testing@5.0.2` (peer `firebase ^12.0.0`, matching the
installed `firebase 12.18.0` / `@firebase/firestore 4.17.1`) and `firebase-tools@14.27.0`.
`pnpm install --frozen-lockfile` passes with pnpm 9.12.0 and lockfileVersion 9.0.

Project id is the reserved demo id `demo-formpath`, so no external Firebase project or
credential is involved.

Coverage of the required allow/deny matrix, all as real requests:

- owner publishes a full Basic profile and a full High profile in observation -> capture ->
  revision -> head order (allow)
- unauthenticated read and unauthenticated write (deny)
- second signed-in user reading or writing the owner's documents (deny)
- document whose `ownerUid` does not match its path (deny)
- legacy `/poses` create and update (deny); existing legacy document owner read and delete
  (allow); other user reading it (deny)
- payload one byte short, declared payload length disagreeing with the contract, extra field,
  `attemptId` disagreeing with view/takeIndex, wrong attempt path, disagreeing chain ids (deny)
- capture before observations, High capture with only Basic observations, Basic capture with a
  stray High observation, wrong attempt count (deny)
- revision before capture, head before revision, head payload length disagreeing with its
  revision, Basic confidence above the 0.65 cap (deny)
- mutation of a published revision or capture (deny)
- subordinate or head deletion while the head is still `active` (deny); the full resumable
  head -> in_progress, revision, capture, observations, head deletion sequence (allow);
  a transition touching more than `deletionState`/`updatedAt` (deny); another user driving the
  deletion (deny)

Fail-closed evidence, run locally:

- `pnpm exec vitest run --config vitest.rules.config.ts` without `FIRESTORE_EMULATOR_HOST`
  exits 1 with `Test Files 1 failed`, `31 skipped` and the explicit
  "FIRESTORE_EMULATOR_HOST is not set" error. It never reports success without an emulator.
- `pnpm test:rules` exits 1 in the verification environment because the emulator jar download
  is blocked (`download failed, status 403 ... storage.googleapis.com`).

**Open:** the assertions themselves have never been executed against a running emulator here.
Their first real execution is the `Representative 4D CI` run on this branch, and that run is the
only acceptable evidence that the 31 cases pass. Treat a failure there as a defect in this suite
or in the rules, not as an environment problem.

### Task 3 - Firebase profile creation repaired (done)

Reproduced defects:

- `signIn` never called `ensureFirebaseProfile`; the only call site was `signUp`
  (`lib/firebase-auth.tsx`), so an account whose sign-up profile write failed had no
  `/users/{uid}` document and no way to get one. Retrying sign-up fails with
  `email-already-in-use`.
- `signUp` awaited the profile write, so a failed write rejected sign-up *after* the
  account already existed.
- `ensureFirebaseProfile` wrote `email: user.email ?? null` while the rule requires
  `email is string`, so a user without an email produced a guaranteed `permission-denied`
  round trip.
- `createdAt: serverTimestamp()` was written on every merge, so a repeated call would have
  rewritten the original creation time.
- A session restored from storage never passes through `signIn`, so no repair ran and no
  failure was visible. Raised by the independent review and fixed in this task.

Fixed files and functions:

| File | Change |
| --- | --- |
| `lib/firebase-private-data.ts` | `PROFILE_EMAIL_REQUIRED` / `ProfileEmailRequiredError`; `ensureFirebaseProfile` rejects a missing email before creating any document reference, and stamps `createdAt` only on a server-confirmed miss (a cached or failed existence read is treated as "may exist", so an offline reinstall cannot overwrite it) |
| `lib/firebase-profile-sync.ts` | New `syncOwnerProfile` returning `{ status: "synced" }` or `{ status: "failed", code, message }` instead of throwing, so an auth success is never rolled back by a profile write failure |
| `lib/firebase-auth.tsx` | `runProfileSync` runs on sign-in, on sign-up, and on a restored session via `onAuthStateChanged`, keyed by uid; `profileSync` is exposed on the context and cleared on sign-out |
| `app/(tabs)/profile.tsx` | Signed-in screen renders an alert-role banner when `profileSync.status === "failed"`, so an incomplete session cannot look complete |

`firestore.rules` `/users/{userId}` was **not** loosened; the client now satisfies
`email is string` instead. The emulator suite exercises that rule directly.

New tests: `tests/firebase-profile-sync.test.ts` (14) - missing-email refusal with no
Firestore call, `createdAt` stamped only on a server-confirmed miss, no stamp from a cached
miss, write still happens when the existence read fails, merge semantics preserved, sync
outcome mapping, and recovery of a profile a failed sign-up never created (second call
succeeds). Auth wiring is covered by anchor-based structural guards because the repository
has no React Native render-test setup.

Independent review outcome: a misattached JSDoc block, the restored-session gap, the
cache-miss `createdAt` hazard, an unreachable Korean failure message, and brittle
order-dependent structural assertions were raised and fixed. Emulator coverage gaps the same
review found were closed by adding cases for `noCaptureSession`, the High deletion path,
observation/capture shooting-hand agreement, the `validQuality` gate, the High confidence
exemption, and the `/users/{userId}` email rule - the emulator suite is now 42 cases.

### Main sync during the branch (done)

`main` moved while this branch was in progress: `dba64d67cc010a62ad37a02079d547021a27f919`
-> `d521eba0dac5bd6217cd6d6c59fa11487b64ee0f`, adding two commits, both green in CI:

- `6a8ea32` `feat: add cross-view phase alignment gate` - adds `lib/shooting-profile/cross-view-alignment.ts`
- `d521eba` `feat: add representative profile release gate` - adds `lib/shooting-profile/release-gate.ts`

Each adds exactly one new file and neither touches any of the 26 files this branch changes,
so `git rebase origin/main` applied all three commits with no conflict. The rebase was
non-destructive: nothing on `main` was rewritten, no force was used, and the branch is now
3 ahead / 0 behind `origin/main`. Both upstream files are present in the branch tree.

Full verification was re-run from scratch on the rebased tree, with their two new files
included:

| Command | Result |
| --- | --- |
| `CI=true corepack pnpm install --frozen-lockfile` | passed |
| `corepack pnpm check` | passed |
| `corepack pnpm lint` | passed with 0 warnings |
| `corepack pnpm test:unit` | 411 passed, 1 intentional skip; 28 files passed, 1 skipped |
| `corepack pnpm test:rules` | exits 1 in the verification environment - emulator jar download blocked (`403 ... storage.googleapis.com`). 42 cases collected, never skipped-and-passed |
| `CI=true EXPO_NO_TELEMETRY=1 corepack pnpm exec expo export --platform web` | passed, 18 static routes |

Working-tree note: the Windows clone had checked out CRLF while every tracked text blob is
LF, so the tree was normalised to LF before committing. Blob hashes of all 26 changed files
match the verified tree exactly and no file mode changed.

### Next single task

Push `fix/p0-privacy-rules-auth` and open a pull request, then read the
`Representative 4D CI` run for that PR. That run is the first and only execution of the
42-case emulator suite; do not merge until it is green, and do not count run #45 on `main`
as rules evidence.

## Product boundary that must not change

- Front and shooting-side videos are separate, non-simultaneous shots.
- Output boundary remains exactly `representative_phase_fused_4d_estimate_not_actual_3d`.
- Basic is 1+1 with confidence capped at 0.65; High is 3+3 with a deterministic agreeing subset of at least two per view.
- Output is exactly 101 normalized phase samples and 12 cloud-allowlisted joints.
- It is not synchronized, calibrated, triangulated, metric, personal anatomy, or actual 3D.
- All three V2 flags require the exact value `"1"` and remain default-off.
- Compact persistence remains Basic 5 documents / High 9 documents, one mutation per request, head last, exact payload lengths 14,544 and 48,480 bytes, two-read viewer, and resumable revision → capture → observations → head deletion.

## Follow-up decisions (investigated, deliberately not implemented here)

| Item | In use? | Files affected if changed | Recommendation | Why separate |
| --- | --- | --- | --- | --- |
| Manus / tRPC / server / drizzle / oauth | Partly. `lib/trpc.ts` is wired in `app/_layout.tsx` but no `useQuery`/`useMutation` consumer exists; `server/` reaches the app only as a type import; `hooks/use-auth.ts` has zero importers; `app/oauth/callback.tsx` is a registered route with no in-app entry point. Only `@trpc/client`, `@trpc/react-query`, `superjson`, `@tanstack/react-query` reach the bundle. `lib/_core/{nativewind-pressable,manus-runtime,theme}.ts` are required and must stay | `app/_layout.tsx`, `lib/trpc.ts`, `lib/_core/{api,auth}.ts`, `constants/oauth.ts`, `hooks/use-auth.ts`, `server/**`, `drizzle/**`, `shared/types.ts`, `tests/auth.logout.test.ts`, `package.json` scripts | Remove in stages, starting with `hooks/use-auth.ts` (zero risk) | Deleting a whole subsystem in a P0 privacy commit would make the security diff unreviewable |
| V1 left-handed support | Not supported. `lib/personal-pose.ts` `selectShotPhaseIndexes` hardcodes `landmarks[16]`; `lib/pose-motion.ts` `validatePoseMotion` hardcodes right-side joints | `lib/personal-pose.ts`, `lib/pose-motion.ts`, `tests/personal-pose.test.ts` | Decide first whether V1 is retired rather than fixed — now that its cloud path is closed, V2 may be the only path worth left-hand work | It is a product decision, not a privacy fix |
| Web pose CDN | Live. `lib/pose-detection.web.ts` loads `vision_bundle.js` and the `.task` model from `cdn.jsdelivr.net` / `storage.googleapis.com` at runtime. `lib/pose-detection.ts` is dead code on every platform (`.web.ts` and `.native.ts` both win Metro resolution) | `lib/pose-detection.ts` (delete), `lib/pose-detection.web.ts` | Delete the dead `pose-detection.ts`; decide separately whether web detection should exist at all | Touching platform resolution needs its own verification pass |
| Player-derived assets and names | Live. Motion Studio displays "Stephen Curry" and "Paul George" from `PLAYER_MONOCULAR_3D_ANALYSES`, derived from user-supplied clips with no licence record | `lib/anonymous-pose-library.ts`, `lib/motions/*.json`, `app/(tabs)/motion.tsx`, `tests/product-boundary-regression.test.ts` | Obtain a licence record or replace with anonymous assets before any public release | Rights question, not a code defect |
| iOS live-region announcements | `accessibilityLiveRegion` is Android-only; VoiceOver announces nothing on state change (pre-existing, affects the existing error path too) | `components/private-pose-capture.tsx` and other status text | Use `AccessibilityInfo.announceForAccessibility` | Accessibility pass across screens, not a privacy change |
| `validateFirebasePrivatePoseInput` | Now unreachable from production; only its own test exercises it | `lib/firebase-private-pose-contract.ts`, `tests/firebase-private-pose-contract.test.ts` | Keep until a minimised V1 record format is decided, then delete or reuse | Removing it now would delete the contract a future V1 redesign needs |
| React Native render tests | Absent. No `@testing-library/react-native`, no `react-test-renderer`; component behaviour is verified only by source-text guards | `package.json`, `vitest.config.ts`, all UI tests | Adopt before the next UI-heavy change | Explicitly out of scope for this P0 branch |

## External release gates still pending

- Firebase Rules compiler/Emulator and live Firebase integration
- clean macOS prebuild/CocoaPods/Xcode/signing
- approved detector model SHA-256, license/redistribution record, and bundle inspection
- physical iPhone matrix including HEVC/VFR/slow motion, permission denial, cancellation/background/retake, airplane mode, force-quit/reopen, deletion resumption
- synthetic, rig/optical-mocap, negative-clip, repeated-user, subgroup, and held-out scientific validation
- V2 own-history comparison/coaching, licensed/pseudonymous style comparison, and opt-in peer sharing remain future Projects 2-4

## Previous checkpoint (CI repair, retained)

- Verified runtime repair on `main`: `0ec9094130cb48c1f3e921ac27d7c9ad07299ca6` (`fix: make clean CI web export deterministic`).
- Run 42 failed at `Typecheck`: `LandmarkSequenceV2.metadata` gained mandatory native evidence fields while two synthetic fixtures in `tests/shooting-profile-phase-normalization.test.ts` still used the older shape. Repair mirrored the complete native evidence structure in both fixtures; no runtime or representative-4D behaviour changed.
- Run 43 passed typecheck, lint and all hermetic unit tests but failed the Expo web export: clean CI had no pre-existing `react-native-css-interop/.cache/web.css` for Metro to hash. Repair enables NativeWind's virtual-module patch when `CI=true` while keeping the filesystem-write workaround for local iOS development.
- Run 44 (`0ec9094`) and run 45 (`dba64d6`) completed with `success`.
- Integration policy: update `main` only with `force: false`; re-read remote `main` immediately before and after the update.
- Never move a branch to incomplete candidate `8f895ecff260f49c9a510fd3ed91a3d05b819418`.
