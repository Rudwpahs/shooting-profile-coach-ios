# HoopHub Film Space + Phase Space v1 — design specification

Date: 2026-09-24  
Branch: `work/hoophub-film-phase-space-v1`  
Base: `main` @ `df7424a97f2873fef4488ab590569606fe7a8a7d`

## 1. Intent

Add a new way to inspect a user's shot without changing the existing cloud-data boundary.

The product should be able to show:

1. **Film Space** — the user's real local video unfolded as an `XY + time` spatial volume, inspired by Bradley Tangonan's public `video as a 3D object with 2 spatial dimensions + 1 time dimension` experiment.
2. **Phase Space** — the existing Representative V2 skeleton unfolded across the 101 normalized shot phases, so the full motion can be inspected at once rather than only frame-by-frame.
3. Later, after the base is proven, **Person Space** — an on-device foreground/subject-only volume created from local segmentation.

The existing `SequenceViewer` remains available. This work is additive, not a rewrite of capture, reconstruction, persistence, or analysis.

## 2. User-approved constraints

- Keep raw/user video **off the server**.
- Cloud persistence continues to store only the existing approved compact skeleton/profile payloads.
- The raw video may be processed locally on the device to build a temporary visualization/cache.
- Do not replace the current skeleton playback viewer.
- UI minimalization/polish is intentionally deferred until the underlying interaction and rendering model work.
- Do not claim that Representative V2's normalized phase axis is literal source-video time.
- Do not overlay the representative fused skeleton on a source video in a way that implies frame-synchronous measured 3D.
- No changes to reconstruction math, quality thresholds, Firestore rules, rollout certificates, consent/provenance logic, or recommendation-grade evidence admission.

## 3. Existing product boundary to preserve

The current product stores a 101-phase representative sequence with 12 persisted body joints and explicitly labels it `representative_phase_fused_4d_estimate_not_actual_3d`. Front/side captures are separate attempts aligned by normalized shot phase rather than by synchronized camera time.

Therefore:

- **Film Space axis:** source-video time for one local clip.
- **Phase Space axis:** normalized representative shot phase, `0...1`, exactly 101 stored samples.
- They are related conceptually but are **not the same axis**.
- V1 keeps them as distinct viewing modes.

## 4. Scope decomposition

This architectural change is split into milestones so each can be reviewed independently.

### Milestone A — Phase Space

Use only existing Representative V2 profile data. No new native media dependency is required for the mathematical core.

Deliver:

- `PhaseSpaceViewer` component.
- 101-phase spatial trajectory representation.
- joint world-lines for the persisted joints;
- sparse ghost skeletons, not 101 opaque full skeletons;
- one bright current-phase skeleton;
- key phase planes/markers for ready, deepest dip, rise, release proxy, and follow-through;
- rotate/zoom/phase-scrub interaction;
- explicit `SHOT PHASE` language rather than `TIME`.

### Milestone B — Film Space

Create a local-only source-video visualization.

Deliver:

- local media reference abstraction that never enters Firestore/network payloads;
- deterministic frame-sampling plan from one local clip;
- bounded low-resolution frame cache;
- 3D stacked slice renderer;
- rotate/zoom/scrub interaction;
- clear missing-local-video state.

### Milestone C — Person Space (deferred until A+B are proven)

- on-device person segmentation;
- foreground-only frame/alpha cache;
- same slice renderer using transparent subject frames;
- no server upload of frames, masks, thumbnails, local URI, filenames, or EXIF.

### Milestone D — transition polish (deferred)

- Film → Person → Source Pose/Phase Space transitions;
- minimal final control surface and motion polish;
- only after performance and device testing.

## 5. Approaches considered

### Approach 1 — custom Expo GL slice renderer + existing SVG skeleton math — **selected**

Film Space uses `expo-gl` and renders a bounded set of textured planes. Phase Space reuses the current projection/joint math and may initially use SVG/native primitives for trajectories and ghost skeletons.

Why selected:

- keeps the raw-video path local;
- avoids requiring a complete Three.js integration before feasibility is proven;
- avoids full 3D texture/raymarching complexity for v1;
- textured slice stacking matches the visual goal directly;
- isolates GPU/native risk from the existing analysis viewer;
- lets the skeleton viewer remain lightweight and independently testable.

Official Expo SDK 54 documentation confirms `expo-gl` provides a GL render target on iOS/Android/web and exposes a WebGL-like context. Expo's video-thumbnail API can extract a frame image for a requested millisecond timestamp on supported native paths.

### Approach 2 — Three.js volume renderer on Expo GL

