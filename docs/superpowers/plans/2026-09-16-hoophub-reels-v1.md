# Hoop Hub Reels v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full-screen, vertically paged Reels surface for Hoop Hub's skeleton motions that a user who knows Instagram Reels can open, watch, pause, resume and page through without thinking, entered from the Home previews and returning to them.

**Architecture:** Pure state first (`lib/reels/`: view model, feed reducer, frame clock and playback policy, an in-memory handoff from Home), then presentational components (`components/reels/`: motion player, progress, overlay, item, feed) that reuse the existing projection helpers (`representativeGlyph`, `representativeSequenceBounds`, `poseMotionGlyph`, `advanceRepresentativeFrameIndex`, `resolveRepresentativePlayback`) and never touch `SequenceViewer`; then a stack route `app/reels.tsx` outside `(tabs)` (so no tab bar), the Home entry, demo states for the Pages preview, and visual QA. Only the active item mounts a player; neighbours hold one projected still; everything else holds nothing.

**Tech Stack:** Expo SDK 54 / expo-router 6 / RN 0.81 (FlatList paging, Animated, useWindowDimensions, useFocusEffect), react-native-svg glyphs, vitest 2 (node for pure modules, jsdom via react-native-web for render tests).

**Spec:** `docs/superpowers/specs/2026-09-16-hoophub-reels-v1-spec.md`

## Global Constraints

- Base `main` @ `2ebf1d2`; branch `work/hoophub-reels-v1`; never commit to `main`, never merge.
- Old harness `origin/work/claude-hoop-hub-product-ui` is reference only: port concepts and small pure helpers, rewrite tests on `main`; never merge it.
- Protected areas untouched: `lib/shooting-profile/**`, `lib/feature-flags.ts`, `lib/firebase-*`, `firestore.rules`, `modules/**`, `contracts/**`, `ml/**`, capture hook and reducer. `git diff --stat origin/main -- <those paths>` must be empty at the end.
- No fake social data or controls. No new runtime dependencies. No `expo-blur`. Tokens and system typography only (`tests/ui-tokens.test.ts` literal gate stays green).
- `SequenceViewer` is not modified.
- Vocabulary: "Motion Lift" = existing skeleton gesture (not built here); "Lift Subject" = background separation (not built here).
- Every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Git in this worktree: one plain git command per call; `git add <paths>` then `git commit -F <file>`.

---

## File map

| File | Responsibility |
| --- | --- |
| `lib/reels/reel-model.ts` | `ReelItem` view model (profile or anonymous reference), titles, lines, a11y name, analysis id, confidence, ids |
| `lib/reels/reel-sources.ts` | `homeReelItems(latest, references)`: the item list Home hands to Reels |
| `lib/reels/reel-feed-state.ts` | Ported reducer: active index, playback mode (`auto`/`paused`/`explicit`), media roles, snap maths, initial index |
| `lib/reels/reel-playback.ts` | Pure frame clock (advance by elapsed ms, 100 → 0 wrap), progress, `reelShouldPlay` policy, per-item frame interval |
| `lib/reels/reel-handoff.ts` | In-memory handoff (items + start id) from Home to the route; no persistence, no network |
| `hooks/use-reduce-motion.ts` | Ported: system Reduce Motion, `null` until resolved |
| `hooks/use-app-state.ts` | Current `AppStateStatus` |
| `components/reels/reel-motion-player.tsx` | Draws the active Reel's frame, owns the rAF clock, holds the frame when not playing, writes progress into an `Animated.Value` |
| `components/reels/reel-progress.tsx` | 2 pt progress line driven by the `Animated.Value` |
| `components/reels/reel-overlay.tsx` | Close, view chips, paused indicator, label + line, analysis action, progress; centre of the stage stays clear |
| `components/reels/reel-item.tsx` | One viewport: stage by role (player / still / nothing), tap surface with adjustable a11y, overlay |
| `components/reels/reels-feed.tsx` | Paged `FlatList`, reducer, viewability, shared view selection |
| `app/reels.tsx` | Route outside `(tabs)`: handoff or fallback items, focus/app-state/reduce-motion, entry animation, close and analysis navigation |
| `app/_layout.tsx` | Registers the `reels` stack screen with a fade animation |
| `components/home/home-feed.tsx`, `app/(tabs)/index.tsx` | Previews open Reels at the tapped item |
| `lib/dev/ui-demo-fixtures.ts`, `app/dev/ui-demo.tsx` | `reels` fixtures and `screen=reels&state=…` |
| `tests/reel-model.test.ts`, `tests/reel-feed-state.test.ts`, `tests/reel-playback.test.ts`, `tests/reel-handoff.test.ts`, `tests/reels-render.test.tsx`, `tests/ui-reels.test.ts` | New suites |
| `tests/ui-home.test.ts`, `tests/ui-apple-design.test.ts`, `tests/ui-demo-isolation.test.ts` | Adjusted contracts |

