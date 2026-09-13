# Claude handoff — oblique two-view integration

## Starting point

Work only on branch `work/claude-oblique-integration`.

The last fully green parent is:

`9574b753b2082733caa8e9dcf83e0bf7ace04a51`

That parent has fresh CI evidence:

- `pnpm check` PASS
- `pnpm lint` PASS
- unit tests: 552 passed / 1 skipped
- Firestore emulator rules: 42 passed
- Expo web export: 18 routes, PASS

The current branch HEAD intentionally adds one RED integration contract:

`tests/view-aware-landmark-contract.test.ts`

Do not delete or weaken that test. Make it green by integrating the policy consistently.

## Foundation already implemented — preserve it

### View-aware policy

`lib/shooting-profile/view-quality-policy.ts`

- front remains exactly `[11,12,15,16,23,24,25,26,27,28]`
- right-handed shooting side requires `[12,14,16,23,24,25,26,27,28]`
- left-handed shooting side requires `[11,13,15,23,24,25,26,27,28]`
- opposite/far wrist is not a critical coverage requirement for shooting-side capture
- no quality threshold was lowered

### Camera yaw contract

`lib/shooting-profile/camera-view-metadata.ts`

Shooter-centric convention is frozen:

- front = 0°
- positive yaw moves toward the shooter's anatomical right
- negative yaw moves toward the shooter's anatomical left
- legacy right-handed shooting side = +90°
- legacy left-handed shooting side = -90°
- explicit oblique yaw must stay continuous; do not snap 57.5° to 60°

### Generalized direction solver

`lib/shooting-profile/generalized-direction-reconstruction.ts`

The projection-plane normal is:

`n(theta, phi) = (cos(theta) cos(phi), -sin(phi), sin(theta) cos(phi))`

and direction is the normalized cross product of two view constraints, oriented by vertical sign.

Golden tests already prove:

- exact numerical equivalence to legacy 0°/+90° right-handed reconstruction
- exact numerical equivalence to legacy 0°/-90° left-handed reconstruction
- known-vector reconstruction at 0°/+60°
- known-vector reconstruction at -45°/+45°
- fail-closed on an ill-conditioned 0°/+5° case under the existing conditioning floor
- vertical-sign contradiction rejection

Do not replace this solver with an unrelated implementation unless a test demonstrates a defect.

## Task 1 — make the view-aware policy authoritative everywhere

Use TDD. The current RED test must become GREEN.

Update all emitters and validators that independently compute `quality.reasons`:

1. `lib/shooting-profile/landmark-sequence-contract.ts`
   - remove the one global critical-landmark set from final per-view quality recomputation
   - call `getCriticalLandmarkIndices(sequence.view, sequence.shootingHand)`
   - preserve every existing threshold value
   - preserve front behavior exactly

2. `modules/formpath-pose/ios/FormpathPoseModule.swift`
   - mirror the same semantic policy in native code
   - change quality calculation so it receives view + shooting hand
   - do not change locator ROI critical-landmark policy unless evidence shows that locator policy itself is broken; final semantic quality and locator ROI serve different purposes

3. `scripts/extract-offline-landmark-sequence-v2.py`
   - mirror the same final quality policy
   - use CLI `--view` and `--hand`
   - no subject-specific or filename-specific exceptions

Required behavior:

- right-handed side + low left wrist visibility can pass if all required joints pass
- right-handed side + low right wrist visibility fails
- left-handed behavior mirrors anatomically
- front still requires both wrists

Add native/offline regression coverage where practical.

## Task 2 — add oblique capture semantics without breaking legacy payloads

Extend capture semantics deliberately rather than replacing the old pair abruptly.

Target semantic view set:

- `front`
- `shooting_oblique`
- `shooting_side`

Add camera metadata to the in-memory analysis path so the production pipeline can know actual/declared yaw.

Compatibility requirement:

