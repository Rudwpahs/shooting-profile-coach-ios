# HoopHub Film Space + Phase Space v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an additive `Motion / Phase / Film` shot inspection experience where representative skeleton data can be viewed as 101-phase space and a user's real source clip can be viewed locally as a bounded XY+time slice volume without uploading raw video.

**Architecture:** Keep capture/reconstruction/Firestore contracts unchanged. Phase Space is a pure projection layer over the existing `RepresentativePose4DV2`; Film Space is a separate local-only subsystem that associates accepted capture clips with a saved profile on-device, samples a bounded number of frames, and renders those local frames as textured planes through Expo GL. The existing `SequenceViewer` remains the fallback/default and all new modes sit behind an additional default-off experimental flag plus the existing Representative V2 rollout gate.

**Tech Stack:** Expo SDK 54, React Native 0.81, TypeScript 5.9, Vitest, `react-native-svg`, `@react-native-async-storage/async-storage`, `expo-image-picker`, new SDK-matched `expo-gl` + `expo-video-thumbnails` + `expo-file-system`, existing FormPath Representative V2 types.

**Spec:** `docs/superpowers/specs/2026-09-24-film-phase-space-v1-design.md`

## Global Constraints

- Raw/user video stays off the server; Firestore schema/document counts remain unchanged.
- Existing `SequenceViewer` remains available and unchanged in behavioral contract.
- Representative V2 remains `representative_phase_fused_4d_estimate_not_actual_3d`; normalized phase must never be labeled synchronized physical time.
- No representative fused skeleton may be overlaid on a source clip in a way that implies source-frame-synchronous measured 3D.
- No changes to reconstruction math, quality thresholds, Firestore rules, rollout certificates, consent/provenance logic, or recommendation-grade evidence admission.
- UI minimalization is deferred; v1 may use a simple temporary mode selector.
- Do not add Three.js in v1.
- Film Space must fail closed to the existing Motion/Phase views; it must never upload raw video as a fallback.
- Person segmentation is explicitly out of scope for this plan.
- No merge to `main` without owner review.
- No claim that Film Space is production-ready on iOS until a physical-device gate has actual evidence.

## Review Focus

- A saved profile whose local source URI has been deleted or evicted: Motion and Phase still work, Film shows an honest unavailable state without exposing the URI.
- Very short, very long, VFR, or malformed duration metadata: sampling returns a bounded deterministic plan or rejects explicitly; it never creates an unbounded frame set.
- Capture retake/cancel/save races: only accepted clips from the final saved session are associated with the saved profile; stale slot URIs do not survive retake.
- App backgrounding or user cancellation while frame extraction is in progress: generation stops cleanly, temporary thumbnails are released, and existing analysis stays usable.
- Web export / unsupported GL-native path: the app still exports and renders a non-crashing Film-unavailable fallback instead of importing native-only code into the wrong platform bundle.

---

## File Structure

### New files

- `lib/phase-space/geometry.ts` — pure conversion from 101-frame representative poses into phase-space trajectories, ghost indices, key anchors, and camera projection.
- `components/shooting-profile/phase-space-viewer.tsx` — SVG/native Phase Space interaction and drawing only.
- `lib/film-space/types.ts` — local-only film association, sampling-plan, frame-cache, and renderer contracts.
- `lib/film-space/sampling.ts` — deterministic slice-count, timestamp, memory-budget, and cleanup-safe sampling helpers.
- `lib/film-space/local-association.ts` — AsyncStorage-backed profile→local accepted clip association; never networked.
- `lib/film-space/frame-source.native.ts` — `expo-video-thumbnails` frame extraction and `expo-file-system` cleanup.
- `lib/film-space/frame-source.web.ts` — explicit unsupported adapter for web export.
- `components/shooting-profile/film-space-viewer.native.tsx` — Expo GL textured-plane renderer and native interaction shell.
- `components/shooting-profile/film-space-viewer.web.tsx` — safe unavailable fallback for web.
- `components/shooting-profile/shot-inspection-viewer.tsx` — temporary `Motion / Phase / Film` coordinator.
- `tests/phase-space-geometry.test.ts`
- `tests/phase-space-viewer.test.ts`
- `tests/film-space-sampling.test.ts`
- `tests/film-space-local-association.test.ts`
- `tests/film-space-capture-link.test.ts`
- `tests/shot-inspection-viewer.test.ts`
- `tests/film-space-boundary.test.ts`

