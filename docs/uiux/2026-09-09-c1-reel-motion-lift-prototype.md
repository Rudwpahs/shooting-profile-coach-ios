# C1 — Reel shell and Motion Lift prototypes

Date: 2026-09-09 · Lane: `work/claude-hoop-hub-product-ui` · Base: `d00048d` (PR #5 head)

Status: **stable, stopped at the C1 Gate.** The lane now waits for the system/AI lane to freeze
`CoachRequestV1` / `CoachResponseV1`, `MotionPacketV1`, the provider-facing shape and the
`CoachFeedEventV1` direction. Nothing here touches `app/(tabs)/index.tsx`, `contracts/**`,
`lib/coach/**`, persistence, `package.json`, the lockfile or `app.config.ts`.

## 1. Where to look

| What | Where |
| --- | --- |
| Harness route | `app/dev/reel-lab.tsx` (dev only; fixture data; the trailing badge reads `fixture · <phase>[ · saved n]`) |
| Reel shell | `components/feed/reel-feed.tsx`, `reel-item.tsx`, `reel-stage.tsx`, `reel-stage-fit.ts`, `reel-chrome.tsx` |
| Motion Lift | `lib/feed/motion-lift-state.ts` (pure machine), `components/feed/motion-lift-layer.tsx` (gesture + affordance) |
| View model / fixtures | `lib/feed/reel-model.ts`, `lib/feed/reel-feed-state.ts`, `lib/feed/reel-fixtures.ts` |
| Continuous yaw | `projectRepresentativeJointsAtYaw` in `components/shooting-profile/sequence-viewer.tsx`; `representativeGlyphAtYaw` / `representativeViewYaw` in `components/skeleton/representative-glyph.ts`; `yaw` option and `poseMotionViewYaw` in `lib/skeleton/pose-motion-glyph.ts` |
| Loops | `bounds` override on `SkeletonLoop` and `PoseMotionLoop` so the loop and the stills share one fit |
| Reduce Motion | `hooks/use-reduce-motion.ts` |
| Tests | `tests/reel-feed-state.test.ts`, `reel-fixtures.test.ts`, `reel-feed-render.test.tsx`, `motion-lift-state.test.ts`, `motion-lift-emergence.test.tsx`, `representative-yaw.test.ts` |

## 2. Reel shell (C1-A) as built

| Requirement | Implementation |
| --- | --- |
| One full-height item per viewport | `FlatList` with `pagingEnabled`, `snapToInterval = viewport height`, `getItemLayout`; the harness measures the viewport with `onLayout` and renders nothing until it is known |
| Only the active item plays | `reelMediaRole(index, activeIndex)`: `active` mounts the loop, `adjacent` (±1) holds the release still, `idle` holds nothing; `windowSize 3`, `initialNumToRender 1`, `removeClippedSubviews` |
| Tap = pause / resume | The stage is one `Pressable`; `toggle-playback` in the feed reducer; pause is per item and clears when the item changes |
| Vertical swipe = next / previous | Native paging; the active index settles through `onViewableItemsChanged` (60 % threshold) and `onMomentumScrollEnd` through the same `settle` transition |
| UserReel / CoachReel / ReferenceReel | One shell, three `ReelItem` kinds; the coach kind shows the accent dot, `코치 · <observation>` label and one `headline` message; nothing else |
| Minimal chrome, centre unobstructed | Stage height = viewport − 96 pt caption band; the icon rail (44 pt buttons, 56 pt column) sits in the bottom-right; the pause mark is a 44 pt disc in the top-right corner |
| VoiceOver equivalents | The item is an `adjustable` element: `activate` toggles playback, `increment` / `decrement` move to the next / previous Reel; label = name, position, state, line; `aria-valuetext` twin for web |
| Reduced motion | Programmatic navigation is unanimated; the loops keep their existing Reduce Motion hold |
| CoachReel first surface | Dominant skeleton, one short message, no dashboard (tests assert no digits or `%` in the chrome) |

## 3. Motion Lift (C1-B) as built

Phases: `idle → pending → grabbed ⇄ save_armed → settling → idle`.

| Event | From | To | Effects |
| --- | --- | --- | --- |
| press (paused) | idle / settling | pending | — (a playing Reel ignores the press: the layer only exists while paused) |
| move ≤ 10 pt before the hold | pending | pending | — |
| move > 10 pt before the hold | pending | idle | gesture **fails** → the feed scroll wins |
| hold elapsed (320 ms) | pending | grabbed | lock scroll, haptic `grab` (medium impact) |
| release before the hold | pending | idle | `tap` → the Reel resumes |
| move while held | grabbed / save_armed | same | yaw = base + dx × 0.32°, wrapped to (−180, 180] |
| dy ≤ −56 pt | grabbed | save_armed | haptic `arm` (selection), once |
| dy > −40 pt | save_armed | grabbed | — (hysteresis, no haptic) |
| release | grabbed | settling | unlock scroll; the turned pose stays |
| release | save_armed | settling | `save { yaw }`, haptic `save` (success), unlock scroll, tiny check for 1.2 s |
| settle elapsed (260 ms, 0 under Reduce Motion) | settling | idle | — |
| resume / swipe / unmount | any | idle | unlock scroll; lift yaw resets |

Visuals: during the hold the ground darkens (a `background`-coloured overlay), the figure scales
1 → 1.04 and a soft `primarySoft` halo appears behind it; the save affordance is a 32 pt bookmark
pill at the top-centre of the stage that fades in with upward travel and turns solid Volt when
armed. Under Reduce Motion there is no in-between: the grab appears at once and the settle is
immediate; haptics and state semantics are unchanged.

## 4. Decisions worth knowing

1. **Manual activation, not `activateAfterLongPress`.** `Gesture.Pan().manualActivation(true)` with a
   JavaScript hold timer; the layer calls `fail()` when the pre-hold movement exceeds 10 pt (below the
   iOS scroll slop) and `activate()` on the first move after the grab. `activateAfterLongPress` would
   also activate the pan on early movement and steal the scroll from a jittery thumb.
2. **One renderer, one fit.** The stage draws the figure (loop, neighbour still, or lifted still at the
   held yaw); the layer only captures touches and draws the affordance. `buildReelStageFit` unions the
   loop bounds with the release still at twelve yaws, so the figure never jumps when the loop pauses,
   when the hold begins or while it turns.
3. **The rotate reuses the viewer maths.** `projectRepresentativeJoints` now delegates to
   `projectRepresentativeJointsAtYaw`; the presets are named yaws of it (`tests/representative-yaw.test.ts`
   pins equality for both hands). The reference glyph takes the same `yaw` override.
4. **Scroll lock is belt and braces.** The grabbed state sets `scrollEnabled={false}` on the list and
   the gesture also activates; a new active index always unlocks.
5. **The layer owns the tap while paused.** It sits above the `Pressable`, so a release before the hold
   emits `tap` and the Pressable is never double-toggled; VoiceOver still uses the Pressable actions
   because the layer is hidden from assistive technology.
6. **No new dependency, no native segmentation.** RNGH, Reanimated (unused so far), react-native-svg
   and expo-haptics were already installed; the lift decoration uses `Animated` from React Native.

## 5. Verification (2026-09-09, lane worktree)

- `pnpm check`: 0 errors. `pnpm lint`: 0 problems.
- `pnpm test:unit`: 572 passed, 1 skipped, 1 failed. The failure is
  `tests/pose-detection-v2-contract.test.ts` (lockfile regex) and occurs only on a CRLF working copy;
  the same test passes 56/56 against the LF lockfile from the git blob, as it does in CI.
- New suites: reel-feed-state 7, reel-fixtures 6, reel-feed-render 10, motion-lift-state 12,
  motion-lift-emergence 2, representative-yaw 6 (43 tests).
- `expo export --platform web`: 21 static routes including `/dev/reel-lab`.
- Web export interaction check (Chromium, 375 × 760): tap pause / resume ✓; hold → `grabbed` ✓ (mouse
  and pen pointers); sideways drag → turned still ✓; upward drag → `save_armed` ✓; release → saved,
  check mark, badge `saved 1`, turned pose kept ✓; one-viewport scroll → the coach Reel becomes active
  and the previous one becomes a still ✓; only the ±1 neighbour holds media ✓.
- Not verifiable on the web export: touch-type synthetic pointer events (RNGH web ignores them),
  haptics (`navigator.vibrate` is blocked without a user gesture), and the `Animated` emergence while
  the preview pane is hidden (animation frames pause). The emergence is covered by
  `tests/motion-lift-emergence.test.tsx` with fake timers.
- Pre-existing, not introduced here: the static export logs React #418 (hydration mismatch) on
  `/dev/reel-lab` **and** on `/` (Home at the PR #5 base).

## 6. Device QA (C5) this prototype can already answer

Run on a physical iPhone with the development build, `/dev/reel-lab`:

1. Hold with a resting thumb for 320 ms without moving: expect one haptic and the badge `grabbed`; the feed must not scroll during the hold.
2. Hold, then drag sideways 100 pt: the figure turns continuously; the list must not move.
3. Hold, drag up 60 pt: the bookmark turns solid with one distinct haptic; drag back down 20 pt: it dims without a haptic.
4. Release while armed: check mark for about a second, badge `saved n`; release while not armed: nothing saved, pose kept.
5. Start a swipe within 10 pt of movement before 320 ms: the feed pages, no grab, no haptic.
6. Grab, then let the app go to the background: the lock must be released on return.
7. VoiceOver: the item reads name, position, state and line; double-tap toggles; swipe up / down moves between Reels; the hold layer is not focusable.
8. Reduce Motion on: no gradual dim; grab and settle are instant; haptics unchanged.
9. Compact height (iPhone SE class): the caption band must not push the rail over the figure.

Record exact commit, device, iOS, build flags, gesture false cancels and any visible hitch.

## 7. After the gate — what changes and what stays

| Frozen shape | Adaptation | Stays |
| --- | --- | --- |
| `CoachFeedEventV1` | one adapter `lib/feed/adapters` → `CoachReel { message, observationLabel }`; eligible events only, count may be zero | `ReelItem` kinds, chrome, tests |
| `MotionPacketV1` | adapter → `ReelMotion` (a decoded packet becomes the representative-shaped source); no second packet format | `buildReelStageFit`, loops, lift |
| Provider shape | `ReelFeed.items` fed by the provider in C2; harness keeps fixtures | reducer, media window, VoiceOver actions |
| `SavedReel` | `onSave({ itemId, yaw })` becomes the saved-moment call; reopen restores `liftYaw` | machine, affordance |
| `CoachResponseV1.primary_visual_cue` | `observationLabel` resolves from `observation_id` (C4), never from model text | text-only fallback |

Contract change requests: none.
