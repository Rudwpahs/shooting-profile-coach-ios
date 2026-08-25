# Task 5B implementer report

## Result

Implemented the approved V2 two-pass native pose boundary without changing V1:

- the 15-fps upright full-frame pass is locator-only;
- locator evidence must produce one padded, clamped, integral clip ROI or fail with `person_roi_unavailable`;
- a fresh video-mode landmarker processes the complete merged timestamp set from cropped images;
- native frames expose only `modelLandmarks` with `cropped_model_to_upright_source_v1`;
- the strict native parser restores x/y once to upright-source normalized coordinates, preserves raw local z only until phase normalization, and emits the public `upright_source_top_left_v1` sequence;
- an already-restored public sequence is rejected by the native boundary, while the separate strict public codec validates without restoring again;
- locator counters and exact final attempt/decode/detection evidence remain separate;
- final quality uses only cropped-output evidence with engineering defaults of 8 frames, 80% global detection, 85% per-critical-joint coverage at 0.5 visibility, and a 150 ms maximum detected gap spanning the locator release proxy;
- the release-gap proof now uses only decoded-and-detected actual presentation timestamps; requested sample timestamps are validated separately and never substitute for detection evidence;
- locator ROI estimation now uses a median body center/scale, a minimum inlier ratio, bounded center/scale deviations, and a body-scale point-distance gate so one extreme landmark or a second-person switch cannot expand the crop silently;
- absent visibility is fail-closed (`0.0`) in V2 native output handling, locator and final evidence counters are cross-checked against the returned frames, and cancellation no longer advances progress after cancellation;
- the exact request has six keys and requires `profile: "personal_v2"` in Swift, the bridge type, adapter, capture hook, and tests;
- the local module declares an `expo-modules-core ~3.0.29` peer, and the host app/lock importer declare the already-present exact 3.0.29 resolution without installation;
- ROI, quality, cancellation, codec, orientation, edge, lighting, HEVC/VFR/slow-motion, overlay, and privacy checks were added to the physical-iPhone QA checklist.

The parent explicitly expanded the test scope only for the existing reducer `LandmarkSequenceV2` fixture/codec assertion. That fixture now carries the exact public locator/output attempt evidence; reducer behavior and production reducer code were not changed.

## Test-first evidence

Before production edits, the focused contract test was replaced with failing expectations for the new behavior. A dependency-free RED check failed for the expected missing production contracts:

```text
EXPECTED RED: missing production contracts: deriveStablePersonROI, cropping(to: stableROI), cropped_model_to_upright_source_v1, profile == "personal_v2", minimumFinalDetectionRatio, low_critical_joint_coverage
```

After implementation, a dependency-free source-contract check passed:

```text
STATIC GREEN: Task 5B source contracts present
```

The check covered the two landmarker instances, crop call, stable ROI, raw/public literals, exact Swift request keys/profile, 80%/85%/gap constants, ROI error, adapter restoration, hook request, privacy logging absence, local peer declaration, root dependency, and exact existing lock resolution.

An additional remediation check covered required locator attempt metadata, strict requested/decoded/detected timestamp bounds and ordering, actual-time release bracketing, public source-coordinate bounds, fail-closed missing visibility, robust ROI inlier gates, and cancellation progress. Node 24 static TypeScript parsing passed for the changed `.ts` test and implementation files. Swift compilation was unavailable in this environment, so the native result remains gated on the clean Xcode/device run below.

## Files changed

- `modules/formpath-pose/ios/FormpathPoseModule.swift`
- `modules/formpath-pose/src/FormpathPoseModule.ts`
- `modules/formpath-pose/package.json`
- `lib/pose-detection-v2.ts`
- `lib/shooting-profile/types.ts`
- `hooks/use-shooting-profile-capture.ts`
- `tests/pose-detection-v2-contract.test.ts`
- `tests/shooting-profile-capture-reducer.test.ts` (fixture/codec assertion scope only, parent-authorized)
- `docs/iphone-custom-build-qa.md`
- `package.json`
- `pnpm-lock.yaml`
- this report

## Verification boundary

No package manager, install, materialized dependency, quarantined `node_modules` binary, CocoaPods, Xcode, or iPhone was used. Focused Vitest, TypeScript, ESLint, Swift compilation, CocoaPods resolution, and physical-device execution remain **PENDING** in a clean approved environment. No commit or upload was performed.
