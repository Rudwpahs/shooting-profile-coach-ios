# Hoop Hub Reels v1 — specification (owner order of 2026-09-16)

Source of truth: `main` @ `2ebf1d2` (UI v1, B2-C coach stack and the install-free Pages preview are
already merged). Branch `work/hoophub-reels-v1`, cut from that head. No commit to `main`, no merge
without the owner.

## Goal

> 스켈레톤 기반 Hoop Hub라는 정체성은 그대로인데, 릴스를 열고 보고 멈추고 위아래로 넘기는 조작은
> Instagram Reels처럼 거의 생각 없이 사용할 수 있어야 한다.

Interaction model ≈ Instagram Reels. Visual identity = Hoop Hub (Graphite / Volt, skeleton
identity, system typography, semantic tokens). No Instagram logo, assets or trade dress.

## Earlier harness

`origin/work/claude-hoop-hub-product-ui` holds a Reel harness (C1). It is a reference
implementation only: the useful concepts (paged `FlatList`, viewability-driven active index, ±1
neighbour media, adjustable accessibility actions, stage fit helpers) are ported selectively onto
current `main` with tests rewritten against `main`. The branch is never merged wholesale.

## P0

- **Home → Reels.** Tapping the Home preview of a motion opens full-screen Reels immediately, at
  the selected item. No detail screen, no "fullscreen" button.
- **Full-screen Reel.** One item per viewport; the tab bar and normal top chrome are hidden; safe
  areas are kept; the skeleton is the protagonist.
- **Playback.** The active Reel autoplays. One tap pauses; the next tap resumes from the current
  frame. No persistent play/pause button; a play indicator shows only while paused.
- **Loop.** The 101-frame motion loops 100 → 0 without changing the representative data.
- **Vertical paging.** Swipe up = next, swipe down = previous; exactly one item per swipe, never a
  rest between items. On index change the old Reel pauses at once and the new one autoplays; two
  Reels never animate at the same time.
- **Progress.** A very thin progress indicator at the bottom showing the current frame's progress.
  Scrubbing may be deferred to P2.
- **Exit.** Back, the iOS navigation gesture, or a close affordance ends Reels and returns to the
  Home position it was entered from; at minimum the active Reel index is preserved.

## P1 (same branch)

- **View selector.** The current virtual views 정면 · 사선 · 측면 as a small chip overlay, not a
  main player control. Virtual display yaw is never confused with the capture camera yaw; the
  capture protocol is untouched.
- **Analysis action.** A small `분석` action on a Reel that opens the existing analysis route for
  that profile. Reels → Analysis → back → the same Reel; ideally the same frame, at minimum the
  same index.

## Out of scope / forbidden

Fake likes, comments, follower or share counts, users, DMs, saved counts, or any control that
looks social but does nothing. Lift Subject is not implemented (no rembg, segment-anything, iOS
Vision, dependencies, models or runtimes); the stage's layer order only leaves room for it. Motion
Lift (the existing skeleton gesture) and Lift Subject (background separation) are distinct terms.

## Transition

Avoid a "pop" into a separate page. Preferred: the Home preview grows into the full-screen stage.
If that needs shared-element infrastructure, use a stable scale/fade transition instead. Priority:
immediate response, same item, autoplay continuity, gesture stability.

## Instagram-equivalent controls (must feel identical)

Tap = pause/resume · swipe up = next · swipe down = previous · enter = selected Reel full-screen +
autoplay · leave = current Reel pauses · return = same Reel/index restored · chrome hidden during
full-screen consumption · only the active item plays.

## Accessibility

Keep VoiceOver, adjustable actions, Reduce Motion and app background handling from the C1 harness.
Reduce Motion users are never forced into autoplay. An explicit pause survives a return to the
foreground.

## Performance

Render and prepare only the current item and its two neighbours. Offscreen Reels do not animate.
The 101-frame projection never runs for several Reels at once. Check for needless re-renders.

## Architecture

Do not grow `SequenceViewer`. Separate the analysis viewer from the Reels player under
`components/reels/` (feed, item, motion player, overlay, progress). Reuse the existing
projection/frame helpers; never duplicate the maths.

## TDD (minimum RED → GREEN targets)

Playback: active Reel autoplays; first tap pauses; second tap resumes; a paused Reel holds its
frame; the last frame loops to zero. Paging: swipe next → index + 1; swipe previous → index − 1;
the old Reel stops; the new one starts; only the active Reel plays. Navigation: Home item → the
right Reel; Reels → Analysis → back → same Reel; Reels exit → previous Home context. Lifecycle:
background → pause; explicit pause survives foreground; Reduce Motion disables autoplay. UI
contract: no bottom tab on the full-screen route; no persistent giant play button; a progress
indicator exists; no fake like/comment/follow UI; exactly one active item per viewport.

## Preview

Use the install-free GitHub Pages preview as is. Add demo states `screen=reels&state=playing`,
`paused`, and if possible `next`, `analysis-entry`. Synthetic fixtures exist only in the preview
build; the production-isolation test stays.

## Visual QA

375, 390 and 430 points, rendered for real: skeleton size, safe area, chrome near the Dynamic
Island/notch, gap between the home indicator and the progress line, overlay vs skeleton
collisions, pause icon, view selector, analysis action, vertical snap, next/previous transition,
Home → Reel transition.

## Protected areas (no change; stop and report if a change seems required)

Reconstruction math · 3D fusion · analysis thresholds · capture acceptance · camera yaw protocol ·
MotionPacket · Coach API · Firestore rules (unless required) · privacy contracts · feature rollout
gates.

## Acceptance

1. Home preview tap → the selected Reel full-screen. 2. Autoplay on entry. 3. Single tap pauses.
4. Second tap resumes. 5. Swipe up/down snaps one item. 6. Inactive Reels do not play. 7. Last
frame loops naturally. 8. No tab bar in full-screen Reels. 9. Progress indicator present. 10. View
selector works. 11. Analysis reachable. 12. Back from Analysis → the same Reel. 13. Reels exit →
Home context. 14. Reduce Motion protection kept. 15. No background playback. 16. No fake social
controls. 17. No synthetic-fixture leak into production. 18. 375/390/430 visual QA done.

Fresh verification: typecheck, lint, full unit suite, Firestore Rules, Representative 4D
regressions, Expo web export, preview-specific tests, GitHub CI, all green.

## Documentation

The six-repository open-source review is the first documentation commit
(`docs/uiux/2026-09-16-reels-open-source-review.md`): exact repository, inspected files, license,
adopted idea, rejected idea, direct code reuse. Unlicensed clones are idea/reference only; GPL
sources are never copied.

## Final report

Branch · HEAD · implementation summary · what was actually taken from the old product-ui harness ·
what is new · test evidence · visual QA · preview URL · remaining limitations · PR URL. A PR may be
opened; merging is forbidden.