---

### Task 1: Pure Reels state — model, sources, feed state, playback, handoff

**Files:** create `lib/reels/reel-model.ts`, `lib/reels/reel-sources.ts`, `lib/reels/reel-feed-state.ts`, `lib/reels/reel-playback.ts`, `lib/reels/reel-handoff.ts`; tests `tests/reel-model.test.ts`, `tests/reel-feed-state.test.ts`, `tests/reel-playback.test.ts`, `tests/reel-handoff.test.ts`.

**Interfaces produced:**

```ts
// reel-model.ts
export type ProfileReel = { kind: "profile"; id: string; profileId: string; profile: RepresentativePose4DV2; shootingHand: ShootingHandV2; confidence: number; createdAt: Date };
export type ReferenceReel = { kind: "reference"; id: string; reference: AnonymousPoseReference };
export type ReelItem = ProfileReel | ReferenceReel;
export function profileReelId(profileId: string): string;      // `profile:${profileId}`
export function referenceReelId(referenceId: string): string;  // `reference:${referenceId}`
export function reelTitle(item: ReelItem): string;             // "내 슛폼" | reference.shortLabel
export function reelLine(item: ReelItem): string;              // relativeDayLabel(createdAt) | reference.styleTitle
export function reelAccessibilityName(item: ReelItem): string; // "내 슛폼 릴" | `${shortLabel} 참조 릴, CMU optical mocap`
export function reelAnalysisProfileId(item: ReelItem): string | null;
export function reelConfidence(item: ReelItem): SkeletonConfidence;
// reel-sources.ts
export function homeReelItems(latest: LatestRepresentativeState, references: readonly AnonymousPoseReference[]): ReelItem[];
// reel-feed-state.ts
export type ReelPlaybackMode = "auto" | "paused" | "explicit";
export type ReelFeedState = { activeIndex: number; count: number; playback: ReelPlaybackMode };
export type ReelFeedEvent = { type: "items"; count: number } | { type: "settle"; index: number } | { type: "next" } | { type: "previous" } | { type: "toggle-playback" } | { type: "pause" };
export type ReelMediaRole = "active" | "adjacent" | "idle";
export function createReelFeedState(count: number, initialIndex?: number, playback?: ReelPlaybackMode): ReelFeedState;
export function transitionReelFeedState(state: ReelFeedState, event: ReelFeedEvent): ReelFeedState;
export function clampReelIndex(index: number, count: number): number;
export function initialReelIndex(items: readonly { id: string }[], startId: string | undefined): number;
export function reelMediaRole(index: number, activeIndex: number): ReelMediaRole;
export function reelSnapOffset(index: number, viewportHeight: number): number;
export function reelIndexFromOffset(offsetY: number, viewportHeight: number, count: number): number;
// reel-playback.ts
export const REEL_FRAME_COUNT = 101; export const REEL_LAST_FRAME = 100;
export type ReelFrameClock = { frame: number; carryMs: number };
export function createReelFrameClock(frame?: number): ReelFrameClock;
export function advanceReelFrameClock(clock: ReelFrameClock, elapsedMs: number, frameIntervalMs: number): ReelFrameClock;
export function reelProgress(frame: number): number;
export type ReelPlaybackPolicy = { active: boolean; focused: boolean; appState: AppStateStatus; playback: ReelPlaybackMode; reducedMotion: boolean | null };
export function reelShouldPlay(policy: ReelPlaybackPolicy): boolean;
export function reelFrameIntervalMs(item: ReelItem): number;   // profile 40, reference 18.5
export function reelStartFrame(item: ReelItem): number;        // release frame | 75
// reel-handoff.ts
export type ReelHandoff = { items: readonly ReelItem[]; startId: string };
export function setReelHandoff(handoff: ReelHandoff): void;
export function takeReelHandoff(): ReelHandoff | null;  // returns and clears
export function clearReelHandoff(): void;
```

