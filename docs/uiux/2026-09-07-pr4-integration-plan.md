# PR #4 × PR #5 integration plan — 2026-09-07

Plan only. Nothing here was performed; PR #4 has not been merged, rebased or cherry-picked into
`feat/uiux-skeleton-social-redesign`. This records, per file, how the future integration must
resolve the overlap so that neither PR loses a feature.

## Inputs (verified 2026-09-07)

- PR #4 `feat/p1-real-video-validation` head `aaee15c`, OPEN, not draft, `MERGEABLE` against `main`;
  held by design until the owner's iPhone smoke run.
- PR #5 `feat/uiux-skeleton-social-redesign` (this branch), draft.
- Common merge base: `main` `075efaa`.
- `git merge-tree --write-tree --name-only origin/feat/p1-real-video-validation HEAD` (does not touch
  the working tree) → 12 content conflicts + 1 modify/delete; `HANDOFF.md` and
  `tests/shooting-profile-capture-reducer.test.ts` auto-merge.

## Order

1. PR #4 merges to `main` first (owner decision, after the device smoke).
2. This branch is then rebased onto `main` (or `main` merged in — owner's choice; the rules below hold
   either way). "PR #5 side" below means this branch, "PR #4 side" means `main` after step 1.
3. The post-merge must-do list at the end is applied before the branch is pushed again.

## Fixed decisions

- `app.config.ts` keeps PR #5's `userInterfaceStyle: "dark"` (pinned by `tests/ui-tokens.test.ts`).
- `components/shooting-profile/profile-list.tsx` stays deleted (replaced by `components/profile/motion-grid.tsx`).
- `components/shooting-profile/real-video-evaluation-panel.tsx` keeps PR #4's behaviour, copy and
  accessibility contract but is converted to semantic tokens.
- `package.json` / `pnpm-lock.yaml` are regenerated from the merged dependency graph, never hand-merged.
- `vitest.config.ts` keeps both sides' environments (PR #5's file is already the superset).

## What must survive

PR #4: real-video evaluation path (dev build + `EXPO_PUBLIC_FORMPATH_REAL_VIDEO_EVAL=1`), capture
provenance (`captureSource` on slots, camera-only admission, `library_source_not_admissible`),
explicit consent + opaque consent record id, cross-view geometry gate in the product path
(`duplicate_view_projection` / `mirrored_view_projection` recapture reasons and their user copy),
derived report builder + file sharing, privacy boundaries (no raw video/landmarks leave the device),
the iPhone evaluation runbook and preflight/sweep scripts, `expo-modules-core` removal / SDK 54 alignment.

PR #5: Direction A Graphite / Volt dark UI with zero colour literals under `app/` and `components/`
(`tests/ui-tokens.test.ts`), skeleton as profile identity (hero, stats, goal line, motion grid),
skeleton feed on Home, Explore route, simplified three-layer analysis, one 44-pt `TopBar` per screen,
flat icon tab bar, system typography presets, tap-to-pause loops, the accessibility contracts pinned by
`tests/ui-render.test.tsx`, `tests/ui-apple-design.test.ts`, `tests/ui-profile.test.ts`,
`tests/ui-home.test.ts`, and the three 2026-09-07 fixes (`8a3826c`, `76881b6`, `1df2c03`).

## Per-file resolution