Pros: camera/orbit abstractions, mature scene graph, easy future shader experimentation.  
Cons: another major rendering dependency and integration surface; the official Three.js `Data3DTexture` volume example is designed around browser WebGL and raycasting, while Expo GL has its own WebGL compatibility caveats. More moving parts than required to prove this feature.

Decision: do not start here. Revisit only if custom slice rendering becomes a maintenance problem or true volumetric raymarching is required.

### Approach 3 — web-only Three.js prototype first

Pros: fastest visual demo.  
Cons: does not prove the actual iPhone path, media extraction, memory budget, or React Native interaction behavior.

Decision: not the product path. A web demo may exist only as a development visualization aid, never as evidence that iOS works.

## 6. Film Space data flow

```text
local source video URI
        │
        ├─ validate local availability
        │
        ├─ select time window / duration
        │
        ├─ deterministic temporal sampling (bounded slice count)
        │
        ├─ frame extraction at requested ms timestamps
        │
        ├─ resize/compress to bounded display resolution
        │
        └─ local cache manifest
                 │
                 └─ FilmSpaceRenderer
                        ├─ textured planes
                        ├─ camera transform
                        ├─ current-time slice
                        └─ scrub/rotate/zoom
```

No frame image, manifest entry containing the user's local path, or derived video asset is written to Firestore.

## 7. Film Space rendering model

For source frame `I(x, y, t_i)`, create one display plane at depth:

`z_i = spacing * normalizedTime(t_i)`.

The first implementation is a **slice stack**, not a true 3D texture/raymarch volume. This is intentional.

Recommended initial budget:

- target 64–96 temporal slices;
- display frame long edge roughly 192–320 px, adjusted by device/performance gate;
- frame count and resolution are tunable display parameters, not analysis parameters;
- cache creation is cancellable;
- no eager processing for videos that the user never opens in Film Space.

A production threshold must be based on physical-device measurements, not these provisional values.

## 8. Phase Space data flow

```text
RepresentativePose4DV2 (101 stored phases)
        │
        ├─ validate exact 101 frames
        ├─ choose front / oblique / side camera projection
        ├─ project each joint for every phase
        ├─ build trajectory paths
        ├─ choose sparse ghost-skeleton indices
        └─ PhaseSpaceViewer
                ├─ joint trajectories
                ├─ ghost skeletons
                ├─ active skeleton
                ├─ key-phase markers
                └─ phase scrub/rotate/zoom
```

The original profile object is never modified by the viewer.

## 9. Phase Space semantics

The depth axis must be named **SHOT PHASE** or **PHASE**, never presented as synchronized physical time.

Required boundary copy should communicate, in short form:

> Separate shot views were normalized into 101 representative shot phases. This is a phase-space visualization, not synchronized measured 4D.

The current `SequenceViewer` remains the normal frame-by-frame motion view. Phase Space is an alternate visualization of the same representative sequence.

## 10. Visual density rules for v1

UI polish is deferred, but rendering density must already avoid unusable clutter.

Do not render 101 full opaque skeletons.

Initial visual hierarchy:

1. **Current skeleton:** full emphasis.
2. **World-lines:** persisted joint trajectories across all 101 phases.
3. **Ghost skeletons:** approximately 9–13 evenly spaced samples, low emphasis.
4. **Key-phase markers/planes:** only the five existing semantic anchors.
5. Technical labels remain minimal.

The final visual styling is not frozen by this spec; the data/interaction semantics are.

## 11. Viewer integration

The private analysis route is the first product integration point.

Do not replace:

```text
SequenceViewer
```

Introduce a small coordinator/view mode boundary such as:

```text
ShotInspectionViewer
  ├─ Motion / SequenceViewer
  ├─ Phase / PhaseSpaceViewer
  └─ Film / FilmSpaceViewer (only when local source exists)
```

Names may change during implementation, but responsibilities must stay separate.

The initial UI can use a simple temporary mode selector. A later UI pass may redesign/minimize it without changing the viewer contracts.

## 12. Local video identity and lifecycle

A cloud profile must not depend on a permanent raw-video upload.

A local association may exist only on the device, for example:

```text
profileId -> local media reference + non-sensitive local cache key
```

Rules:

- never write local filesystem/photo-library URI to Firestore;
- never write source filename or EXIF to Firestore;
- local association may disappear after reinstall, photo deletion, cache purge, or explicit user deletion;
- Phase Space still works when Film Space is unavailable;
- Film Space displays an honest local-video-unavailable state rather than trying to reconstruct a fake source video.