- [ ] **Step 1: Write the failing tests** (four files; the behaviours below are the ones the spec names)

`tests/reel-feed-state.test.ts` — starts at the given index playing (`auto`); `next`/`previous` clamp and reset playback to `auto`; `settle` with the same index keeps playback; toggle goes `auto → paused → explicit → paused`; `pause` on an empty feed is a no-op; `items` shrink clamps; `reelMediaRole` yields `idle, adjacent, active, adjacent, idle` around 2; snap/offset maths; `initialReelIndex` finds the id, unknown → 0.

`tests/reel-playback.test.ts` — 39 ms advances nothing (carry 39), 40 ms advances one frame, 100 ms advances two with carry 20, frame 100 + 40 ms → 0 (loop), negative/NaN elapsed → same state; `reelProgress(0)=0`, `(50)=0.5`, `(100)=1`; `reelShouldPlay`: all good → true; `active:false` → false; `focused:false` → false; `appState:"background"` → false; `playback:"paused"` → false; `reducedMotion:true, playback:"auto"` → false; `reducedMotion:true, playback:"explicit"` → true; `reducedMotion:null` (unresolved) with `auto` → false; `reelFrameIntervalMs` profile 40 / reference 18.5; `reelStartFrame` profile = `representativeReleaseFrameIndex`, reference 75.

`tests/reel-model.test.ts` — ids, titles, lines, a11y names, `reelAnalysisProfileId` (profile id / null), `reelConfidence`, `homeReelItems`: ready latest → own profile first then references; signed-out → references only; ids unique.

`tests/reel-handoff.test.ts` — `take` returns what was set and clears; second `take` → null; `clear`.

Fixtures for these node tests come from `tests/fixtures/synthetic-landmark-sequence.ts` + `buildTwoViewRepresentativeProfile` (as `tests/ui-demo-isolation.test.ts` does) and `ANONYMOUS_POSE_REFERENCES[0]`.

