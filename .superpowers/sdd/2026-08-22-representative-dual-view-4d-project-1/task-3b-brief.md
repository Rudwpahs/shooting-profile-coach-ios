# Task 3B brief — shot admission, isotropic 2D, all-phase circular consensus

## Scope

Modify only:

- `lib/shooting-profile/engineering-thresholds.ts`
- `lib/shooting-profile/phase-normalization.ts`
- `lib/shooting-profile/repeated-shot.ts`
- `lib/shooting-profile/representative-sequence.ts`
- `tests/shooting-profile-phase-normalization.test.ts`
- `tests/shooting-profile-repeated-shot.test.ts`
- `tests/shooting-profile-representative-sequence.test.ts`
- `tests/fixtures/synthetic-dual-view.ts` only as needed to make aspect/source-space explicit
- this task's implementer report

Do not modify native detection/adapter, codec, persistence, UI/hook, dependencies, or GitHub. Task 5B will separately implement native ROI, 80% native admission, and gap accounting.

## Confirmed defects to eliminate

1. A completely stationary 2.97-second front/side pair currently fabricates anchors and returns a complete Basic profile at confidence 0.65.
2. Upright source x and y are normalized by different dimensions; direct `atan2(dx,dy)` compresses a true 45-degree projected bone to about 29.36 degrees on 1920×1080.
3. High-accuracy agreement is checked at only indices 0/25/50/75/100. A selected take may be corrupted between markers and still influence the completed profile.
4. Repeated-shot aggregation takes coordinate-wise landmark medians, not a signed circular bone-direction medoid/MAD.
5. No confidence-aware 2D temporal smoothing occurs before angle extraction.

## Required implementation

### A. Fail-closed phase admission

- Keep the five canonical phase IDs but do not manufacture them from mere frame order.
- Add named, versioned, explicitly unvalidated engineering thresholds under `ENGINEERING_THRESHOLDS_V1` for minimum body scale, total tracked motion, dip excursion, post-dip rise, shooting-wrist rise/extension, release-proxy motion, and critical detected-frame gap.
- Compute phase signals in isotropic upright-source units (see B) using the shooting wrist/elbow, pelvis, knee, and ankle with visibility checks.
- Require credible ready→dip→rise→release-proxy→follow-through ordering and motion amplitudes normalized by a robust body scale. A stationary pose, imperceptible jitter, walking/non-shot motion, missing phase, degenerate body scale, or critical gap returns a stable phase-detection error. It must never yield anchors/profile frames.
- Check timestamp gaps around the candidate dip/rise/release interval using actual returned detection timestamps. Reject a critical interpolation bridge even before Task 5B adds richer attempted-frame evidence.
- Thresholds are engineering admission defaults, not validated biomechanics. Keep error messages/codes free of media identifiers.

### B. Aspect-correct isotropic 2D and pre-angle smoothing

- Validate positive finite `metadata.displayWidth/displayHeight` and convert restored upright-source normalized points to centered source-height units before they enter normalized phase observations. A safe convention is `x_iso = (x - 0.5) * (width / height)`, `y_iso = y - 0.5`; document it in code.
- Use the same isotropic conversion inside phase-motion detection. Do not scale twice.
- `resampleAttemptToPhaseGrid` remains exactly 101 samples in production and still drops raw MediaPipe z.
- Apply a small named, deterministic, confidence/visibility-weighted temporal smoothing window to 2D trajectories after resampling and before any projected angle is extracted. Preserve exact endpoints/phase grid, finite coordinates, visibility, and deterministic behavior. Do not smooth across attempts or views.
- Add landscape, portrait, and square known-geometry tests proving a 45-degree pixel-space projection reconstructs `|horizontal/vertical| = 1` (or the corresponding known 3D direction) independent of aspect.

### C. Whole-trajectory deterministic subset and circular aggregation

- Evaluate every one of the 101 phase samples for every required projected bone. The five phase anchors are markers/timing checks, never the only agreement samples.
- Preserve High accuracy's deterministic complete-view subset rule: exactly three inputs, select an agreeing subset of at least two; a single outlier may be excluded. The same chosen subset is used for every bone and all 101 samples. Basic remains one take and explicitly `single_take` evidence.
- Pair gating uses signed proximal→distal unit directions and rejects any required bone/sample beyond the configured angular limit. A phase-40 corruption must either exclude that take when two clean takes agree, or require recapture when no complete pair agrees.
- Replace coordinate-wise landmark medians as reconstruction evidence with a visibility/confidence-weighted circular medoid of the chosen attempts' signed 2D bone directions at every bone/sample. Tie-break deterministically by stable attempt ID.
- Compute retained angular MAD/spread for every aggregated bone/sample, enforce a named maximum retained-spread gate, and expose the per-bone/sample evidence internally to representative reconstruction and uncertainty. Inclusion of a third take must affect spread; do not leave the selected-pair score as the only evidence.
- `reconstructObservedBone` consumes the aggregated front/side projected direction, length/availability, and spread rather than inventing a coordinate map that cannot satisfy all bone medoids.
- Preserve the user's reconstruction equation: the accepted nullspace direction must remain algebraically equivalent to normalized `(tan(alpha), 1, tan(beta))`, with existing sign/conditioning rejection and separate-shot phase fusion.

### D. Confidence and uncertainty handoff

- Overall consensus dispersion/confidence must derive from all retained bones and all 101 samples, not five markers or only the first selected pair.
- Feed the per-bone retained spread into the existing uncertainty calculation so a more dispersed accepted third take cannot leave uncertainty unchanged. Keep Basic confidence capped at 0.65 and current fail-closed uncertainty ceiling.
- Do not claim a statistically calibrated interval; keep `heuristic_v1` and engineering-default disclosures. Full landmark/phase perturbation is a separate follow-up task.

## Tests first

Add failing regressions before production edits. At minimum:

- stationary front/side, sub-threshold jitter, walking/non-shot motion, missing rise/release, degenerate scale, and a critical release-window gap all fail without profile frames;
- credible moving right- and left-hand attempts still yield ordered anchors;
- known 45-degree landscape/portrait/square projections are aspect invariant;
- raw z remains absent from phase observations;
- a one-take phase-40 corruption in High accuracy is excluded when the other two agree;
- two incompatible phase-40 corruptions leave no complete pair and recapture;
- all-marker agreement cannot mask an inter-marker disagreement;
- chosen subset is deterministic under input permutation and is whole-view/all-phase;
- circular medoid output is an actual retained signed bone direction, not coordinate median, with stable tie-breaking;
- third-take dispersion increases retained spread/uncertainty or lowers confidence;
- existing Basic cap, 101 frames, fixed-length FK, sign/conditioning, raw-z rejection, no partial profile, and V1 boundaries remain.

## Verification constraints

Use static/read-only source checks only. An unrelated auditor materialized `node_modules` without authorization; do not use it or run package managers, Vitest, TypeScript, or ESLint. Do not install, commit, or upload.

