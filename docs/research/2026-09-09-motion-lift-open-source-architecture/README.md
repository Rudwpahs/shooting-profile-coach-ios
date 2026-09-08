# Motion Lift UI / Open-Source Architecture Research

Verified: 2026-09-09

## Research contract

**Question / decision**

What is the smallest, lowest-friction architecture for Hoop Hub's mobile `Motion Lift` interaction: pause a Reel, long-press the athlete, visually lift the athlete like iOS subject lifting, keep holding and drag left/right to rotate the 3D skeleton, and drag upward to save for later — while keeping the video unobstructed and cloud data minimal?

**Why it matters**

This interaction is intended to become the signature bridge between the social Reel and FormPath's 3D motion analysis. A wrong choice here can add native dependencies, disk I/O, model downloads, gesture conflicts, or unnecessary database traffic to the highest-frequency screen in the product.

**Pinned project baseline**

- UI branch: `feat/uiux-skeleton-social-redesign`, PR #5, head observed 2026-09-09.
- Expo SDK 54, React Native 0.81.5, React 19.1.
- Already installed: `expo-video`, `expo-image`, `expo-haptics`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets 0.5.1`, `react-native-svg`.
- Existing `PoseMotionViewer` already performs xyz-joint projection, yaw rotation, animation-frame scheduling and SVG skeleton rendering.
- Product constraints: video-first Reels UX; public viewers can interact with the public 3D motion; raw/capture evidence should not be uploaded merely to render the UI; cloud data should be minimized.

**Required subquestions**

1. How should the paused video frame be made available to native segmentation without unnecessary disk I/O or decoding?
2. Which Apple Vision/VisionKit API is the best fit for one athlete among multiple players?
3. Which open-source packages are reusable, which are useful only as references, and which should be rejected?
4. How should the hold/drag/save gesture coexist with vertical Reel scrolling?
5. Is SVG enough, or is Skia/Three.js justified?
6. What should fail gracefully when segmentation is unavailable or wrong?
7. What is the minimum public playback data that should live in the cloud?

**Acceptance criteria**

- compatible with the current Expo / RN direction;
- no additional 3D engine unless it solves a demonstrated problem;
- segmentation is an enhancement, never a prerequisite for skeleton interaction;
- no cloud upload of masks, thumbnails or gesture state;
- clear iOS and Android fallbacks;
- licensing suitable for a future commercial product;
- ends with a falsifiable physical-iPhone test rather than an unmeasured performance claim.

## Evidence ledger

| ID | Atomic finding | Evidence | Status |
|---|---|---|---|
| E1 | Expo SDK 54 `expo-video` can generate thumbnails from the currently played asset; `VideoThumbnail` is a native `SharedRef<'image'>` and exposes requested/actual time on iOS. | Expo SDK 54 video docs: https://docs.expo.dev/versions/v54.0.0/sdk/video/ | CORROBORATED with Expo Shared Object docs |
| E2 | Expo SharedRefs are specifically designed to pass decoded native image objects between independent modules without file-system write/read cycles. | https://docs.expo.dev/modules/shared-objects/ | SUPPORTED |
| E3 | Apple Vision can segment people frame-by-frame from iOS 15; iOS 17 adds individual-person instance masks. | Apple samples: https://developer.apple.com/documentation/vision/applying-matte-effects-to-people-in-images-and-video and https://developer.apple.com/documentation/vision/segmenting-and-colorizing-individuals-from-a-surrounding-scene | CORROBORATED |
| E4 | `VNInstanceMaskObservation.instanceMask` labels each pixel with an instance index, enabling a touch coordinate to be mapped to the corresponding instance in a custom implementation. | https://developer.apple.com/documentation/vision/vninstancemaskobservation/instancemask | SUPPORTED; coordinate mapping remains implementation work |
| E5 | VisionKit exposes `subject(at:)` and a background-removed subject image, but may group overlapping objects when it cannot separate them. | https://developer.apple.com/documentation/visionkit/imageanalysisinteraction/subject and `/subject(at:)` | SUPPORTED |
| E6 | RNGH 2.x `Pan.activateAfterLongPress()` exists, but movement during the hold period causes the gesture to fail. | https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/pan-gesture/ | SUPPORTED; jitter risk must be device-tested |
| E7 | Current React Native Skia can fit RN 0.81 / React 19, but native Reanimated integration requires `react-native-worklets >=0.7`; the project currently pins 0.5.1. Skia documents ~6 MB iOS and ~4 MB Android app-size impact. | https://shopify.github.io/react-native-skia/docs/getting-started/installation/ + project `package.json` | CORROBORATED |
| E8 | Android ML Kit Subject Segmentation is beta, API 24+, unbundled, and can return no result until its model has downloaded. | https://developers.google.com/ml-kit/vision/subject-segmentation/android | SUPPORTED |
| E9 | Firestore Standard billing is document-oriented and also includes storage/index overhead, so hundreds of per-frame playback documents are a poor public-feed representation when one binary object can serve the viewer. | https://firebase.google.com/docs/firestore/pricing + current V2 private persistence contract | FACT supported; architectural conclusion is INFERENCE |
| E10 | Expo SDK 54 has a reported iOS crash when `generateThumbnailsAsync` receives a scalar timestamp; the issue reports `[time]` as the workaround. | https://github.com/expo/expo/issues/43372 | SUPPORTED user-reported bug; exact project version still requires device confirmation |

## Candidate analysis

### Candidate A — `react-native-image-analysis`

Repository: https://github.com/giaBaoJS/react-native-image-analysis

**Good**

- MIT license.
- New Architecture, RN 0.80+.
- iOS uses Apple Vision/VisionKit instead of importing Google ML Kit into iOS.
- Provides actual subject lifting/cutouts; iOS 17+ uses `VNGenerateForegroundInstanceMaskRequest`.
- Has Android fallback support.

**Mismatch with Motion Lift runtime**

- The subject extraction API is built around still-image sources and file/cache outputs.
- Its broader OCR/barcode/live-text surface is unrelated to this feature.
- Its own docs warn subject lifting can be unavailable and should always be capability-gated.

**Verdict:** good prototype/reference and possibly a fast spike dependency; not the preferred production core for the high-frequency Reel interaction.

### Candidate B — `expo-segmentation`

Repository: https://github.com/westwood-dev/expo-segmentation

**Good**

- MIT license.
- Very narrow scope: foreground segmentation only.
- iOS 17 Apple Vision + Android API 24 ML Kit.
- Exposes multiple detected subjects and selectable subject indices.

**Mismatch**

- Current API consumes image URIs and writes PNG outputs/masks to temporary storage.
- That means an avoidable file encode/write/read/decode path when `expo-video` already provides a native image SharedRef.

**Verdict:** closest reusable open-source package and a strong implementation reference. Prefer adapting the architecture into a project-local memory-only module rather than adding its file-based API unchanged.

### Candidate C — project-local Expo native module using Apple Vision + SharedRef

**Proposed boundary**

`expo-video VideoThumbnail (SharedRef<UIImage>) -> FormPath MotionLift native module -> Vision instance mask -> Core Image cutout/outline -> SharedRef<UIImage> -> expo-image`

No thumbnail PNG and no mask PNG is required in the normal interaction path.

**Why this fits best**

- Expo explicitly designed SharedRefs to move native images between independent modules without repeated disk I/O and decode operations.
- The project already uses native Expo modules in the real-video validation work, so a small local module is consistent with the codebase direction.
- The API can be tiny and product-specific: accept native image + touch point / ROI; return lifted image plus bounds/selected-instance result.
- No third-party model or network request is required for iOS.

**Uncertainty**

- This is an architectural inference from verified Expo/Apple primitives; the exact SharedRef signature with `VideoThumbnail` and Vision must be proven in a development build.
- No trustworthy latency number exists yet for the target iPhones and real basketball footage.

**Verdict:** leading production architecture, pending physical-device benchmark.

### Candidate D — React Native Skia

Skia is technically capable of masks, blur, filters and high-performance drawing. It is not justified yet:

- current project worklets version is below Skia's documented Reanimated-integration requirement;
- Skia adds documented native app-size overhead;
- the existing skeleton renderer already handles the required 3D-to-2D projection and SVG drawing;
- Core Image can produce the Lift outline/glow within the native segmentation pipeline.

**Verdict:** reserve as a later graphics upgrade only if SVG + native cutout compositing fails a measured quality/performance test.

### Candidate E — Three.js / React Three Fiber

The existing FormPath viewer already rotates xyz joints and projects them to 2D. A full scene graph / WebGL stack would duplicate this for a stick skeleton.

**Verdict:** reject for Motion Lift v1.

### Candidate F — VisionCamera / extra MediaPipe/TFLite runtime

These are useful for live camera inference, not for the already-paused Reel playback problem. Public posts already have a derived motion representation, so another pose pipeline at view time duplicates work.

**Verdict:** reject for the Reel interaction layer. Keep capture/inference separate from playback UI.

## Important licensing pass

### `SchroederNathan/amber`

This repository contains an Expo `SubjectLiftModule.swift` implementing a visually relevant die-cut outline with Vision + Core Image. It is an excellent *evidence/reference* that this visual treatment is feasible.

However, its repository license is **PolyForm Noncommercial 1.0.0**, not a permissive commercial license. Do not copy or derive production Hoop Hub code from it for a commercial product. We can independently implement the general idea from Apple/Core Image documentation.

### `mirathfan/AURA`

Its repository contains a practical Expo Vision background-removal module, but no explicit root LICENSE file was found in the inspected repository state. Treat it as feasibility evidence only; do not copy code unless licensing is clarified.

### Permissive candidates

- `react-native-image-analysis`: MIT.
- `expo-segmentation`: MIT.
- React Native Gesture Handler / Reanimated / React Native Skia / Expo libraries: established open-source projects; exact notices must be carried according to each package license if added.

## Recommended architecture

### 1. Default Reel path: zero segmentation work

While the user is just watching/swiping:

- stream/play video;
- render only minimal social metadata;
- do not download a cutout;
- do not run Vision;
- do not fetch motion data unless prefetch policy demonstrates a benefit.

### 2. Tap pauses

Pause is the explicit intent signal. Do not overload a normal swipe or normal playing-state long press.

### 3. Hold starts `Motion Lift`

On long-press intent:

- immediate haptic / subtle visual acknowledgement must not depend on Vision completing;
- request one thumbnail from `expo-video` using an array argument (`[time]`) because of the SDK-54 scalar crash report;
- use iOS `actualTime` from `VideoThumbnail` to align the frozen frame with the nearest motion phase if it differs from requested time;
- pass the `VideoThumbnail` SharedRef directly to a small native module rather than writing a temporary image.

### 4. Select the athlete at the press point

Preferred iOS 17+ path:

- run a foreground or person instance-mask request;
- map the long-press point into image/mask coordinates;
- use the instance label at that mask pixel to select the lifted instance;
- cross-check against the target skeleton's projected 2D bounds/ROI so the product does not rely on segmentation alone to identify the post owner.

Why use the skeleton as a prior? The post already knows which athlete its motion belongs to. The segmentation system should only produce a visual matte, not solve identity again.

### 5. Keep one continuous held gesture

Interaction semantics:

- hold threshold reached -> `GRABBED`;
- horizontal translation while still holding -> skeleton yaw;
- upward translation past an armed threshold -> save affordance + haptic;
- release above threshold -> save; otherwise release/settle.

RNGH `activateAfterLongPress` is the simplest primitive, but because its docs say pre-activation finger movement fails the gesture, the real-device prototype must compare it against a manual/composed activation that tolerates normal finger jitter.

### 6. Lift is visual enhancement, skeleton is the invariant

If segmentation is slow, unsupported, wrong, or occluded:

- skeleton interaction must still activate immediately;
- the cutout may appear later, or not appear at all;
- never show a spinner over the Reel waiting for a mask;
- never block rotation or save because the matte failed.

Apple VisionKit explicitly notes overlapping subjects may be inseparable. Basketball is a high-occlusion domain, so this fallback is not optional.

### 7. Rendering

V1:

- existing 3D projection math;
- existing SVG skeleton renderer, moved onto/into the Reel surface;
- `expo-image` for the lifted native image;
- native Core Image for outline/glow if needed.

Do not add Skia until a measured visual/performance gap requires it.

## Cloud / public playback data boundary

The current V2 private profile contract stores uncertainty/evidence at much higher granularity for provenance and validation. That private evidence format should not become the public playback format.

For public Reels, separate these roles:

- **Firestore:** post/feed metadata, ownership/privacy state, media object reference, compact motion object reference, social counters/state.
- **Object storage/CDN:** video and one compact derived motion packet.
- **Device-only transient state:** thumbnail, mask, cutout, touch path, current yaw, haptics, temporary Lift UI.

A raw playback sequence with 101 phases × 12 joints × xyz is only:

- 14,544 bytes with float32 coordinates;
- 7,272 bytes with int16 coordinates before a small header/compression.

By comparison, the current private representative V2 payload carries 10 int32 values per joint (xyz + uncertainty/cone) and is 48,480 payload bytes across 101 phases before document metadata. Those extra evidence fields are valuable privately but not needed merely to draw a public skeleton.

**Inference:** one versioned binary playback object is better aligned with the public Reel than 101 Firestore sequence documents. Do not change the private V2 evidence contract merely to optimize public playback.

## Contrarian / failure-mode pass

1. **Segmentation latency may be too visible.** No current source gives a trustworthy number for our target iPhones and basketball footage. The design therefore cannot promise a 500 ms Lift.
2. **Paused displayed frame vs thumbnail frame can diverge.** Expo exposes `actualTime` on iOS, which is evidence that requested and generated times can differ. Overlay must freeze/align to the actual thumbnail or accept a visual jump.
3. **Multiple/overlapping players are a hard case.** VisionKit documents that overlapping objects may be grouped. Use skeleton ROI/identity as a prior and fail to skeleton-only rather than selecting the wrong player confidently.
4. **`activateAfterLongPress` can be too brittle.** Its documented pre-activation movement failure may interpret natural finger jitter as cancellation. Device tests should compare a custom/manual gesture state machine.
5. **iOS 16 compatibility.** Foreground/person instance masks used for individual selection are iOS 17-era capabilities. An iOS 15/16 path can use semantic person segmentation or simply skip the cutout and preserve the skeleton interaction.
6. **Android parity is not identical.** ML Kit Subject Segmentation is beta/unbundled and can be unavailable before model download. Android must preserve a skeleton-only Lift path.
7. **Memory pressure matters.** SharedRefs remove redundant file I/O but still keep decoded images in memory. The module should downscale the segmentation input to a measured ceiling and release references promptly.
8. **Open source is not automatically reusable.** Amber is noncommercial and AURA has no inspected explicit license. Repository visibility is not permission to copy.

## Decision

**Leading architecture:**

`expo-video + SharedRef<image> + tiny project-local Expo Vision/Core Image module + RNGH/Reanimated gesture state machine + existing FormPath 3D projector/SVG + expo-haptics`.

No Three.js. No second pose model at playback. No Skia initially. Segmentation never gates 3D interaction.

**Open-source use:** use permissively licensed `expo-segmentation` and `react-native-image-analysis` as implementation/reference comparisons, Expo's Shared Object examples as the bridge pattern, and Apple/Google primary APIs as the actual platform contract. Do not copy noncommercial/unlicensed sample code.

## Confidence

**8/10 architectural confidence.** 8 of 10 load-bearing conclusions have direct primary/project evidence; the two remaining material uncertainties are measured latency/visual quality on physical iPhones and the best gesture activation tolerance in a real vertical Reel feed.

## Falsifiable next test

Build a throwaway physical-iPhone spike only after design approval and measure, on representative basketball clips:

1. `pause -> VideoThumbnail SharedRef ready` latency;
2. `thumbnail -> selected subject cutout SharedRef ready` latency;
3. whether the cutout corresponds to the pressed athlete in single-player, two-player overlap, defender-in-front, and motion-blur frames;
4. frame mismatch between paused view and `actualTime` thumbnail;
5. dropped frames / memory delta while holding and rotating;
6. gesture false-cancel rate for `activateAfterLongPress` versus a manual/composed gesture;
7. skeleton-only fallback quality when segmentation is unavailable.

The architecture should be rejected or revised if the Lift cutout regularly selects the wrong athlete, causes visible video hitching, or requires blocking the skeleton interaction while inference completes.

## Sources

Primary/official:

- Apple Vision person segmentation: https://developer.apple.com/documentation/vision/applying-matte-effects-to-people-in-images-and-video
- Apple Vision individual-person segmentation: https://developer.apple.com/documentation/vision/segmenting-and-colorizing-individuals-from-a-surrounding-scene
- Apple `VNInstanceMaskObservation`: https://developer.apple.com/documentation/vision/vninstancemaskobservation
- Apple VisionKit Subject: https://developer.apple.com/documentation/visionkit/imageanalysisinteraction/subject
- Expo SDK 54 video: https://docs.expo.dev/versions/v54.0.0/sdk/video/
- Expo Shared Objects: https://docs.expo.dev/modules/shared-objects/
- RNGH Pan: https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/pan-gesture/
- React Native Skia installation: https://shopify.github.io/react-native-skia/docs/getting-started/installation/
- Google ML Kit Subject Segmentation: https://developers.google.com/ml-kit/vision/subject-segmentation/android
- Firestore billing: https://firebase.google.com/docs/firestore/pricing

Source repositories inspected:

- https://github.com/giaBaoJS/react-native-image-analysis
- https://github.com/westwood-dev/expo-segmentation
- https://github.com/SchroederNathan/amber
- https://github.com/mirathfan/AURA
- https://github.com/expo/expo/issues/43372