- existing legacy `front` + `shooting_side` test fixtures and persisted behavior must remain valid
- when old inputs do not carry explicit camera metadata, resolve via `resolveLegacyCameraViewMetadata(view, shootingHand)`
- do not silently rewrite persisted cloud schema unless a migration is genuinely required; prefer an internal compatibility layer first

The first product experiment is **front 0° + shooting-side oblique 45–60°**, not ±45° by default.

## Task 3 — wire generalized reconstruction into the product path

Replace the hard-coded front/side constraint use only at the reconstruction boundary.

For each aggregated view observation:

- keep existing image-space `horizontal = direction.x`
- keep existing image-space `vertical = -direction.y`
- `angleRadians = atan2(horizontal, vertical)`
- obtain each view's signed shooter-centric yaw metadata
- call `reconstructBoneDirectionFromYawViews`

Legacy equivalence is a hard gate:

- right-handed front 0° + side +90° must remain numerically equivalent to the current product output
- left-handed front 0° + side -90° must remain numerically equivalent

Do not delete the legacy solver yet. Keep it as a regression oracle until the generalized product path is proven.

## Task 4 — geometry conditioning

Do not add an arbitrary minimum yaw-separation rule such as 30° simply because it sounds reasonable.

The generalized solver already has a projection-conditioning measure. Use synthetic sweeps to characterize:

- 0/30
- 0/45
- 0/60
- 0/75
- 0/90
- -45/+45

across diverse 3D bone directions.

Report conditioning distributions. Only propose a new capture-angle admission threshold if evidence shows the existing projection-conditioning gate is insufficient.

## Task 5 — actual video experiments

This is the part that requires your local MediaPipe/video environment.

Do not use the original four clips as evidence for 45°/60° because they were not captured at those angles.

For the existing four clips, after Task 1 only:

- re-run the offline extractor and evaluation
- verify whether the side final-quality failure changes exactly as predicted
- report which failures remain at phase detection
- do not claim cross-view reconstruction is validated unless a pair actually reaches it

For a new angle sweep once new footage exists, target:

- front 0°
- shooting-side 30°
- 45°
- 60°
- 75°
- 90°

Measure at least:

- shooting wrist visibility
- shooting elbow visibility
- opposite wrist visibility
- accepted-frame ratio
- phase success/reason
- projection conditioning if reconstruction is reached

## Task 6 — phase detector and release proxy stay evidence-driven

Do not modify phase thresholds merely to make the current videos pass.

Known real-video observations to investigate separately:

- Subject A front: `missing_follow_through`; current 120 ms / 0.15-body-scale defaults are explicitly unvalidated
- Subject B front: `missing_rise`; clip starts mid-shot and the global deepest-dip search selects a late crouch
- Subject A release proxy can be about 1.1 s later than the phase detector's release

First build diagnostics/distributions. Then propose a Phase Detector v2 or Release Proxy v2 with red tests before implementation.

## Privacy / git constraints

Never commit or push:

- MP4s
- raw LandmarkSequenceV2 extracted from private footage
- raw frames
- face landmarks
- absolute user paths
- personal names

Only derived, privacy-safe metrics/reports may be tracked.

## Verification gate

Before claiming completion run fresh:

- `pnpm check`
- `pnpm lint`
- `pnpm test:unit`
- `pnpm test:rules`
- `pnpm exec expo export --platform web --output-dir web-dist`

Also run focused tests for all new contracts and geometry.

Final report must distinguish:

- synthetic proof
- offline-MediaPipe real-video evidence
- native-iPhone evidence

Never upgrade one category into another by inference.

## Stop condition for this handoff

This handoff is successful when:

1. the intentional view-aware contract RED is GREEN across TS/native/offline semantics;
2. generalized yaw-aware reconstruction is wired into the product path with legacy equivalence tests;
3. current real clips are re-run honestly;
4. no thresholds were relaxed to force a complete result;
5. the next required footage specification is stated precisely.
