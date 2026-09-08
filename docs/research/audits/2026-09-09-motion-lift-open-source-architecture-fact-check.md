# Fact Check — Motion Lift Open-Source Architecture

Verified: 2026-09-09

Source report: `docs/research/2026-09-09-motion-lift-open-source-architecture/README.md`

## Verdict

Overall reliability: **High for capability/compatibility claims; Medium for the final performance recommendation until physical-iPhone measurements exist.**

Load-bearing conclusions externally/project checked: **8 / 10**. Two conclusions remain architectural inference / experiment-dependent rather than established fact.

## Claim ledger

| ID | Claim | Type | Status | Primary evidence | Independent support | Correction / note |
|---|---|---|---|---|---|---|
| C1 | Existing FormPath code already has xyz pose projection and yaw-driven SVG skeleton rendering, so a separate 3D engine is not required to rotate a stick skeleton. | HARD_FACT + JUDGMENT | CONFIRMED / INFERENCE_ONLY judgment | Project `components/pose-motion-viewer.tsx` on UI branch | Project `lib/pose-motion` usage and installed `react-native-svg` | The factual capability is confirmed; “no Three.js required” is an engineering judgment based on scope, not a universal claim. |
| C2 | Expo SDK 54 `VideoThumbnail` is a `SharedRef<'image'>`; `generateThumbnailsAsync()` generates native-image references and iOS exposes requested/actual times. | HARD_FACT | CONFIRMED | https://docs.expo.dev/versions/v54.0.0/sdk/video/ | Expo Shared Object docs | Exact current app behavior still needs a dev build because package patch versions can differ. |
| C3 | SharedRefs are intended to let independent Expo modules exchange decoded native images without repeated disk writes/reads and decodes. | SOFT_FACT | CONFIRMED | https://docs.expo.dev/modules/shared-objects/ | Expo source/docs examples for `expo-image` / image manipulation | Supports the memory-only bridge design directly. |
| C4 | iOS 15 Vision can perform person segmentation on video frames; iOS 17 supports masks for individual people. | HARD_FACT | CONFIRMED | Apple `Applying Matte Effects to People in Images and Video`; Apple `Segmenting and colorizing individuals from a surrounding scene` | `VNGeneratePersonSegmentationRequest` / `VNGeneratePersonInstanceMaskRequest` API docs | Individual-person sample documents up to four individuals and falls back to a combined mask above four in that sample. |
| C5 | Apple instance masks label pixels with instance indices, so a press point can in principle select the corresponding segmented instance. | SOFT_FACT / INFERENCE | CONFIRMED premises; INFERENCE_ONLY integration | `VNInstanceMaskObservation.instanceMask` docs say 0=background and other values=instance indices | VisionKit independently offers `subject(at:)` at a view coordinate | Exact coordinate transform from Reel layout to Vision mask is project implementation work and must be tested. |
| C6 | VisionKit can return a subject at a point and a background-removed subject image; overlapping objects can sometimes be grouped. | HARD_FACT | CONFIRMED | https://developer.apple.com/documentation/visionkit/imageanalysisinteraction/subject and `/subject(at:)` | Same Apple Subject overview documents overlap limitation | This is why segmentation must not be the only identity mechanism. |
| C7 | RNGH 2.x can activate a Pan after a long-press duration, but movement during the waiting period causes failure. | HARD_FACT | CONFIRMED | RNGH 2.x Pan docs | Installed project package is RNGH ~2.28 | The recommendation to compare against manual/composed activation is judgment; no false-cancel rate is known yet. |
| C8 | Adding current React Native Skia for Reanimated-native interaction would require `react-native-worklets >=0.7`, while the current UI branch pins 0.5.1; Skia documents 6 MB iOS / 4 MB Android app-size increase. | HARD_FACT | CONFIRMED | React Native Skia installation docs | Project `package.json` | Skia is technically compatible after dependency work; “do not add initially” is judgment, not incompatibility. |
| C9 | Android ML Kit Subject Segmentation is beta, API 24+, unbundled, dynamically downloaded, and can return no result before model download completes. | HARD_FACT | CONFIRMED | Google ML Kit Subject Segmentation docs | Project Android minSdk is 24 | Therefore skeleton-only fallback is a product recommendation, not an API requirement. |
| C10 | A project-local SharedRef -> Vision/Core Image -> SharedRef module is the best production architecture and will be low-latency enough for the Reel. | JUDGMENT / INFERENCE | PARTIAL / UNVERIFIED performance | C2-C6 establish technical ingredients | Multiple Expo Vision modules in public repos establish feasibility; `expo-segmentation` is MIT | “Best fit” is a reasoned architecture choice. “Low-latency enough” is **not verified** and must not be stated as fact until device measurements. |