| File | Conflict | Resolution rule |
| --- | --- | --- |
| `app.config.ts` | content (`userInterfaceStyle` line); PR #4 also adds `expo-font` and `expo-web-browser` to `plugins` in a separate hunk | Keep `"dark"`. Take PR #4's two plugins (verify the hunk auto-applied). Replace PR #4's comment (it justifies `light` by hardcoded light screens, which no longer exist): the app declares dark so iOS system surfaces — including the share sheet the evaluation export opens — match the dark screens. |
| `app/(tabs)/profile.tsx` | content | Take PR #5's file whole. PR #4's only hunk raises `stateText` from `#61738A` to `#5A6B80` in a style block PR #5 replaced with tokens; it is subsumed by `tokens.mutedForeground` (≥ 4.5:1 on background and surface in both schemes, `tests/ui-tokens.test.ts`). PR #4 touches no logic here, so the owner-bound load/delete/recovery code and the glyph-fetch fix stay as on PR #5. |
| `app/private-capture.tsx` | content | PR #5 whole. PR #4's hunk is the same colour bump on `loadingCopy`. The `captureV2 && profileV2` gate is untouched by both. |
| `components/private-pose-capture.tsx` | content | PR #5 whole. PR #4's hunks are the colour bump on `subtitle` and `status`. |
| `components/shooting-profile/capture-mode-picker.tsx` | content | PR #5 whole. PR #4's hunks are the colour bump on `intro` and `detail`. |
| `components/shooting-profile/capture-session.tsx` | content | PR #5's body and styles, plus PR #4's three functional additions: (1) `import { RealVideoEvaluationPanel } from "@/components/shooting-profile/real-video-evaluation-panel";` (2) `{capture.evaluationEnabled ? <RealVideoEvaluationPanel controller={capture.evaluation} /> : null}` directly after `{renderSlots()}` in the `result_review || saving` block (PR #5 line 289); (3) the same element after the recovery `Pressable` in the `state.status === "error"` block (before that block's closing `</View>`, PR #5 ≈ line 374). PR #4's colour bumps (`stepNames`, `pageIntro`, `centerCopy`, `retakeIntro`, the cancelled-state icon) are subsumed by tokens. Keep `<TopBar` and do not reintroduce "FORMPATH / PRIVATE CAPTURE" (`tests/ui-apple-design.test.ts`). |
| `components/shooting-profile/capture-slot-card.tsx` | content | PR #5 whole. PR #4's hunks are the colour bump on two icons and `status`. |
| `components/shooting-profile/profile-list.tsx` | modify/delete (deleted on PR #5, 3 colour bumps on PR #4) | Delete. No importer remains: PR #5's `profile.tsx` renders `MotionGrid`; `git grep` on PR #4 finds no new importer. PR #4 references it only from `tests/shooting-profile-evaluation-build-and-contrast.test.ts` (`V2_SURFACES` — remove the entry, see below). `tests/shooting-profile-persistence-ui.test.ts` is unchanged by PR #4 and already rewritten by PR #5, so it resolves to PR #5 automatically. `tests/ui-profile.test.ts` pins the file's absence. |
| `components/shooting-profile/quality-summary.tsx` | content | PR #5 whole. PR #4's hunk is the colour bump on `detail`. |
| `docs/IMPLEMENTATION_STATUS.md` | content (both append after the same paragraph) | Keep both. Set `기준일` to the integration date. Keep PR #4's four table rows. Order the dated sections: 2026-09-02 P1.1 hardening, 2026-09-05 synthetic sweep, 2026-09-05 geometry gate, 2026-09-06 UI/UX, then a 2026-09-07 entry for the integration. In PR #4's 2026-09-02 section, mark "`userInterfaceStyle`을 `light`로 선언" as superseded by the dark commitment. |
| `package.json` | content (adjacent devDependency insertions; PR #4 also changes dependencies and scripts) | `dependencies` and `scripts` from PR #4 (SDK 54 patch alignment, `expo-asset`, `expo-file-system`, no `expo-modules-core`, `sweep:synthetic`, `preflight:evaluation`). `devDependencies`: union — `@types/react-dom ~19.1.7` (identical on both), `jsdom` → take PR #4's `^30.0.1` (PR #5 has `^30`). PR #5 adds nothing else. |
| `pnpm-lock.yaml` | content | Never hand-merge. After `package.json` is resolved: `corepack pnpm install` (pnpm 9.12.0, not frozen), commit the regenerated lockfile, then confirm `CI=true corepack pnpm install --frozen-lockfile` passes and PR #4's version of `tests/pose-detection-v2-contract.test.ts` (lockfile regex) passes on it. |
| `vitest.config.ts` | content | Keep PR #5's file: it already has everything PR #4 added (`esbuild.jsx: "automatic"`, `.tsx` include, jsdom `environmentMatchGlobs`, the `react-native` → `react-native-web` alias — PR #5 uses the package name, PR #4 a `path.join`; equivalent) plus `define: { __DEV__: "true" }`, which PR #5's render tests need. |

Auto-merged, read the result before committing:

- `HANDOFF.md`: both sides insert a section right under the title (PR #5 "UI/UX redesign handoff -
  2026-09-06", PR #4 "P1.1 Real-video validation handoff - 2026-09-02"). Order newest first and update
  the "Last updated" line. PR #4's section says the app declares `light`; add one line that PR #5
  superseded it with `dark`.
- `tests/shooting-profile-capture-reducer.test.ts`: PR #4 adds `captureSource` to
  `SLOT_ACQUIRE_STARTED` fixtures (+6), PR #5 changed 7 lines; confirm both intents survive and the file
  still passes.

Non-conflicting files whose meaning crosses the boundary:

- `lib/feature-flags.ts` (PR #4 adds `realVideoEvaluation` and `FORMPATH_REAL_VIDEO_CONSENT_RECORD_ID`):
  PR #5's `tests/ui-render.test.tsx` flag mock already carries `realVideoEvaluation: false`; Home now
  imports `FORMPATH_FLAGS` for the viewer gate — no change needed.
- `hooks/use-shooting-profile-capture.ts` (PR #4): exposes `evaluationEnabled` and `evaluation`, which
  the two `capture-session.tsx` insertions consume.
- `tests/ui-tokens.test.ts` scans every `.ts/.tsx/.js` under `app/` and `components/`; PR #4's new panel
  is the only file that will fail it (see below).
- `tests/ui-apple-design.test.ts`: the panel is not in its `REDESIGNED` list, so its `fontFamily: "Barlow…"`
  is not test-blocked; converting to the `typography` presets is recommended for consistency, not required.
- `tests/shooting-profile-real-video-evaluation-panel.test.tsx` (PR #4, jsdom + react-native-web): runs
  under PR #5's vitest config; it sets `IS_REACT_ACT_ENVIRONMENT` itself and asserts no colours.

## Expected post-merge failures and the required edits

1. `tests/ui-tokens.test.ts` › "leaves no colour literal": `components/shooting-profile/real-video-evaluation-panel.tsx`
   has 17 literal lines. Convert with this map, keeping every prop, label, role, `aria-*` and the three
   actions: `#FFFEFA` panel → `tokens.surface`; `#102235` border/text/primary button → `tokens.border`
   (border), `tokens.foreground` (text), `tokens.primary` (button fill) with `tokens.primaryForeground`
   for `#FFFFFF`; `#5A6B80` → `tokens.mutedForeground`; `#9A3412` kicker → `tokens.warning`;
   `#8A2F14` blocked → `tokens.destructive`; `#8795A6` secondary border → `tokens.border`;
   `ActivityIndicator color` → `tokens.foreground`. The kicker "INTERNAL · DEV BUILD ONLY" is an
   accepted exception to the one-line text budget: the panel is internal, dev-build-only and flag-gated.
2. `tests/shooting-profile-evaluation-build-and-contrast.test.ts` (PR #4): change the
   `userInterfaceStyle: "light"` assertion to `"dark"` (and its comment); remove
   `components/shooting-profile/profile-list.tsx` from `V2_SURFACES` (the file no longer exists, so
   `readFileSync` would throw); the `#61738A` scan then passes vacuously — either keep it or replace it
   with the `tokens.mutedForeground` contrast assertions already in `tests/ui-tokens.test.ts`. The
   `expo-modules-core` / `expo-asset` / `expo` version and `.gitignore` assertions stay.
3. `tests/ui-apple-design.test.ts` › TopBar: passes as long as the `capture-session.tsx` resolution keeps
   PR #5's `<TopBar` (it does not conflict with PR #4's hunks).
4. Any test that reads `package.json` versions (`tests/shooting-profile-evaluation-build-and-contrast.test.ts`,
   `tests/pose-detection-v2-contract.test.ts`) must be run after the lockfile is regenerated.

## Post-integration must-do list

1. Wait for PR #4 to merge to `main` (owner: iPhone smoke), then rebase/merge as the owner decides.
2. Resolve the 13 files exactly per the table; take PR #4's three `capture-session.tsx` insertions.
3. Convert `real-video-evaluation-panel.tsx` to tokens (map above); optionally to `typography` presets.
4. Apply the two test edits in PR #4's contrast/build test.
5. Regenerate `pnpm-lock.yaml`; verify a frozen install.
6. `corepack pnpm check`, `corepack pnpm lint`, `corepack pnpm test:unit` — every PR #4 suite (real-video
   evaluation, provenance, geometry admission, preflight, sweep, panel) and every PR #5 suite green.
7. `corepack pnpm exec expo export --platform web` into a folder outside the repo → still 20 routes
   (PR #4 adds no route).
8. Update `docs/IMPLEMENTATION_STATUS.md` and `HANDOFF.md` as described; note the `light` → `dark`
   supersession in PR #4's handoff section.
9. Device check (owner): a dev build with `EXPO_PUBLIC_FORMPATH_REAL_VIDEO_EVAL=1` — the panel inside
   the dark capture screen, the consent checkbox with VoiceOver, and the share sheet's appearance.
10. CI green including the Firestore emulator job before the draft is lifted.
