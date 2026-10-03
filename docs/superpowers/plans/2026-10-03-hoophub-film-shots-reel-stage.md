# One player UI everywhere, and only real footage plus the reference

> **For agentic workers:** execute task by task with superpowers:test-driven-development. Steps use checkbox syntax.

**Goal:** every full-screen skeleton player (Explore, Reels, 참조 동작, analysis) uses the 참조 동작 stage UI (big stage, heart · memo · info rail, caption, phase dots, camera icon, tap to play); the synthetic shot library is removed; the owner's two real shots are kept as device-local film shots next to the CMU reference.

**Owner decisions (2026-10-03):** keep the two real video pairs as "내 슛폼 1·2" whose media is Film (there is no skeleton for them: the two-view pipeline rejected the side clips as filmed from the wrong side, and the web preview runs no pose analysis); delete all 24 synthetic forms; keep 참조 동작; apply the stage UI to every full-screen player, not to Profile hero or Home cards.

**Boundaries that still hold:** raw footage never enters Git, PR, CI or any server; the preview runtime never touches storage or Firebase directly; no production contract (Firestore schema, `RepresentativePose4DV2`, `ShootingProfileSummaryV2`) changes; a bone that lies horizontal in both views cannot be solved, so nothing synthesises motion for footage.

**Architecture:**
- *Film shots* are a device-local product concept: a capture session whose slots hold footage but no accepted pose ends in `film_review` and saves a `FilmShotV1` (AsyncStorage index + the existing local film association). On the web the picked `File` is kept in IndexedDB so the shot survives a reload; nothing is uploaded.
- *Reel items* gain a `film` kind. The Reels feed renders film media (the Film Space viewer) where it renders a skeleton for profile and reference items.
- *One chrome:* `components/reels/reel-overlay.tsx` becomes the 참조 동작 chrome (rail, caption, phase dots, camera menu, sheets, device-local like/memo). `ReelItem` uses it for Explore, Reels, 참조 동작 (`/library` becomes a one-item feed) and the analysis route (a one-item feed whose info sheet holds Phase/Film, the numbers and the evidence). The old `ReelOverlay` chips, the minimal-analysis component and the `presentation` param go away.
- *Preview:* no synthetic profiles. The capture flow in the browser keeps footage as a film shot; Profile lists film shots as film tiles; Home shows them in the story strip; Explore shows the reference only.

---

### Task A: film-only capture states (reducer + view)

Files: `lib/shooting-profile/capture-session-reducer.ts`, `components/shooting-profile/capture-session.tsx`, `components/shooting-profile/capture-slot-card.tsx`; tests `tests/capture-film-only.test.ts`.

- [ ] RED: `SLOT_FILM_ACCEPTED` marks a slot accepted with `evidence: "film"` and no sequence; all slots accepted with any film evidence → `film_review`; `SAVE_STARTED` from `film_review`; `SAVE_FAILED` recovers to `film_review`; retake returns to collecting; `RETRY_SESSION` after cancel returns to `film_review`.
- [ ] GREEN: reducer; `STEP_TITLES.film_review`; film review panel ("영상은 이 기기에만 보관 · 포즈 분석 없음" + primary action); slot card status "영상 보관".
- [ ] Commit.

### Task B: film shots store and web persistence

Files: `lib/film-space/film-shots.ts`, `lib/film-space/web-local-video-store.ts`, `lib/film-space/web-local-video.ts` (+`blob`), `lib/film-space/web-local-video-picker.ts`; tests `tests/film-shots.test.ts`, `tests/web-local-video-store.test.ts`.

- [ ] RED/GREEN: `listFilmShots`, `saveFilmShot`, `deleteFilmShot` (opaque ids, newest first, index + per-shot record + association); web blob store behind an injectable port; `restoreFilmShotClips` rebuilds object URLs on the web and drops clips whose blob is gone.
- [ ] Commit.

### Task C: `film` reel kind and sources

Files: `lib/reels/reel-model.ts`, `lib/reels/reel-sources.ts`, `lib/reels/reel-playback.ts`, `components/reels/reel-motion-player.tsx`, new `components/reels/reel-film-media.tsx`; tests `tests/reel-model.test.ts`.

- [ ] RED/GREEN: `FilmReel`; `homeReelItems(latest, references, filmShots)` order: my profile, my film shots (newest first), references; titles/lines/accessibility names; `reelStartFrame(film) = 0`.
- [ ] Commit.

### Task D: the 참조 동작 chrome for every player

Files: `components/reels/reel-overlay.tsx` (rewritten), `hooks/use-device-reactions.ts`, `components/reels/reel-sheets.tsx`, `components/reels/reel-item.tsx`, `components/reels/reels-feed.tsx`, `components/reels/reel-motion-player.tsx` (seek), `app/(tabs)/library.tsx`, `app/(tabs)/explore.tsx`, `app/reels.tsx`, `app/private-analysis/[id].tsx`, `components/shooting-profile/shot-inspection-viewer.tsx` (Phase/Film only), `lib/shooting-profile/shot-inspection.ts`, `lib/shooting-profile/analysis-presentation.ts` (title/href only); remove `components/analysis/minimal-analysis.tsx`; tests `tests/reels-render.test.tsx`, `tests/reference-library-render.test.tsx`, `tests/analysis-stage-render.test.tsx`, `tests/ui-reels.test.ts`, `tests/liquid-screen-rollout.test.ts`, `tests/ui-apple-design.test.ts`, `tests/analysis-presentation.test.ts`.

- [ ] RED/GREEN per surface. Chrome contract: heading (optional) top-left, camera menu top-right (skeleton media only), rail heart/memo/info (48-pt), caption title + attribution + current phase, five phase markers that seek and hold, play hint while paused, sheets suspend playback, like/memo device-local with honest copy, info sheet body supplied by the surface.
- [ ] Commit.

### Task E: remove the synthetic library; film shots on Profile, Home, Reels

Files: delete `lib/preview/preview-shot-library.ts`, `lib/preview/preview-explore-motions.ts`, `tests/preview-shot-library.test.ts`, `tests/preview-shot-surfaces.test.ts`; `lib/preview/preview-runtime.ts`, `lib/preview/preview-shooting-profile-source.ts`, `lib/preview/preview-capture-machine.ts`, `lib/preview/preview-capture-session.tsx`, `app/private-capture.tsx`, `lib/explore-source.ts` (no gate), `app/private-analysis/[id].tsx` (no static params gate), `components/profile/motion-grid.tsx` (film tiles), `app/(tabs)/profile.tsx`, `app/(tabs)/index.tsx`, `components/home/home-feed.tsx`, `hooks/use-film-shots.ts`, `.github/workflows/ui-web-preview-pages.yml`; tests `tests/preview-film-shots.test.ts`, `tests/preview-capture-controller.test.ts`, `tests/preview-shooting-profile-source.test.ts`, `tests/preview-runtime-isolation.test.ts`, `tests/ui-render.test.tsx`.

- [ ] RED/GREEN. Preview capture: picks become film evidence, save creates a film shot, completion opens Reels at it. Profile grid: film tiles open Reels. Home: film shot stories. Isolation: production export grep 0 hits; preview export pages exist.
- [ ] Commit.

### Task F: verification, PR, merge

- [ ] `corepack pnpm check`, `lint`, `test:unit`; production isolation export; preview export; Pages deploy; public QA (참조 동작 chrome on Explore/Reels/library/analysis; upload one real pair → film shot appears on Profile/Home and plays as Film in Reels; reload keeps it; no synthetic forms anywhere; console errors 0); PR → main (merge commit); post-merge verification.