### Modified files

- `hooks/use-shooting-profile-capture.ts` — retain accepted local clip refs in-memory until save; persist local association after successful save; purge on retake/cancel/session invalidation.
- `app/private-analysis/[id].tsx` — replace the direct `SequenceViewer` call with `ShotInspectionViewer`; pass owner/profile IDs and loaded profile data.
- `package.json` / `pnpm-lock.yaml` — add SDK-compatible Expo packages only.
- `docs/IMPLEMENTATION_STATUS.md` — record implemented state and physical-device blocker after code verification.
- `HANDOFF.md` — branch status, exact verification, and remaining device gate.

---

### Task 1: Phase Space pure geometry

**Files:**
- Create: `lib/phase-space/geometry.ts`
- Create: `tests/phase-space-geometry.test.ts`
- Read only: `components/shooting-profile/sequence-viewer.tsx`
- Read only: `lib/shooting-profile/types.ts`

**Interfaces:**
- Consumes: `RepresentativePose4DV2`, `RepresentativeViewId`, `ShootingHandV2`, and the existing `projectRepresentativeJoints(frame, view, shootingHand)` behavior.
- Produces:
  - `type PhaseSpacePoint = { x: number; y: number; z: number }`
  - `type PhaseSpaceCamera = { yawDegrees: number; pitchDegrees: number; zoom: number }`
  - `buildPhaseSpaceGeometry(profile, sourceView, shootingHand, ghostCount?): PhaseSpaceGeometry`
  - `selectGhostFrameIndices(frameCount, ghostCount): number[]`
  - `projectPhaseSpacePoint(point, camera, width, height): { x: number; y: number; depth: number }`

- [ ] **Step 1: Write failing geometry tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildPhaseSpaceGeometry,
  projectPhaseSpacePoint,
  selectGhostFrameIndices,
} from "@/lib/phase-space/geometry";
import { syntheticRepresentativeProfile } from "./support/representative-profile-fixture";

