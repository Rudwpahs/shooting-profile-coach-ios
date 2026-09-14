# Hoop Hub UI v1 Final — Phase 1 audit (latest `main` vs PR #5)

Date: 2026-09-15 · Branch: `work/hoophub-ui-v1-final` · Base: `main` @ `c9da820` (Merge PR #11, rollout gate)
Design donor: PR #5 `feat/uiux-skeleton-social-redesign` @ `d00048d` (draft, `MERGEABLE`, base `075efaa`)

This audit was done on the actual repository state, not on handoff text. It answers the four questions
Phase 1 asks: what from PR #5 is reusable, what is obsolete, where the two sides conflict, and which
latest-`main` behaviours must win.

## 1. What moved on `main` since PR #5 branched

`git diff --stat 075efaa origin/main` touches exactly four files, none of them UI:

| File | Change |
| --- | --- |
| `lib/feature-flags.ts` | `resolveFormPathFlags` — build-scoped Representative V2 rollout gate. Every V2 surface stays `false` unless all three flags are requested **and** a valid `ReleaseValidationCertificateV1` matches the build commit. |
| `lib/shooting-profile/release-gate.ts` | `assessRepresentativeRolloutGate` and the certificate contract. |
| `tests/feature-flags-release-gate.test.ts` | Pins the gate (fails closed on partial flags, missing/invalid certificate, commit mismatch). |
| `docs/representative-v2-rollout-gate.md` | Operational sequence and the trust boundary statement. |

PR #4 (`feat/p1-real-video-validation`) is still **unmerged**. The capture flow on `main` therefore has
no evaluation panel, no `captureSource` provenance and no consent record; PR #5's PR #4 integration plan
does not apply to this branch and is not carried over.

Consequence: PR #5's UI concepts port onto `main` with no file-level conflicts. The semantic constraint is
that nothing in `lib/feature-flags.ts`, `lib/shooting-profile/*`, `lib/firebase-*`, `firestore.rules`,
`modules/formpath-pose/*` or `hooks/use-shooting-profile-capture.ts` changes.

## 2. Reusable from PR #5 (ported, then adapted where noted)

| Area | Files | Verdict |
| --- | --- | --- |
| Tokens | `theme.config.js` (23 semantic swatches, Graphite / Volt dark), `theme.config.d.ts`, `constants/tokens.ts`, `lib/_core/theme.ts`, `lib/theme-provider.tsx` (dark commitment), `app.config.ts` `userInterfaceStyle: "dark"`, tailwind class renames in `app/dev/theme-lab.tsx` and `app/oauth/callback.tsx` | Port as-is. `tests/ui-tokens.test.ts` pins the set, WCAG pairs, zero colour literals under `app/` and `components/`, and the dark commitment. |
| Typography | `constants/typography.ts` (system font, nine roles) | Port as-is. `tests/ui-apple-design.test.ts` pins it. |
| Skeleton primitives | `lib/skeleton/pose-motion-glyph.ts`, `components/skeleton/{skeleton-glyph,skeleton-loop,pose-motion-loop,loop-stage,representative-glyph}` | Port as-is. One renderer for tile, feed, hero and viewer scales; confidence shown as form (dashed = recapture). |
| Navigation shell | `components/hoophub-tab-bar.tsx` (icon-only 홈 · 탐색 · [촬영] · 프로필), `components/ui/top-bar.tsx` (44 pt), `app/(tabs)/_layout.tsx` | Port as-is; delete `components/liquid-tab-bar.tsx`. Hidden routes `motion`, `assessment`, `library`, `settings` stay reachable (`href: null`). |
| Home | `app/(tabs)/index.tsx`, `components/home/{feed-card,story-strip}`, `hooks/use-latest-representative-profile.ts`, `lib/format/relative-day.ts` | Port as-is. Motion-first feed, one caption line, honest recency, confidence band. |
| Explore | `app/(tabs)/explore.tsx` | Port as-is. Only the anonymous CMU reference; no named players; view chips. Add the empty/reference state language for future opt-in skeletons. |
| Profile | `app/(tabs)/profile.tsx`, `components/profile/{profile-hero,profile-stats,motion-grid,account-panel}` | Port as-is. PR #5's route is a strict superset of `main`'s owner-bound logic (adds the generation-guarded glyph fetch, keeps every load/delete/recovery decision). Delete `components/shooting-profile/profile-list.tsx`. |
| Analysis | `app/private-analysis/[id].tsx`, `components/analysis/analysis-layers.tsx`, `lib/skeleton/analysis-evidence.ts`, `components/shooting-profile/sequence-viewer.tsx` (post-like player) | Port, then extend: layer 1 must also put **one visual highlight on the skeleton** (prompt §11). |
| Test suites | `ui-tokens`, `ui-navigation`, `ui-home`, `ui-profile`, `ui-analysis`, `ui-apple-design`, `ui-render` (jsdom), `skeleton-glyph`, `representative-glyph`, `analysis-evidence`, `relative-day`; modified `release-readiness`, `shooting-profile-persistence-ui`, `shooting-profile-sequence-viewer`, `shooting-profile-capture-reducer` | Port. `vitest.config.ts` gains the react-native-web alias, jsdom for `.test.tsx`, `__DEV__`. `package.json` gains `jsdom` and `@types/react-dom`; lockfile regenerated with pnpm 9.12.0. |

## 3. Obsolete or deliberately not copied from PR #5

- **Capture.** PR #5 only recoloured `capture-session.tsx`, `capture-slot-card.tsx`, `quality-summary.tsx`,
  `capture-mode-picker.tsx` and swapped the header for `TopBar`. The prompt (§10) requires a rebuilt
  presentation: where to stand, where to put the camera, shoot, accept or recapture; capture-protocol data
  separated from capture presentation so a future yaw instruction (front, shooting side, left oblique,
  right oblique) is configuration, not layout. This branch builds that on top of the **unchanged**
  `useShootingProfileCapture` hook, `captureSessionReducer` state machine and `buildCapturePlan`.
- **Hidden routes** (`motion`, `library`, `assessment`, `settings`). PR #5 recoloured them to satisfy the
  zero-literal rule; they stay hidden and get the same minimal token conversion. `components/formpath-ui.tsx`
  keeps its API (settings uses it) but paints with tokens.
- **Docs.** PR #5's `HANDOFF.md` / `IMPLEMENTATION_STATUS.md` sections and its PR #4 integration plan are
  not carried over; this branch writes its own status entry.
- **`expo-blur`.** PR #5 left translucent bars as an open question. Decision here: flat Graphite bars, no new
  dependency (prompt §15).

## 4. Conflicts and how they resolve

There are no file-level conflicts (PR #5 is `MERGEABLE`; `main` moved only in the rollout gate). Semantic
resolutions:

| Test on `main` | Why it changes | Resolution |
| --- | --- | --- |
| `tests/release-readiness.test.ts` reads `liquid-tab-bar.tsx` and asserts `withTiming` | the bar is replaced by a static icon bar | take PR #5's version: static bar, no reanimated, no spring |
| `tests/shooting-profile-persistence-ui.test.ts` reads `profile-list.tsx` | replaced by `components/profile/motion-grid.tsx` | take PR #5's version (grid contract, honesty in accessibility labels) |
| `tests/shooting-profile-sequence-viewer.test.ts` asserts literal focus colours | tokens replace literals | take PR #5's version (asserts against `tokens.*`) |
| `tests/shooting-profile-capture-reducer.test.ts` asserts the guided-entry button literal | tokens replace literals | take PR #5's version |

## 5. Latest-`main` behaviours that must win (and are not touched)

- `FORMPATH_FLAGS` resolution through the rollout gate. UI reads `FORMPATH_FLAGS` exactly as before and
  never bypasses it; with the flags off the app shows honest disabled/empty states.
- `hooks/use-shooting-profile-capture.ts`: request lifecycle, permission handling, admission, quality
  rejection copy (`qualityRejectionReason`, `detectorFailureReason`, `recaptureReason`), aggregation and the
  strict save envelope.
- `lib/shooting-profile/capture-session-reducer.ts`: statuses, slot enablement, `recaptureReasonCode`,
  `recoveryStatus`, owner-bound helpers.
- `app/(tabs)/profile.tsx` owner-bound load / delete / recovery (PR #5's route preserved it verbatim).
- `app/private-capture.tsx` and `app/private-analysis/[id].tsx` access rules (both flags, settled auth,
  opaque id, request key).

## 6. Gaps the prompt adds beyond PR #5

1. Capture presentation rebuilt around a protocol/presentation split with yaw-ready guidance (§10).
2. Analysis layer 1 adds a skeleton highlight for the primary finding (§11).
3. Explore states the future opt-in structure honestly without fabricating it (§9, §13).
4. Visual QA from the real implementation at 375 / 390 / 430 pt, including alternative states (§24), which
   requires an isolated development-only fixture harness (§25).

## 7. Baseline on the worktree (clean `main`)

`corepack pnpm check` → PASS. `corepack pnpm test:unit` → 470 passed / 1 skipped / 2 failed, both in
`tests/legacy-server-pose-write-boundary.test.ts` at 5.3 s (the 5 s default timeout under full parallel
load); the same file alone → 5 passed in 1.9 s. Treated as environmental and re-checked at the end.