## Independent candidate verification

### Candidate: use `react-native-image-analysis` unchanged as the core runtime

**Verdict: VALID technically, NOT PREFERRED architecturally.**

Inspection confirms MIT licensing, New Architecture support and Apple Vision/VisionKit subject lifting. It also confirms file/cache-oriented subject cutout outputs and a much broader OCR/barcode surface. It can accelerate a spike, but the report correctly narrows it from “best production dependency” to “useful reference/prototype.”

### Candidate: use `expo-segmentation` unchanged

**Verdict: VALID technically, PARTIAL fit.**

Inspection confirms MIT licensing, iOS 17 Apple Vision, Android API 24 ML Kit, subject indices and background removal. Its iOS source currently accepts URI input and writes PNGs to temporary storage. This contradicts the desired memory-only hot path but makes it the closest permissively licensed open-source reference found.

### Candidate: custom local Expo SharedRef module

**Verdict: VALID feasibility, UNCERTAIN performance.**

Expo explicitly documents cross-module native image SharedRefs and memory-only transformations. Apple provides the required instance mask APIs. Public Expo modules demonstrate Vision integration. No inspected source proves the exact Hoop Hub `VideoThumbnail -> custom module -> cutout SharedRef` code path on the current app, so a physical-device spike remains mandatory.

### Candidate: Skia as mandatory renderer

**Verdict: NOT VALID as a requirement.**

Skia is capable, but no current requirement demands it. The project already draws the skeleton and Skia would add dependency/version and app-size cost. It remains a valid later option if measurements show the existing/native compositing path cannot meet visual quality.

## Contradictions / negative evidence

1. **Expo thumbnail bug:** Expo issue #43372 reports an SDK-54 iOS crash for scalar `generateThumbnailsAsync(0)`, with `[0]` as the reported workaround. The report therefore should not blindly use the scalar overload even though the type accepts it.
2. **Frame timing:** `VideoThumbnail.actualTime` exists on iOS, so the design must not assume the generated image is always exactly the requested frame.
3. **Vision overlap:** Apple explicitly says VisionKit may fail to separate overlapping objects and may represent two or more objects as one subject. This is directly relevant to basketball defense/occlusion.
4. **RNGH jitter:** `activateAfterLongPress` fails if movement occurs during the hold window. Natural finger jitter may therefore make a naive implementation brittle.
5. **Android model availability:** Google states requests before unbundled subject model download completes produce no results. Subject cutout cannot be a hard requirement for parity.
6. **Licensing:** `SchroederNathan/amber` is PolyForm Noncommercial 1.0.0. It cannot be treated as a permissive production source for a commercial Hoop Hub. `mirathfan/AURA` had no explicit root LICENSE in the inspected repository state, so copying is not justified.

## Corrections applied

- Removed any assumption that a third-party React Native subject-lift package should be the default production foundation.
- Elevated `expo-segmentation` as the closest permissively licensed package, but explicitly marked its file-I/O hot path as a mismatch.
- Kept the custom SharedRef native module recommendation as an **inference pending a device spike**, not an already-proven performance result.
- Rejected any fixed “under 500 ms” promise; no target-device benchmark was found.
- Made segmentation non-blocking and optional in the product interaction because overlap, OS and model-availability failure modes are documented.
- Marked Skia as optional rather than incompatible.

## Residual uncertainty

The evidence cannot answer these without measurement on the actual app and iPhones:

- latency distribution for thumbnail generation and Vision instance segmentation on basketball frames;
- memory delta of keeping the paused thumbnail + cutout + video decoder alive;
- probability of selecting the wrong athlete under occlusion;
- visible mismatch between the paused `VideoView` frame and thumbnail `actualTime`;
- gesture cancellation/scroll-conflict rate inside the real Reel container;
- whether SVG updates remain smooth enough during held horizontal rotation on lower-end supported iPhones.

## Required next evidence

A physical-device spike should record p50/p95 timing, memory, frame-drop observations, subject-selection correctness and gesture-cancel counts across a fixed clip set. Until then, the architecture is recommended for a prototype, not declared performance-complete.
