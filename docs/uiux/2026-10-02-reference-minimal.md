# Reference library: content-first cleanup

## Intent and accepted direction

The owner requested simplification starting at the `/library` screen and asked to proceed with development using the prior Instagram/social UI research. The prior local design record, `docs/uiux/2026-09-06-screen-inventory-and-visual-directions.md` in the original `feat/uiux-skeleton-social-redesign` checkout, sections 4.6–4.7, already established: a large skeleton stage, short caption, one top bar, details one tap away, stage-tap playback, system typography, and a release still for reduced motion. That document is absent from the current deployed preview branch; this record carries the relevant decision forward.

This is a bounded UI change based on deployed-preview commit `23f1af9`. It does not finish or absorb the uncommitted Liquid UI integration in another checkout.

## Research and verification

Official source checked on 2026-10-02:

- [Instagram, 2016-05-11](https://about.fb.com/ja/news/2016/05/instagram_newlook/), article paragraphs at lines 208 and 218: simplified in-app UI to foreground photos/videos while preserving navigation/features. **Confirmed**.
- [Instagram, 2023-11-15](https://about.fb.com/news/2023/11/new-ways-to-create-content-on-instagram/): simplified posting to make editing tools easier to find. **Confirmed**.

The load-bearing historical claims are 2/2 confirmed from primary sources. The application to this shooting library is a design judgment, not evidence that copying social UI improves coaching outcomes. Countercheck: simplification must not remove attribution, measurement boundaries, source traceability, or discoverable controls. Keep short attribution visible and full evidence behind a labeled disclosure.

## Implementation

- Following the owner's Reels sketch, fill the tab scene with one motion stage, a small “참조 동작” heading and a bottom caption. Remove the oversized audit headline, repeated English eyebrows, approval count and nested bordered cards.
- Place heart, personal note and motion-information icons vertically on the right, each with a 48-point target. Likes and notes persist only on this device; do not imply public counts or community comments. Storage failures remain visible and an explicit read retry preserves previously stored values.
- Move camera presets and reset behind the top-right camera icon. A thin bottom phase track retains individually labeled 48-point phase targets and a current-phase caption. Stage tap toggles playback.
- Notes and full motion information open in dismissible bottom sheets. Suspend playback while a sheet is open, the tab loses focus, or the application is backgrounded. Resume the user's playback intent on return.
- Default resting pose is the release phase; playback starts on explicit intent. The whole stage is also a playback target; the existing pan responder claims drags/pinches.
- Compute a stable display viewport over all sequence frames and preset views so default framing includes the complete body throughout playback. Do not move source joints or alter interpolation/projection functions.
- Short attribution remains visible. “동작 정보” reveals the existing attribution, optical measurement boundary, interpolation explanation, original C3D frame numbers and gesture help.
- Preserve recommendation routing, anonymous approved references, and the full evidence UI for existing noncompact viewer callers.
- Empty library gets a simple preparation message. Native selected/expanded states and explicit web ARIA states are supplied. Compact text uses existing system typography and semantic colors.

## Acceptance and verification

Render tests cover disclosure open/close, provenance and source frames, phase selection, play/pause, full-stage playback, assessment routing, reduced-motion release still, uncut default framing, and noncompact evidence preservation. Verification includes typecheck, lint, hermetic unit tests, Expo web export and actual browser inspection at desktop/mobile widths. Native pinch/drag and screen-reader behavior still need a physical-device check.

Final Reels revision: 10 focused render tests passed; full hermetic suite 883 passed, 1 skipped; typecheck, zero-warning lint and Expo web export passed. An independent review found a failed-read recovery gap, corrected and verified by restoring existing liked/note values after retry. Browser inspection covered narrow and default viewports and sheet interactions. Normalize the working-copy lockfile to LF for the existing LF-only regex test; restore it before committing. Final CI results are recorded in the PR.
