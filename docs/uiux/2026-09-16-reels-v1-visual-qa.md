# Reels v1 — visual QA record (2026-09-16)

Branch `work/hoophub-reels-v1`. Every image under `artifacts/reels-v1/` is a capture of the real
implementation rendered from the install-free preview build (a production static export with the
explicit preview-build gate), never a mock.

## Method

1. Export the preview build exactly as the Pages workflow does, minus the base path:

   ```
   EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD=1 corepack pnpm exec expo export --platform web --output-dir <scratch>/reels-preview-dist
   ```

   22 static routes, `/reels` and `/dev/ui-demo` among them.
2. Serve the export statically and drive Chromium through Playwright at 375×812, 390×844 and
   430×932 CSS pixels.
3. `screen=reels&state=…` renders the real `ReelsFeed` from the synthetic fixture profile and the
   anonymous reference (`lib/dev/ui-demo-fixtures.ts`, `reels`). The Home capture is the real
   `HomeFeed` in its ready state, the surface the Reels are entered from.
4. Two interaction captures at 375: a click on the stage (pause), a second click (resume, not
   photographed), then a one-viewport wheel scroll (snap to the next item). The script also read
   the active item's accessibility label at each step.

## Captures

| File stem | What it shows | Widths |
| --- | --- | --- |
| `home-ready` | Home with the two previews that open Reels on tap | 375 |
| `reels-playing` | Active profile Reel autoplaying: close, view chips, caption, `분석`, progress line | 375 · 390 · 430 |
| `reels-paused` | The same Reel paused: the only added chrome is the centred play indicator | 375 · 390 · 430 |
| `reels-next` | The reference Reel active (index 1): no `분석` action, attribution in the a11y name | 375 |
| `reels-analysis-entry` | The profile Reel paused on the frame the analysis action opens from | 375 |
| `reels-tap-paused` | After one click on the stage: paused, indicator shown | 375 |
| `reels-swiped` | After one viewport of scroll: the next Reel is active and playing | 375 |

Interaction log (accessibility label of the active item): `내 슛폼 릴, 1/2, 재생 중` → click →
`내 슛폼 릴, 1/2, 일시정지됨` → click → `내 슛폼 릴, 1/2, 재생 중` → one-viewport scroll →
`MOTION 01 참조 릴, CMU optical mocap, 2/2, 재생 중`, list `scrollTop` = 812 (exactly one item).
Exactly one `reel-stage-active` existed in every capture.

## Findings and fixes

Checked on every capture: skeleton size, safe areas, chrome near the notch, the gap between the
home indicator and the progress line, overlay vs skeleton collisions, the pause icon, the view
selector, the analysis action, vertical snap, next/previous, and the Home → Reel entry.

| Screen | Width | Issue | Fix | Commit |
| --- | --- | --- | --- | --- |
| Reels · next (reference) | 375 | The figure's feet and ground line ran through the caption because the stage fit used the whole viewport height. | The item stays the full viewport (tap surface), but the figure is fitted below the top controls (`REEL_STAGE_TOP`) and above a 96-point bottom band (`REEL_STAGE_BOTTOM`) that holds the caption, the action and the progress line; the render test pins both. | `986838a` |

No other finding. 390 and 430 scale the same layout: the chips stay small at the top-right, the
close affordance at the top-left, the indicator centred, the caption and `분석` in the bottom band
and the progress line along the bottom edge above the inset.

## Environment notes (not product defects)

- The static export logs React error #418 (hydration mismatch) on the demo route, as it does on
  the other routes of the Pages preview (a static render vs client-tree difference in expo-router's
  web output). The client regenerates the tree; the captures are the client render.
- The browser has no home-indicator inset, so the progress line sits 8 points above the bottom
  edge in the captures; on device it sits above the inset. Dynamic Island/notch clearance follows
  the top inset the same way.
- Production-isolation check, local trap: in a worktree that has already run a preview export,
  Metro's file-system transform cache keeps the transform in which
  `EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD` was inlined as `"1"`, so a later plain export appears to
  carry the fixtures. `expo export --platform web --clear` with both demo variables set to `"0"`
  (what the Pages workflow does on a fresh runner) produced 22 routes and no
  `demo-fixture-` / `demo_fixture_recapture` / `syntheticLandmarkSession` string anywhere.

## What the captures cannot show

- The entry animation (scale 0.94 → 1 with a fade, 220 ms, skipped under Reduce Motion) and the
  swipe deceleration: verified by the render and route contracts, to be felt on device.
- Reduce Motion, app background and the return from Analysis: covered by
  `tests/reels-render.test.tsx` and `tests/ui-reels.test.ts` (no autoplay under Reduce Motion, a
  tap plays; background or an unfocused screen holds the frame; the route stays mounted under
  Analysis so the same Reel and frame return).