describe("phase-space geometry", () => {
  it("keeps exactly 101 normalized phases and never calls them time", () => {
    const profile = syntheticRepresentativeProfile();
    const geometry = buildPhaseSpaceGeometry(profile, "oblique", "right", 11);
    expect(geometry.frameCount).toBe(101);
    expect(geometry.axis.kind).toBe("normalized_shot_phase");
    expect(geometry.axis.label).toBe("SHOT PHASE");
    expect(geometry.trajectories.rightWrist).toHaveLength(101);
    expect(geometry.trajectories.rightWrist[0].z).toBe(0);
    expect(geometry.trajectories.rightWrist[100].z).toBe(1);
  });

  it("selects sparse ghosts including first and last without 101 opaque copies", () => {
    expect(selectGhostFrameIndices(101, 11)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(selectGhostFrameIndices(101, 13)).toHaveLength(13);
  });

  it("preserves five semantic anchors and projects only finite points", () => {
    const geometry = buildPhaseSpaceGeometry(syntheticRepresentativeProfile(), "front", "left", 11);
    expect(geometry.anchors.map((anchor) => anchor.id)).toEqual([
      "ready", "deepestDip", "rise", "releaseProxy", "followThrough",
    ]);
    for (const point of geometry.trajectories.leftWrist) {
      const projected = projectPhaseSpacePoint(point, { yawDegrees: -34, pitchDegrees: 16, zoom: 1 }, 330, 300);
      expect(Object.values(projected).every(Number.isFinite)).toBe(true);
    }
  });
});
```

If the representative fixture is still private to `tests/shooting-profile-sequence-viewer.test.ts`, extract only that deterministic fixture into `tests/support/representative-profile-fixture.ts` and update the existing test to import it; do not change fixture values.

- [ ] **Step 2: Run the new test and verify RED**

Run: `pnpm vitest run tests/phase-space-geometry.test.ts`

Expected: FAIL because `@/lib/phase-space/geometry` does not exist.

- [ ] **Step 3: Implement the minimum geometry**

Core contract:

```ts
export type PhaseSpacePoint = Readonly<{ x: number; y: number; z: number }>;
export type PhaseSpaceCamera = Readonly<{ yawDegrees: number; pitchDegrees: number; zoom: number }>;

export function selectGhostFrameIndices(frameCount: number, ghostCount = 11): number[] {
  if (frameCount !== 101) throw new Error("phase space requires exactly 101 stored frames");
  const count = Math.max(2, Math.min(13, Math.round(ghostCount)));
  return Array.from({ length: count }, (_, i) => Math.round((i * (frameCount - 1)) / (count - 1)));
}
```

`buildPhaseSpaceGeometry` must validate the existing 101-frame contract, call the current representative joint projector for each frame, convert each persisted joint into `{ x: projected.x, y: projected.y, z: frame.phase }`, retain only the five stored phase anchors, and never mutate `profile`.

`projectPhaseSpacePoint` should rotate the XY+phase volume with yaw/pitch and use a bounded perspective/zoom transform. Clamp zoom to a small display range such as `0.75..1.8`; this is display-only and must not alter source data.

- [ ] **Step 4: Run geometry tests and existing sequence-viewer tests**

Run:

```bash
pnpm vitest run tests/phase-space-geometry.test.ts tests/shooting-profile-sequence-viewer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add lib/phase-space/geometry.ts tests/phase-space-geometry.test.ts tests/support/representative-profile-fixture.ts tests/shooting-profile-sequence-viewer.test.ts
git commit -m "feat: add representative phase-space geometry"
```

---

### Task 2: PhaseSpaceViewer interaction and rendering

**Files:**
- Create: `components/shooting-profile/phase-space-viewer.tsx`
- Create: `tests/phase-space-viewer.test.ts`
- Modify only if necessary for shared exported constants: `components/shooting-profile/sequence-viewer.tsx`

**Interfaces:**
- Consumes: `buildPhaseSpaceGeometry`, `projectPhaseSpacePoint`, `RepresentativePose4DV2`, `ShootingHandV2`.
- Produces: `PhaseSpaceViewer({ profile, shootingHand, sourceView?, highlightJoint? })`.

- [ ] **Step 1: Write failing viewer contract tests**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/shooting-profile/phase-space-viewer.tsx"),
  "utf8",
);

describe("PhaseSpaceViewer contract", () => {
  it("uses phase language and preserves sparse visual density", () => {
    expect(source).toMatch(/SHOT PHASE|슛 단계/);
    expect(source).not.toMatch(/SYNC(?:HRONIZED)? TIME|실제 4D|실시간 4D/i);
    expect(source).toMatch(/ghost/i);
    expect(source).toMatch(/trajectory|world.?line/i);
  });

  it("has rotate, zoom, scrub and reduced-motion/accessibility surfaces", () => {
    expect(source).toMatch(/PanResponder|Gesture/);
    expect(source).toMatch(/zoom/i);
    expect(source).toMatch(/phase/i);
    expect(source).toMatch(/AccessibilityInfo|accessibilityLabel/);
  });
});
```

Add pure tests for a helper exported from the component (or geometry module) that maps a scrub fraction to `0..100` exactly and clamps NaN/Infinity by throwing rather than silently generating an invalid frame.

- [ ] **Step 2: Run viewer tests and verify RED**

Run: `pnpm vitest run tests/phase-space-viewer.test.ts`

Expected: FAIL because the component is absent.

- [ ] **Step 3: Implement the minimal PhaseSpaceViewer**

Implementation rules:

```tsx
<PhaseSpaceViewer
  profile={record.profile}
  shootingHand={record.shootingHand}
  sourceView="oblique"
/>
```

Render hierarchy:

```text
1. low-emphasis joint trajectory polylines for the 12 persisted joints
2. 9–13 sparse ghost skeletons
3. five anchor markers/planes
4. one full-emphasis current skeleton at scrub index
5. temporary controls for front/oblique/side, phase scrub, rotate/reset
```

Use `react-native-svg`; do not introduce a second 3D framework. Reuse the existing playback lifecycle concepts for app background and reduced-motion where possible. Current frame must be selected from the exact stored `profile.frames[index]`; do not interpolate a new evidence frame.

Boundary copy must be short and explicit, e.g.:

```text
101개 정규화 슛 단계를 공간으로 펼친 분석용 보기입니다. 실제 동기화 시간축이나 계측 4D가 아닙니다.
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm vitest run tests/phase-space-viewer.test.ts tests/phase-space-geometry.test.ts tests/shooting-profile-sequence-viewer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add components/shooting-profile/phase-space-viewer.tsx tests/phase-space-viewer.test.ts
git commit -m "feat: add phase-space shot viewer"
```

---

### Task 3: Local-only profile-to-film association from capture

**Files:**
- Create: `lib/film-space/types.ts`
- Create: `lib/film-space/local-association.ts`
- Modify: `hooks/use-shooting-profile-capture.ts`
- Create: `tests/film-space-local-association.test.ts`
- Create: `tests/film-space-capture-link.test.ts`

**Interfaces:**
- Consumes: accepted `ImagePicker.ImagePickerAsset` metadata at capture time and saved `profileId` from the existing save callback.
- Produces:
  - `type LocalFilmClipRefV1 = { slotId; view; takeIndex; uri; durationMs; width; height }`
  - `type LocalFilmAssociationV1 = { version: "local_film_association_v1"; profileId; clips: LocalFilmClipRefV1[] }`
  - `saveLocalFilmAssociation(profileId, clips): Promise<void>`
  - `loadLocalFilmAssociation(profileId): Promise<LocalFilmAssociationV1 | null>`
  - `deleteLocalFilmAssociation(profileId): Promise<void>`

- [ ] **Step 1: Write local-storage tests**

Mock AsyncStorage and assert:

```ts
it("stores local URI only under a local app key and never serializes filename or EXIF", async () => {
  await saveLocalFilmAssociation("profile-a", [{
    slotId: "front-0",
    view: "front",
    takeIndex: 0,
    uri: "file:///private/cache/clip.mov",
    durationMs: 2800,
    width: 1080,
    height: 1920,
  }]);
  const serialized = String(mockStorageValue());
  expect(serialized).toContain("file:///private/cache/clip.mov");
  expect(serialized).not.toMatch(/filename|exif|cloud|firestore|https?:/i);
});
```

Also test malformed JSON, wrong version, wrong profile ID, empty clips, and deletion; all must fail closed to `null` or no association.

- [ ] **Step 2: Write capture-link tests**

Use source inspection plus exported pure helpers if needed to pin these behaviors:

```ts
it("drops a slot film ref on retake and all refs on cancel/session invalidation", () => {
  const refs = new Map();
  retainAcceptedLocalFilmRef(refs, clipA);
  retainAcceptedLocalFilmRef(refs, clipB);
  dropLocalFilmRef(refs, clipA.slotId);
  expect([...refs.keys()]).toEqual([clipB.slotId]);
  clearLocalFilmRefs(refs);
  expect(refs.size).toBe(0);
});
```

Assert the hook persists the association only after the existing cloud profile save has succeeded and received an opaque `profileId`; a failed save must not create a profile association.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
pnpm vitest run tests/film-space-local-association.test.ts tests/film-space-capture-link.test.ts
```

Expected: FAIL because the film-space modules/helpers do not exist.

- [ ] **Step 4: Implement local association without touching the cloud contract**

Inside `useShootingProfileCapture`, add an in-memory `Map<slotId, LocalFilmClipRefV1>` ref. Only after `detectPoseClipV2` returns complete and quality passes should the accepted asset URI be retained for that slot. `retakeSlot` removes that slot's local ref. `cancelSession`, mode changes, shooting-hand changes, and session invalidation clear all local refs.

On existing `runCaptureSaveOperationV2` success:

```ts
onSucceeded: (profileId, sessionGeneration) => {
  dispatch({ type: "SAVE_SUCCEEDED", sessionGeneration, profileId });
  const clips = [...localFilmRefsRef.current.values()];
  if (clips.length > 0) void saveLocalFilmAssociation(profileId, clips);
},
```

Do not add URI/filename fields to reducer state, `SaveShootingProfileInputV2`, Firestore documents, analytics, logs, or errors.

- [ ] **Step 5: Run capture and association tests**

Run:

```bash
pnpm vitest run tests/film-space-local-association.test.ts tests/film-space-capture-link.test.ts tests/shooting-profile-capture-reducer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add lib/film-space/types.ts lib/film-space/local-association.ts hooks/use-shooting-profile-capture.ts tests/film-space-local-association.test.ts tests/film-space-capture-link.test.ts
git commit -m "feat: retain local film refs for saved profiles"
```

---

### Task 4: Bounded Film Space sampling and native frame-source adapter

**Files:**
- Create: `lib/film-space/sampling.ts`
- Create: `lib/film-space/frame-source.native.ts`
- Create: `lib/film-space/frame-source.web.ts`
- Create: `tests/film-space-sampling.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: one `LocalFilmClipRefV1`.
- Produces:
  - `createFilmSpaceSamplingPlan(durationMs, options?): FilmSpaceSamplingPlan`
  - `extractFilmSpaceFrames(clip, plan, signal?): Promise<FilmSpaceFrameCache>` on native
  - `disposeFilmSpaceFrames(cache): Promise<void>`
  - web adapter that returns `{ status: "unsupported_platform" }` without importing native thumbnail/GL code.

- [ ] **Step 1: Write sampling tests**

```ts
it("creates deterministic 64-96 slice plans with bounded raw RGBA budget", () => {
  const plan = createFilmSpaceSamplingPlan(3000, { preferredSlices: 80, targetLongEdgePx: 240 });
  expect(plan.sliceCount).toBe(80);
  expect(plan.timestampsMs[0]).toBe(0);
  expect(plan.timestampsMs.at(-1)).toBe(3000);
  expect(plan.timestampsMs).toEqual([...plan.timestampsMs].sort((a, b) => a - b));
  expect(plan.estimatedRgbaBytes).toBeLessThanOrEqual(24 * 1024 * 1024);
});

it("rejects non-finite and non-positive durations rather than inventing frames", () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => createFilmSpaceSamplingPlan(value)).toThrow(/duration/i);
  }
});
```

Add tests for minimum 64 slices, maximum 96 slices, clamped target edge, and deterministic timestamp rounding. This owns the Review Focus malformed-duration case.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/film-space-sampling.test.ts`

Expected: FAIL.

- [ ] **Step 3: Add SDK-compatible dependencies**

Run:

```bash
pnpm exec expo install expo-gl expo-video-thumbnails expo-file-system
```

Expected: SDK 54-compatible versions written to `package.json` and lockfile; no Three.js package appears.

- [ ] **Step 4: Implement sampling and adapters**

Sampling contract:

```ts
export const FILM_SPACE_MIN_SLICES = 64;
export const FILM_SPACE_MAX_SLICES = 96;
export const FILM_SPACE_DEFAULT_SLICES = 80;
export const FILM_SPACE_MAX_RGBA_BYTES = 24 * 1024 * 1024;
```

The native adapter loops through planned timestamps, calls `VideoThumbnails.getThumbnailAsync(clip.uri, { time, quality: 0.72 })`, records returned local thumbnail URIs plus dimensions, checks `AbortSignal` between each extraction, and cleans up already-created temporary thumbnails if cancelled or failed. Never include `clip.uri` in thrown user-facing error text.

The web adapter exports the same functions but returns unsupported immediately so production web export cannot accidentally invoke native frame extraction.

- [ ] **Step 5: Run sampling tests, typecheck, and static dependency boundary check**

Run:

```bash
pnpm vitest run tests/film-space-sampling.test.ts
pnpm check
```

Then confirm:

```bash
node -e "const p=require('./package.json'); if (p.dependencies?.three || p.devDependencies?.three) process.exit(1)"
```

Expected: PASS / exit 0.

- [ ] **Step 6: Commit Task 4**

```bash
git add lib/film-space/sampling.ts lib/film-space/frame-source.native.ts lib/film-space/frame-source.web.ts tests/film-space-sampling.test.ts package.json pnpm-lock.yaml
git commit -m "feat: add bounded local film frame sampling"
```

---

### Task 5: Native Expo GL stacked-slice renderer with safe web fallback

**Files:**
- Create: `components/shooting-profile/film-space-viewer.native.tsx`
- Create: `components/shooting-profile/film-space-viewer.web.tsx`
- Create: `tests/film-space-boundary.test.ts`

**Interfaces:**
- Consumes: `LocalFilmClipRefV1`, sampling plan, native frame cache.
- Produces: platform-resolved `FilmSpaceViewer({ clip, onUnavailable? })`.

- [ ] **Step 1: Write boundary tests before renderer code**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const nativeSource = readFileSync(resolve(process.cwd(), "components/shooting-profile/film-space-viewer.native.tsx"), "utf8");
const webSource = readFileSync(resolve(process.cwd(), "components/shooting-profile/film-space-viewer.web.tsx"), "utf8");

describe("film-space privacy/platform boundary", () => {
  it("renders native GL locally without network or cloud imports", () => {
    expect(nativeSource).toMatch(/GLView/);
    expect(nativeSource).not.toMatch(/firebase|fetch\(|axios|trpc|upload/i);
    expect(nativeSource).not.toMatch(/console\.(log|warn|error).*uri/i);
  });

  it("keeps the web fallback free of native frame extraction", () => {
    expect(webSource).not.toMatch(/expo-video-thumbnails|expo-gl/);
    expect(webSource).toMatch(/기기|iPhone|지원/);
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/film-space-boundary.test.ts`

Expected: FAIL because viewer files do not exist.

- [ ] **Step 3: Implement a slice-stack renderer, not raymarching**

Native state machine:

```ts
type FilmSpaceViewerState =
  | { status: "idle" }
  | { status: "preparing"; completed: number; total: number }
  | { status: "ready"; cache: FilmSpaceFrameCache }
  | { status: "unavailable" }
  | { status: "cancelled" }
  | { status: "error" };
```

`GLView` must create one textured quad per sampled frame at monotonically increasing Z. Use simple vertex + fragment shaders and one scene transform (yaw/pitch/zoom). Do not implement a 3D texture, raymarch shader, MIP, or isosurface in v1.

The component must:

```text
- generate frames lazily only when Film mode mounts
- stop/cancel on unmount or app background
- release GL textures and temporary extracted thumbnails on disposal
- provide drag rotate, pinch/zoom, and a time-slice scrub control
- expose source-time labels only inside Film Space
- never render the local URI/path or filename
```

When GL setup or frame extraction fails, render a short unavailable state and return control to Motion/Phase; never modify cloud state.

- [ ] **Step 4: Run boundary test and web export smoke**

Run:

```bash
pnpm vitest run tests/film-space-boundary.test.ts tests/film-space-sampling.test.ts
pnpm exec expo export --platform web --output-dir web-film-space-check
```

Expected: tests PASS; web export completes without native-module resolution errors.

- [ ] **Step 5: Commit Task 5**

```bash
git add components/shooting-profile/film-space-viewer.native.tsx components/shooting-profile/film-space-viewer.web.tsx tests/film-space-boundary.test.ts
git commit -m "feat: render local shot film as stacked time slices"
```

---

### Task 6: ShotInspectionViewer coordinator and private-analysis integration

**Files:**
- Create: `components/shooting-profile/shot-inspection-viewer.tsx`
- Create: `tests/shot-inspection-viewer.test.ts`
- Modify: `app/private-analysis/[id].tsx`
- Optionally create: `lib/film-space/experimental-flag.ts`

**Interfaces:**
- Consumes: current loaded private profile record, `profileId`, `shootingHand`; local association loader.
- Produces: one additive viewer with `motion | phase | film` modes. Motion remains default.

- [ ] **Step 1: Write coordinator tests**

```ts
it("defaults to Motion and keeps Phase available when local film is missing", async () => {
  const model = resolveShotInspectionModes({ experimentalEnabled: true, hasLocalFilm: false });
  expect(model.defaultMode).toBe("motion");
  expect(model.enabledModes).toEqual(["motion", "phase"]);
});

it("adds Film only when the experimental gate is on and a local clip exists", () => {
  expect(resolveShotInspectionModes({ experimentalEnabled: false, hasLocalFilm: true }).enabledModes).toEqual(["motion"]);
  expect(resolveShotInspectionModes({ experimentalEnabled: true, hasLocalFilm: true }).enabledModes).toEqual(["motion", "phase", "film"]);
});
```

Add source assertions that `app/private-analysis/[id].tsx` no longer mounts `SequenceViewer` directly and instead passes the loaded record/profile ID into `ShotInspectionViewer`.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/shot-inspection-viewer.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement the temporary mode coordinator**

Use an additional default-off experimental flag, e.g.:

```ts
export const HOOPHUB_SPACETIME_V1_ENABLED = process.env.EXPO_PUBLIC_HOOPHUB_SPACETIME_V1 === "1";
```

This flag is an additional restriction only. It must not bypass `FORMPATH_FLAGS.profileV2` or `FORMPATH_FLAGS.representative4DViewer`; the private route remains protected by the existing certificate-backed rollout gate.

Temporary UI contract:

```text
[ 동작 ] [ 단계 공간 ] [ 실제 영상 ]
```

- `동작` → existing `SequenceViewer`
- `단계 공간` → `PhaseSpaceViewer`
- `실제 영상` → `FilmSpaceViewer` only when a local association exists and one clip is selected

If more than one accepted local clip exists, expose a minimal front/side/take selector using metadata only (`view`, `takeIndex`), never URI/path text.

- [ ] **Step 4: Run coordinator + existing private viewer tests**

Run:

```bash
pnpm vitest run tests/shot-inspection-viewer.test.ts tests/shooting-profile-sequence-viewer.test.ts tests/film-space-local-association.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add components/shooting-profile/shot-inspection-viewer.tsx app/private-analysis/[id].tsx lib/film-space/experimental-flag.ts tests/shot-inspection-viewer.test.ts
git commit -m "feat: integrate motion phase and local film inspection"
```

---

### Task 7: Privacy regression, lifecycle edge cases, documentation, and full verification

**Files:**
- Create or extend: `tests/film-space-boundary.test.ts`
- Modify: `docs/IMPLEMENTATION_STATUS.md`
- Modify: `HANDOFF.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a branch that is regression-tested and explicitly marked as requiring physical-iPhone evidence before Film Space can be called production-ready.

- [ ] **Step 1: Add explicit privacy and fallback regression tests**

Add checks that:

```ts
it("does not introduce film fields into Firestore/profile contracts", () => {
  const cloudFiles = [
    "lib/firebase-shooting-profile-contract.ts",
    "lib/firebase-shooting-profiles.ts",
    "firestore.rules",
  ].map((path) => readFileSync(resolve(process.cwd(), path), "utf8").join("\n"));
  expect(cloudFiles).not.toMatch(/LocalFilm|filmUri|videoUri|thumbnailUri|sourceFilename/);
});
```

Also test:

```text
- missing association -> Motion/Phase still enabled
- malformed local association -> treated as missing
- frame extraction cancellation -> cleanup invoked
- background state -> generation/rendering paused or cancelled
- no local URI appears in user-visible error strings
```

- [ ] **Step 2: Run focused RED/GREEN until all feature tests pass**

Run:

```bash
pnpm vitest run \
  tests/phase-space-geometry.test.ts \
  tests/phase-space-viewer.test.ts \
  tests/film-space-sampling.test.ts \
  tests/film-space-local-association.test.ts \
  tests/film-space-capture-link.test.ts \
  tests/film-space-boundary.test.ts \
  tests/shot-inspection-viewer.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Run standard repository verification**

Run exactly:

```bash
pnpm check
pnpm lint
pnpm test:unit
pnpm exec expo export --platform web --output-dir web-dist
```

If the repository's normal CI-equivalent rules suite is available in the execution environment, also run:

```bash
pnpm test:rules
```

Expected: all applicable commands PASS. Do not claim iOS GL success from these commands.

- [ ] **Step 4: Run diff safety audit**

Run:

```bash
git diff --name-only main...HEAD -- \
  lib/shooting-profile \
  lib/firebase-shooting-profile-contract.ts \
  lib/firebase-shooting-profiles.ts \
  firestore.rules
```

Expected: no changes in those protected cloud/reconstruction paths. `hooks/use-shooting-profile-capture.ts` is intentionally changed only for local accepted-clip association; inspect its diff manually for absence of cloud payload changes.

Then grep the full branch diff for raw-media cloud leakage:

```bash
git diff main...HEAD | grep -E "(videoUri|filmUri|thumbnailUri|sourceFilename|EXIF|asset\.uri).*firebase|firebase.*(videoUri|filmUri|thumbnailUri|sourceFilename|EXIF|asset\.uri)" && exit 1 || true
```

Expected: no matches.

- [ ] **Step 5: Update implementation status and handoff with exact limitations**

Record:

```text
- Phase Space implemented from existing 101 normalized phases; not physical time.
- Film Space implemented as local-only stacked slices; no raw upload.
- SequenceViewer preserved as default Motion mode.
- Person Space/segmentation deferred.
- UI minimization deferred.
- Web/unit verification results with exact counts.
- Physical iPhone tests NOT YET EVIDENCED: HEVC/VFR/slow-motion, memory pressure, thermal/battery, GL interaction, cancellation/background, local-source eviction.
- Feature remains on work branch; no merge to main.
```

- [ ] **Step 6: Commit Task 7**

```bash
git add tests/film-space-boundary.test.ts docs/IMPLEMENTATION_STATUS.md HANDOFF.md
git commit -m "test: verify film and phase space boundaries"
```

- [ ] **Step 7: Final branch evidence**

Run:

```bash
git status --short
git log --oneline --decorate -8
git diff --stat main...HEAD
```

Expected: clean worktree, all feature commits present, no merge to `main`.

---

## Plan Self-Review

### Spec coverage

- Film Space local-only XY+time slice visualization: Tasks 3–6.
- Phase Space over exact 101 normalized phases: Tasks 1–2, integrated in Task 6.
- SequenceViewer preserved: Tasks 2 and 6 explicitly keep it as default Motion mode.
- No server raw media / unchanged Firestore contract: Tasks 3 and 7.
- No synchronized-time claim for representative skeleton: Tasks 1, 2, and 7.
- Person Space deferred: global constraints and final documentation.
- No Three.js: Task 4 dependency gate.
- Missing local source fallback: Tasks 3, 6, and 7.
- Physical-device gate before production claim: Task 7 documentation and stop condition.
- UI minimalization deferred: global constraints and coordinator uses only temporary controls.

### Placeholder scan

No `TBD`, `TODO`, or unspecified error-handling steps remain. Every implementation task includes concrete files, interfaces, tests, commands, expected behavior, and a commit boundary.

### Type consistency

- `LocalFilmClipRefV1` and `LocalFilmAssociationV1` are defined once in Task 3 and reused by Tasks 4–6.
- `PhaseSpaceGeometry` is produced by Task 1 and consumed by Task 2.
- `FilmSpaceSamplingPlan` and `FilmSpaceFrameCache` are produced by Task 4 and consumed by Task 5.
- `ShotInspectionViewer` consumes only existing private record/profile identifiers plus Task 2/5 viewers.

### Review Focus coverage

- Deleted/evicted local URI: Tasks 3, 6, 7.
- Malformed duration/VFR boundary: Task 4.
- Retake/cancel/save races: Task 3.
- Background/cancellation cleanup: Tasks 4, 5, 7.
- Web/native split and export safety: Tasks 4, 5, 7.