If current capture code already exposes a durable local media identifier safely, reuse it. Do not invent cloud persistence merely to make Film Space survive reinstall.

## 13. Source-video vs representative skeleton alignment

V1 explicitly forbids pretending that the representative profile is frame-synchronous with one source clip.

Therefore:

- Film Space shows source-video time.
- Phase Space shows normalized representative phase.
- No representative skeleton is rendered directly on source video with an `actual frame` implication.

A future `Source Pose` mode may overlay the **pose derived from that exact source clip**, if the local processing pipeline preserves a validated source-frame/timestamp association. That is separate from Representative V2 and requires its own labeling.

## 14. Dependencies

Likely new dependency for Film Space:

- `expo-gl` compatible with the repository's Expo SDK 54 version.

Possible frame extraction dependency:

- `expo-video-thumbnails`, if physical-device testing confirms acceptable extraction speed/accuracy and package support for the required local-video sources.

Do not add Three.js in v1 unless implementation evidence shows the custom slice renderer is infeasible.

Any dependency addition must include license/size/build review and must not break web export or production isolation tests.

## 15. Performance and failure behavior

Film Space is display-only. Failure must never block existing analysis.

Expected states:

- unsupported local source;
- missing/deleted video;
- frame extraction failed;
- cache generation cancelled;
- GL context unavailable;
- device memory/performance gate rejects requested quality;
- reduced-motion preference;
- app backgrounded during generation/rendering.

Fallback behavior:

- keep SequenceViewer and Phase Space available;
- never upload the raw video as a fallback;
- never silently substitute synthetic frames.

## 16. Privacy and storage acceptance criteria

The implementation passes only if:

- Firestore document shapes and counts are unchanged by this feature;
- raw video bytes never enter app network upload code for this feature;
- frame images, alpha masks, local URI/path/filename, and video EXIF remain local;
- local caches are purgeable and bounded;
- deleting the representative cloud profile does not require a remote raw-video deletion because no raw video was uploaded;
- existing profile deletion semantics remain intact.

## 17. Testing strategy

### Pure/unit tests

- deterministic temporal sample-time generation;
- slice-count and memory-budget clamping;
- 101-phase validation;
- phase-space trajectory generation;
- ghost-skeleton index selection;
- camera/projection math where extracted into helpers;
- source-time and normalized-phase labels cannot be conflated;
- Film Space unavailable does not disable Motion/Phase views.

### Integration/component tests

- temporary mode selector changes viewers without mutating profile data;
- missing local video state;
- cancellation state;
- reduced-motion behavior;
- accessibility labels and minimum touch targets;
- no raw URI leaks into rendered diagnostic/error copy.

### Regression

At minimum run the repository's standard typecheck, lint, unit tests, production isolation gate if present, and Expo web export. Firestore tests should remain unchanged unless a test explicitly proves this feature does not touch persistence.

### Physical-device gate

Before calling Film Space production-ready, test on a real supported iPhone:

- local photo-library and app-captured video sources;
- HEVC/VFR/slow-motion clips already required by the broader capture matrix where applicable;
- short and long clips;
- memory pressure;
- background/foreground;
- cancellation;
- cache rebuild;
- rotate/zoom/scrub responsiveness;
- battery/thermal behavior;
- no network transfer of raw video/frame assets.

## 18. Acceptance criteria for v1 implementation

1. Existing Motion/Sequence viewer behavior remains available.
2. Phase Space renders the representative 101-phase skeleton as trajectories + sparse ghost skeletons + current skeleton.
3. Phase Space uses phase language and does not claim synchronized real time.
4. Film Space can be invoked only from a valid local video reference and renders a bounded stacked-slice 3D view.
5. Film Space works without changing the current Firestore profile contract.
6. Losing the local video disables only Film Space, not cloud skeleton analysis.
7. No Three.js dependency unless explicitly justified by failed implementation evidence.
8. Person segmentation is not required for v1 acceptance; it is the next milestone after A+B.
9. No merge to `main` without owner review.
10. No success claim for iOS until the physical-device gate has actual evidence.

## 19. Non-goals

- true relativistic/physical 4D visualization;
- synchronized multi-camera metric reconstruction;
- new recommendation scoring;
- Curry/player comparison scoring;
- ball trajectory invention when no ball data exists;
- raw-video cloud backup;
- final UI/minimal-design pass;
- public/social sharing of raw Film Space media;
- segmentation in the first implementation milestone.

## 20. Stop condition

Implementation stops on the work branch when Milestones A+B are implemented, regression checks pass, and platform limitations are documented. Person Space and final UI simplification begin only after reviewing A+B behavior and performance.