- [ ] **Step 2: Run them to see them fail** — `corepack pnpm vitest run tests/reel-model.test.ts tests/reel-feed-state.test.ts tests/reel-playback.test.ts tests/reel-handoff.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Implement the five modules** (full code in the execution commit; the reducer is the C1 reducer with `paused: boolean` replaced by `playback` and `initialReelIndex` added; the clock uses `advanceRepresentativeFrameIndex` for the wrap; `reelShouldPlay` composes `resolveRepresentativePlayback`).

- [ ] **Step 4: Run to green**, `corepack pnpm check`, `corepack pnpm lint`.

- [ ] **Step 5: Commit** — `feat(reels): add the pure Reels state: model, feed, frame clock, handoff`.

---

### Task 2: Hooks — Reduce Motion and app state

**Files:** create `hooks/use-reduce-motion.ts` (ported from the C1 harness, unchanged semantics: `null` until resolved, failure → `true`), `hooks/use-app-state.ts`.

- [ ] Step 1: `tests/ui-reels.test.ts` (static) gains an assertion that both hooks exist and subscribe (`AccessibilityInfo.addEventListener("reduceMotionChanged"`, `AppState.addEventListener("change"`), and that neither is imported by `SequenceViewer`. RED, then implement, GREEN. Folded into the Task 3 commit.

---

### Task 3: Player, progress, overlay, item, feed (render-tested)

**Files:** create `components/reels/reel-motion-player.tsx`, `reel-progress.tsx`, `reel-overlay.tsx`, `reel-item.tsx`, `reels-feed.tsx`; test `tests/reels-render.test.tsx` (jsdom, mocks as in `tests/ui-render.test.tsx`: `react-native-svg`, icons, safe-area, `expo-haptics`).

**Interfaces:**

```ts
// reel-motion-player.tsx
type ReelMotionPlayerProps = { item: ReelItem; view: RepresentativeViewId; width: number; height: number; playing: boolean; progress: Animated.Value; startFrame: number };
// reel-progress.tsx
export const REEL_PROGRESS_HEIGHT = 2;
type ReelProgressProps = { progress: Animated.Value; width: number; bottom: number };
// reel-overlay.tsx
export const REEL_VIEWS: readonly { id: RepresentativeViewId; label: string }[] = [{ id: "front", label: "정면" }, { id: "oblique", label: "사선" }, { id: "side", label: "측면" }];
type ReelOverlayProps = { item: ReelItem; paused: boolean; view: RepresentativeViewId; onViewChange: (view) => void; onClose: () => void; onOpenAnalysis: (() => void) | null; width: number; height: number; insets: { top: number; bottom: number }; progress: Animated.Value };
// reel-item.tsx
type ReelItemProps = { item; index; count; width; height; role: ReelMediaRole; playback: ReelPlaybackMode; focused: boolean; appState: AppStateStatus; reducedMotion: boolean | null; view; onViewChange; onTogglePlayback; onNext; onPrevious; onClose; onOpenAnalysis: ((profileId: string) => void) | null; insets };
// reels-feed.tsx
export type ReelsFeedProps = { items: readonly ReelItem[]; width: number; height: number; initialIndex: number; initialPlayback?: ReelPlaybackMode; focused: boolean; appState: AppStateStatus; reducedMotion: boolean | null; insets: { top: number; bottom: number }; onClose: () => void; onOpenAnalysis: ((profileId: string) => void) | null; onStateChange?: (state: ReelFeedState) => void };
```

Behaviour: `playing = reelShouldPlay({ active: role === "active", focused, appState, playback, reducedMotion })`. The player advances only while `playing`, holds the frame otherwise (no reset), writes `reelProgress(frame)` into `progress` every frame. Test ids: `reels-feed`, `reel-item-<kind>`, `reel-stage-active|still|idle`, `reel-tap`, `reel-pause-indicator`, `reel-progress`, `reel-view-<id>`, `reel-analysis`, `reel-close`. A11y: the tap surface is `adjustable`, label `${name}, ${i+1}/${count}, ${재생 중|일시정지됨}`, actions `activate` (toggle), `increment` (next), `decrement` (previous); neighbours hidden from assistive tech.

- [ ] Step 1: Write `tests/reels-render.test.tsx`: one active playing stage; tap → `일시정지됨` + indicator; tap → `재생 중`, no indicator; progress present; no like/comment/follow/share/DM text or icons (`heart|comment|share|send|follow|좋아요|댓글|팔로우|공유`); chips switch view (`aria-selected`); analysis action present for a profile reel and absent for a reference reel; adjacent = still, idle = nothing; Reduce Motion (`reducedMotion: true`) → not playing on mount, indicator visible, a tap → playing; `focused:false` → not playing but no indicator change of intent (label `일시정지됨` acceptable) and playback mode unchanged; app state `background` → not playing.
- [ ] Step 2: RED. Step 3: implement. Step 4: GREEN + `check` + `lint`. Step 5: Commit — `feat(reels): build the Reels player, overlay and paged feed`.

---

### Task 4: Route, root layout, Home entry, transition

**Files:** create `app/reels.tsx`; modify `app/_layout.tsx` (`<Stack.Screen name="reels" options={{ animation: "fade" }} />`), `components/home/home-feed.tsx` (previews are `Pressable`s that call `onOpenReel(id)`; the inline loop keeps playing; no `LoopStage` on Home), `app/(tabs)/index.tsx` (`setReelHandoff` + `router.push("/reels?start=<id>")`); tests `tests/ui-reels.test.ts` (static contracts), adjust `tests/ui-home.test.ts` and `tests/ui-apple-design.test.ts`.

Route behaviour: `takeReelHandoff()` on first render; fallback `homeReelItems(latest, ANONYMOUS_POSE_REFERENCES)`; `initialReelIndex(items, params.start)`; `useFocusEffect` → `focused`; `useAppStateStatus`; `useReduceMotion`; `useWindowDimensions` for the viewport; entry animation opacity 0 → 1, scale 0.94 → 1, 220 ms, none under Reduce Motion; close → `router.back()` or `router.replace("/")`; analysis → `router.push("/private-analysis/<id>")`.

- [ ] Step 1: `tests/ui-reels.test.ts` RED: `app/reels.tsx` exists and `app/(tabs)/reels.tsx` does not; root layout registers `name="reels"`; route uses `useFocusEffect`, `takeReelHandoff(`, `initialReelIndex(`, `router.back()`, `/private-analysis/`; Home feed contains `onOpenReel(` and no `<LoopStage`; Home route contains `setReelHandoff(` and `"/reels?start=`; reels components never import `SequenceViewer` as a component (`import { SequenceViewer` absent) and never contain fake-social strings; overlay's indicator is conditional on `paused`; no `<Tabs` in the route.
- [ ] Step 2: implement; adjust `ui-home` (still `<SkeletonLoop`, add `onOpenReel`), `ui-apple-design` (loop-as-post list: drop `home-feed`, keep `profile-hero`, `quality-summary`; add reels files to `REDESIGNED`).
- [ ] Step 3: GREEN, `check`, `lint`. Commit — `feat(reels): open full-screen Reels from Home and return to it`.

---

### Task 5: Preview demo states and production isolation

**Files:** modify `lib/dev/ui-demo-fixtures.ts` (add `reels: ReelItem[]`: the fixture profile reel + the anonymous references), `app/dev/ui-demo.tsx` (`screen=reels`, states `playing`, `paused`, `next`, `analysis-entry`), `tests/ui-demo-isolation.test.ts` (fixture test asserts `demo.reels[0].kind === "profile"`), `tests/ui-reels.test.ts` (route handles the four states).

- [ ] RED → implement → GREEN; `corepack pnpm vitest run tests/ui-web-preview.test.ts tests/ui-demo-isolation.test.ts tests/ui-pages-preview-routing.test.ts`; production export grep for fixture strings = none. Commit — `feat(preview): add Reels demo states to the install-free preview`.

---

### Task 6: Visual QA at 375 / 390 / 430

Export with the preview flag (`EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD=1 corepack pnpm exec expo export --platform web --output-dir <scratch>/reels-preview-dist`), serve statically, Playwright captures to `artifacts/reels-v1/<state>-<width>.png`: `reels-playing`, `reels-paused`, `reels-next`, `reels-analysis-entry`, `home-ready` (entry surface) at 375; `reels-playing` and `reels-paused` also at 390 and 430. Review each for the spec's checklist; fix in the owning component; record in `docs/uiux/2026-09-16-reels-v1-visual-qa.md`. Commit — `chore(reels): add the visual QA evidence`.

---

### Task 7: Status docs, fresh verification, push, PR

- `docs/IMPLEMENTATION_STATUS.md` and `HANDOFF.md` entries.
- Fresh: `check`, `lint`, `test:unit`, `test:rules` (portable JRE), production `expo export`, preview suites, Representative 4D suites, diff safety audit (`git diff --stat origin/main -- lib/shooting-profile lib/feature-flags.ts lib/firebase-shooting-profiles.ts lib/firebase-shooting-profile-contract.ts firestore.rules modules contracts ml hooks/use-shooting-profile-capture.ts` → empty).
- `git push -u origin work/hoophub-reels-v1`; open a PR (no merge); read CI.
- Final report per spec.
