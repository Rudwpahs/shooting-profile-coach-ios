# Hoop Hub UI v1 Final Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Hoop Hub UI v1.0 on `work/hoophub-ui-v1-final` — Graphite / Volt dark, skeleton-first Home · Explore · Capture · Analysis · Profile — on top of latest `main`, porting PR #5's approved concepts and rebuilding capture around a protocol/presentation split, with visual evidence from the real implementation.

**Architecture:** Semantic colour tokens and system typography are the only paint; one skeleton renderer (`SkeletonGlyph`) draws tiles, feed cards, the profile hero and the analysis player from either a stored representative profile or an anonymous reference motion. Screens are thin route wrappers over presentational components so a development-only demo route can render every state with synthetic fixtures for visual QA. Every gate on `main` (rollout-gated `FORMPATH_FLAGS`, capture state machine, owner-bound profile logic, analysis access rules) is consumed unchanged.

**Tech Stack:** Expo SDK 54 / expo-router 6, React Native 0.81 + react-native-web, react-native-svg, nativewind tokens, vitest 2 (node + jsdom render tests), pnpm 9.12.0 via corepack.

**Spec:** `docs/superpowers/specs/2026-09-15-hoophub-ui-v1-final-spec.md` (owner prompt) and `docs/uiux/2026-09-15-ui-v1-final-audit.md` (Phase 1 audit).

## Global Constraints

- Branch `work/hoophub-ui-v1-final` from `main` @ `c9da820`; never merge to `main`, never push `main`, never force-push. The worktree is `C:\Users\USER\Projects\shooting-profile-coach-ios\.claude\worktrees\work+hoophub-ui-v1-final`; run every command there. The worktree guard refuses compound git commands: **one plain git command per shell call** (`git add …`, `git commit -F …`, `git checkout <ref> -- <paths>`), no `&&`/loops/variables around git.
- Do not modify: `lib/shooting-profile/*` (except adding the new file `capture-guidance.ts`), `lib/feature-flags.ts`, `lib/firebase-*`, `firestore.rules`, `modules/formpath-pose/*`, `hooks/use-shooting-profile-capture.ts`, `lib/pose-detection*`, any threshold, any codec, any consent/provenance behaviour.
- Zero colour literals under `app/` and `components/` (`tests/ui-tokens.test.ts`). Every colour comes from `tokens` in `@/constants/tokens`; every text role from `typography` in `@/constants/typography`. No `fontFamily: "Barlow…"` on redesigned surfaces.
- No new runtime dependency (no `expo-blur`). Dev dependencies added: `jsdom ^30`, `@types/react-dom ~19.1.7` (exactly what PR #5 added).
- Boundary string `representative_phase_fused_4d_estimate_not_actual_3d` and user copy `위상 결합 4D 추정 · 실측 3D 아님` never change or get overstated.
- Development fixtures live only under `lib/dev/` and `app/dev/ui-demo.tsx`, gated by `__DEV__ && process.env.EXPO_PUBLIC_HOOPHUB_UI_DEMO === "1"`, loaded through `require()` inside that gate, never imported by production paths.
- No numeric camera-yaw requirement in production logic: `cameraYawDegrees` is `null` for every view the current protocol produces.
- Commit messages: written to a scratch file and committed with `git commit -F`; every message ends with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Porting from PR #5 uses `git checkout origin/feat/uiux-skeleton-social-redesign -- <paths>` (this stages the exact reviewed file). "PR5" below means that ref.
- Verification commands: `corepack pnpm check`, `corepack pnpm lint`, `corepack pnpm test:unit`, `corepack pnpm vitest run <file>` for focused runs, `corepack pnpm test:rules` (needs Java on PATH: PowerShell with the portable JRE at `C:\Users\USER\AppData\Local\Temp\claude\C--Users-USER-Projects-shooting-profile-coach-ios\8abd4e9e-6bc9-4341-864a-d062c0b4577b\scratchpad\jre\jdk-21.0.12.1+1-jre\bin`), `corepack pnpm exec expo export --platform web --output-dir web-dist`.

---

## File structure

| Path | Responsibility | Task |
| --- | --- | --- |
| `theme.config.js`, `theme.config.d.ts` | 23 semantic swatches, light+dark | 1 |
| `constants/tokens.ts` | `tokens` (dark scheme), `SchemeColors`, `ThemeColors` | 1 |
| `constants/typography.ts` | nine system-font roles | 1 |
| `lib/_core/theme.ts`, `lib/theme-provider.tsx` | runtime palette from tokens; dark commitment | 1 |
| `app.config.ts` | `userInterfaceStyle: "dark"` | 1 |
| `vitest.config.ts`, `package.json`, `pnpm-lock.yaml` | jsdom render tests | 1 |
| `components/ui/top-bar.tsx` | one 44-pt bar per screen | 2 |
| hidden routes + shared components (see Task 2) | token paint only, behaviour unchanged | 2 |
| `components/shooting-profile/sequence-viewer.tsx` | post-like representative player + exported lifecycle/projection helpers | 3 |
| `lib/skeleton/pose-motion-glyph.ts`, `components/skeleton/*` | glyph data, static glyph, loops, tap-to-pause stage | 4 |
| `components/hoophub-tab-bar.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/explore.tsx` | navigation shell and Explore | 5 |
| `components/home/{home-feed,feed-card,story-strip}.tsx`, `hooks/use-latest-representative-profile.ts`, `lib/format/relative-day.ts`, `app/(tabs)/index.tsx` | Home | 6 |
| `components/profile/*`, `app/(tabs)/profile.tsx` | Profile | 7 |
| `lib/skeleton/analysis-evidence.ts`, `components/analysis/analysis-layers.tsx`, `app/private-analysis/[id].tsx` | Analysis in three layers with a skeleton highlight | 8 |
| `lib/shooting-profile/capture-guidance.ts` | capture protocol → presentation data (yaw-ready) | 9 |
| `components/capture/capture-guide.tsx`, `components/shooting-profile/{capture-session,capture-mode-picker,capture-slot-card,quality-summary}.tsx` | capture presentation | 10 |
| `lib/dev/ui-demo.ts`, `lib/dev/ui-demo-fixtures.ts`, `app/dev/ui-demo.tsx`, `artifacts/ui-v1-final/*.png` | dev-only visual QA harness and evidence | 11 |
| `docs/IMPLEMENTATION_STATUS.md`, `HANDOFF.md` | status entries | 12 |

---

### Task 1: Design system — tokens, typography, dark commitment, test runtime

**Files:**
- Modify (port from PR5): `theme.config.js`, `theme.config.d.ts`, `lib/_core/theme.ts`, `lib/theme-provider.tsx`, `app.config.ts`, `vitest.config.ts`, `package.json`, `app/dev/theme-lab.tsx`, `app/oauth/callback.tsx`
- Create (port from PR5): `constants/tokens.ts`, `constants/typography.ts`
- Test (port from PR5): `tests/ui-tokens.test.ts`
- Regenerate: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `tokens: Record<TokenName, string>` (dark scheme) from `@/constants/tokens`; `typography` roles `wordmark|title|headline|body|callout|caption|label|stat|finding` from `@/constants/typography`; `SchemeColors`, `ThemeColors`, `ColorScheme`.

- [ ] **Step 1: Port the test first**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- tests/ui-tokens.test.ts
```

Then edit `tests/ui-tokens.test.ts`: change the line `it("leaves no colour literal in app/ or components/ (every screen paints with tokens)", () => {` to `it.skip("leaves no colour literal in app/ or components/ (every screen paints with tokens)", () => {` and add the comment line above it: `// Re-enabled in Task 8 once every surviving screen paints with tokens.`

- [ ] **Step 2: Run it to see it fail**

Run: `corepack pnpm vitest run tests/ui-tokens.test.ts`
Expected: FAIL — `Cannot find module '@/constants/tokens'`.

- [ ] **Step 3: Port the design-system files**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- theme.config.js theme.config.d.ts constants/tokens.ts constants/typography.ts lib/_core/theme.ts lib/theme-provider.tsx app.config.ts vitest.config.ts package.json app/dev/theme-lab.tsx app/oauth/callback.tsx
```

Confirm with `git diff --cached --stat origin/main` that `app.config.ts` differs only by `userInterfaceStyle: "dark"` and `package.json` only by the two devDependencies `@types/react-dom` and `jsdom`.

- [ ] **Step 4: Regenerate the lockfile and install**

Run: `corepack pnpm install` (not frozen; pnpm 9.12.0 via corepack) then `corepack pnpm install --frozen-lockfile` to prove the lockfile is consistent.
Expected: both succeed; `git status --short` shows `pnpm-lock.yaml` modified.

- [ ] **Step 5: Run the token tests and the typecheck**

Run: `corepack pnpm vitest run tests/ui-tokens.test.ts` → Expected: 4 passed, 1 skipped.
Run: `corepack pnpm check` → Expected: no output (pass). If `tsc` reports `SchemeColors[...].muted` / `.success` / `.error` anywhere, that file was missed in Step 3 — the only two consumers are `app/dev/theme-lab.tsx` and `app/oauth/callback.tsx`.
Run: `corepack pnpm vitest run tests/pose-detection-v2-contract.test.ts tests/release-readiness.test.ts` → Expected: pass (the lockfile regex reads the regenerated lockfile).

- [ ] **Step 6: Commit**

Write the message to `C:\Users\USER\AppData\Local\Temp\claude\C--Users-USER-Projects-shooting-profile-coach-ios\8abd4e9e-6bc9-4341-864a-d062c0b4577b\scratchpad\uiv1-t1.txt`:

```
feat(ui): centralize Graphite / Volt tokens and system typography

Twenty-three semantic colour swatches replace the old nine, the app
commits to the dark scheme, and every text role comes from one
typography map. The contract test pins the token set, the WCAG pairs
the design rules promise, and the dark commitment; its colour-literal
scan is skipped until every surviving screen paints with tokens.

vitest gains the react-native-web alias, jsdom for .tsx tests and the
__DEV__ define so screens can be mounted in tests; jsdom and
@types/react-dom are the only dependency additions.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

Then: `git add -A` and `git commit -F "<that path>"`.

---

### Task 2: Paint every surviving surface with tokens (hidden routes, shared components, capture interim)

**Files:**
- Create (port from PR5): `components/ui/top-bar.tsx`
- Modify (port from PR5): `components/formpath-ui.tsx`, `components/pose-motion-viewer.tsx`, `components/source-skeleton-reviewer.tsx`, `components/private-pose-capture.tsx`, `components/shooting-profile/capture-session.tsx`, `components/shooting-profile/capture-slot-card.tsx`, `components/shooting-profile/quality-summary.tsx`, `components/shooting-profile/capture-mode-picker.tsx`, `app/private-capture.tsx`, `app/(tabs)/motion.tsx`, `app/(tabs)/library.tsx`, `app/(tabs)/assessment.tsx`
- Test (port from PR5): `tests/shooting-profile-capture-reducer.test.ts`

**Interfaces:**
- Produces: `TopBar({ title?, wordmark?, left?, right? })` and `TOP_BAR_HEIGHT = 44` from `@/components/ui/top-bar`.

- [ ] **Step 1: Port the updated reducer contract test and run it**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- tests/shooting-profile-capture-reducer.test.ts
```

Run: `corepack pnpm vitest run tests/shooting-profile-capture-reducer.test.ts`
Expected: FAIL in "guided capture static integration contract" — `private-pose-capture.tsx` still contains hex literals.

- [ ] **Step 2: Port the tokenized files**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- components/ui/top-bar.tsx components/formpath-ui.tsx components/pose-motion-viewer.tsx components/source-skeleton-reviewer.tsx components/private-pose-capture.tsx components/shooting-profile/capture-session.tsx components/shooting-profile/capture-slot-card.tsx components/shooting-profile/quality-summary.tsx components/shooting-profile/capture-mode-picker.tsx app/private-capture.tsx "app/(tabs)/motion.tsx" "app/(tabs)/library.tsx" "app/(tabs)/assessment.tsx"
```

These are behaviour-preserving recolours plus the `TopBar` header in `capture-session.tsx` (Task 10 rebuilds capture presentation on top of them).

- [ ] **Step 3: Verify no literal survives outside the screens replaced later**

Run: `corepack pnpm vitest run tests/shooting-profile-capture-reducer.test.ts tests/shooting-profile-persistence-ui.test.ts`
Expected: capture-reducer PASS; persistence-ui PASS (it still reads `profile-list.tsx`, which exists until Task 7).
Run: `grep -rnE "#[0-9A-Fa-f]{6}\b|rgba?\(" components app --include=*.tsx --include=*.ts -l`
Expected: only `app/(tabs)/index.tsx`, `app/(tabs)/profile.tsx`, `app/private-analysis/[id].tsx`, `components/liquid-tab-bar.tsx`, `components/shooting-profile/profile-list.tsx`, `components/shooting-profile/sequence-viewer.tsx` — every one is replaced in Tasks 3–8.
Run: `corepack pnpm check` → pass.

- [ ] **Step 4: Commit**

Message file `uiv1-t2.txt`:

```
refactor(ui): paint shared components and hidden routes with tokens

The motion lab, library, assessment, the fluid motion viewer, the
skeleton reviewer, the shared FormPath primitives and the whole capture
flow now read every colour from the semantic tokens; nothing about
their behaviour, copy, accessibility or gating changes. The capture
screen gets the shared 44-point TopBar in place of its kicker header.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

`git add -A` · `git commit -F <path>`.

---

### Task 3: Post-like representative player

**Files:**
- Modify (port from PR5): `components/shooting-profile/sequence-viewer.tsx`
- Test (port from PR5): `tests/shooting-profile-sequence-viewer.test.ts`

**Interfaces:**
- Produces (exported from `sequence-viewer.tsx`): `DISPLAY_BONES`, `projectRepresentativeJoints(frame, view, shootingHand)`, `getRepresentativeViewPresets(shootingHand)`, `getRepresentativeFocusStyle(focused, surface)`, `createRepresentativePlaybackLifecycle()`, `transitionRepresentativePlaybackLifecycle(state, event)`, `resolveRepresentativePlayback(policy)`, `advanceRepresentativeFrameIndex(index)`, `type RepresentativeViewId`, `type RepresentativePlaybackLifecycleEvent`, `SequenceViewer({ profile, shootingHand?, confidence? })`.

- [ ] **Step 1: Port the test and watch it fail**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- tests/shooting-profile-sequence-viewer.test.ts
```

Run: `corepack pnpm vitest run tests/shooting-profile-sequence-viewer.test.ts`
Expected: FAIL — focus style still returns literal colours; the static-safety test expects `borderColor: tokens.border`.

- [ ] **Step 2: Port the player**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- components/shooting-profile/sequence-viewer.tsx
```

- [ ] **Step 3: Run the test and the typecheck**

Run: `corepack pnpm vitest run tests/shooting-profile-sequence-viewer.test.ts` → PASS.
Run: `corepack pnpm check` → pass (the analysis route on `main` still passes `confidence`, which the ported viewer accepts).

- [ ] **Step 4: Commit**

Message file `uiv1-t3.txt`:

```
feat(analysis): make the representative viewer a post-like player

The stage is the whole tap target (tap to pause, play glyph only while
paused), three view dots sit on the stage, the scrubber is a 1:1 track
with anchor dots that snap with haptics, and every text panel, legend
and percentage badge is gone; the numbers move to the analysis route's
detail layer. Lifecycle rules (background pause, Reduce Motion holds
the release still) and every accessibility contract are unchanged.
The projection and lifecycle helpers are exported for the skeleton
primitives that follow.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 4: Skeleton primitives (one renderer for every scale)

**Files:**
- Create (port from PR5): `lib/skeleton/pose-motion-glyph.ts`, `components/skeleton/skeleton-glyph.tsx`, `components/skeleton/skeleton-loop.tsx`, `components/skeleton/pose-motion-loop.tsx`, `components/skeleton/loop-stage.tsx`, `components/skeleton/representative-glyph.ts`
- Test (port from PR5): `tests/skeleton-glyph.test.ts`, `tests/representative-glyph.test.ts`

**Interfaces:**
- Produces: `poseMotionGlyph(motion, { view?, progress?, hand? })`, `fitGlyphPoints`, `glyphBounds`, `type SkeletonGlyphData`, `type GlyphView`; `SkeletonGlyph({ data, width, height, confidence?, accessible?, accessibilityLabel, ground?, padding?, bounds? })`; `SkeletonLoop({ profile, shootingHand, view, width, height, confidence, accessibilityLabel, paused? })`; `PoseMotionLoop({ motion, view, hand?, width, height, accessibilityLabel, paused? })`; `LoopStage({ width, height, accessibilityLabel, children: (paused) => ReactNode })`; `representativeGlyph`, `representativeSequenceBounds`, `representativeReleaseFrameIndex`, `representativeConfidence`, `type SkeletonConfidence = "high" | "basic" | "recapture"`.

- [ ] **Step 1: Port the tests and watch them fail**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- tests/skeleton-glyph.test.ts tests/representative-glyph.test.ts
```

Run: `corepack pnpm vitest run tests/skeleton-glyph.test.ts tests/representative-glyph.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 2: Port the primitives**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- lib/skeleton/pose-motion-glyph.ts components/skeleton/skeleton-glyph.tsx components/skeleton/skeleton-loop.tsx components/skeleton/pose-motion-loop.tsx components/skeleton/loop-stage.tsx components/skeleton/representative-glyph.ts
```

- [ ] **Step 3: Run tests and typecheck**

Run: `corepack pnpm vitest run tests/skeleton-glyph.test.ts tests/representative-glyph.test.ts` → PASS (10 tests).
Run: `corepack pnpm check` → pass.

- [ ] **Step 4: Commit**

Message file `uiv1-t4.txt`:

```
feat(skeleton): add one glyph renderer for tiles, feeds, heroes and loops

A pure glyph module turns either a stored representative frame or an
anonymous reference motion into 2D screen points plus the bone list and
the accent arm, and one SVG component draws it at any size: observed
joints filled, derived joints hollow, the shooting arm in the accent,
dashed bones when the record needs a retake. Two loops play those
glyphs under the viewer's lifecycle rules, and a stage makes any loop
behave like a post: tap to pause, tap to resume.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 5: Navigation shell and Explore

**Files:**
- Create (port from PR5): `components/hoophub-tab-bar.tsx`, `app/(tabs)/explore.tsx`
- Modify (port from PR5): `app/(tabs)/_layout.tsx`
- Delete: `components/liquid-tab-bar.tsx`
- Test (port from PR5): `tests/ui-navigation.test.ts`, `tests/release-readiness.test.ts`

**Interfaces:**
- Produces: `HoopHubTabBar(props: BottomTabBarProps)`, `HOOPHUB_TABS`, `CAPTURE_ACTION_LABEL = "슛폼 촬영"`; tab routes `index`, `explore`, `profile`; hidden `motion`, `assessment`, `library`, `settings`.

- [ ] **Step 1: Port the tests and watch them fail**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- tests/ui-navigation.test.ts tests/release-readiness.test.ts
```

Run: `corepack pnpm vitest run tests/ui-navigation.test.ts tests/release-readiness.test.ts`
Expected: FAIL — `components/hoophub-tab-bar.tsx` missing.

- [ ] **Step 2: Port the shell and Explore, remove the floating dock**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- components/hoophub-tab-bar.tsx "app/(tabs)/explore.tsx" "app/(tabs)/_layout.tsx"
```

```
git rm components/liquid-tab-bar.tsx
```

- [ ] **Step 3: Run tests and typecheck**

Run: `corepack pnpm vitest run tests/ui-navigation.test.ts tests/release-readiness.test.ts` → PASS.
Run: `corepack pnpm check` → pass. (`ui-navigation` also asserts no hidden route still pads for the old dock; Task 2 already removed `paddingBottom: 116` from `library.tsx`; `index.tsx` and `profile.tsx` still carry it until Tasks 6–7 — if this test fails only on those two files, defer that single assertion's pass to Task 7 and note it in the commit message.)

- [ ] **Step 4: Commit**

Message file `uiv1-t5.txt`:

```
feat(nav): replace the floating dock with a flat icon bar and add Explore

Home, Explore, a central capture action and Profile, icon-only with
labels reserved for assistive technology, sitting inside the safe area
without spring or timing animation. Explore is a three-column grid of
the anonymous optical-mocap reference at each shot phase with a view
switch; nothing on it pretends other athletes exist yet. The hidden
routes stay reachable.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 6: Home as a motion feed (presentational feed + thin route)

**Files:**
- Create (port from PR5): `components/home/feed-card.tsx`, `components/home/story-strip.tsx`, `hooks/use-latest-representative-profile.ts`, `lib/format/relative-day.ts`
- Create: `components/home/home-feed.tsx`
- Modify: `app/(tabs)/index.tsx` (rewritten)
- Test: `tests/ui-home.test.ts` (ported then adapted), `tests/relative-day.test.ts` (ported)

**Interfaces:**
- Consumes: Task 4 loops/stage/glyph helpers, Task 2 `TopBar`, Task 1 tokens/typography.
- Produces: `HomeFeed(props: HomeFeedProps)` where

```ts
export type HomeFeedProps = {
  width: number;
  latest: LatestRepresentativeState;
  reference: AnonymousPoseReference;
  goalLabel: string;
  focusTitle: string;
  viewerEnabled: boolean;
  onOpenCapture: () => void;
  onOpenProfile: () => void;
  onOpenReference: () => void;
  onOpenAnalysis: (profileId: string) => void;
};
```

and `useLatestRepresentativeProfile(user, authLoading): LatestRepresentativeState` (`signed-out | disabled | loading | empty | error | ready{summary, record}`), `relativeDayLabel(date, now?)`.

- [ ] **Step 1: Port the tests, adapt ui-home to the split, watch them fail**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- tests/ui-home.test.ts tests/relative-day.test.ts
```

In `tests/ui-home.test.ts` replace the line `const home = readFileSync("app/(tabs)/index.tsx", "utf8");` with:

```ts
// The route wires hooks and navigation; the feed itself is presentational so the
// development demo can render every state. Both files together are "home".
const home = `${readFileSync("app/(tabs)/index.tsx", "utf8")}\n${readFileSync("components/home/home-feed.tsx", "utf8")}`;
```

Run: `corepack pnpm vitest run tests/ui-home.test.ts tests/relative-day.test.ts`
Expected: FAIL — files missing.

- [ ] **Step 2: Port the feed pieces**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- components/home/feed-card.tsx components/home/story-strip.tsx hooks/use-latest-representative-profile.ts lib/format/relative-day.ts
```

- [ ] **Step 3: Write `components/home/home-feed.tsx`**

```tsx
import { useMemo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { FeedCard } from "@/components/home/feed-card";
import { StoryStrip, type StoryItem } from "@/components/home/story-strip";
import { LoopStage } from "@/components/skeleton/loop-stage";
import { PoseMotionLoop } from "@/components/skeleton/pose-motion-loop";
import { representativeConfidence, representativeGlyph, representativeReleaseFrameIndex } from "@/components/skeleton/representative-glyph";
import { SkeletonGlyph } from "@/components/skeleton/skeleton-glyph";
import { SkeletonLoop } from "@/components/skeleton/skeleton-loop";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import type { LatestRepresentativeState } from "@/hooks/use-latest-representative-profile";
import type { AnonymousPoseReference } from "@/lib/anonymous-pose-library";
import { relativeDayLabel } from "@/lib/format/relative-day";
import { poseMotionGlyph } from "@/lib/skeleton/pose-motion-glyph";

export type HomeFeedProps = {
  width: number;
  latest: LatestRepresentativeState;
  reference: AnonymousPoseReference;
  goalLabel: string;
  focusTitle: string;
  viewerEnabled: boolean;
  onOpenCapture: () => void;
  onOpenProfile: () => void;
  onOpenReference: () => void;
  onOpenAnalysis: (profileId: string) => void;
};

/**
 * The feed itself: a story strip, my latest skeleton loop (or an honest
 * placeholder), and the anonymous reference loop. One caption line per card.
 * Presentational, so the route and the development demo render the same thing.
 */
export function HomeFeed({ width, latest, reference, goalLabel, focusTitle, viewerEnabled, onOpenCapture, onOpenProfile, onOpenReference, onOpenAnalysis }: HomeFeedProps) {
  const stageHeight = Math.round(width * 0.9);
  const referenceAvatar = useMemo(() => poseMotionGlyph(reference.motion, { view: "side", progress: 0.75 }), [reference.motion]);
  const silhouette = useMemo(() => poseMotionGlyph(reference.motion, { view: "oblique", progress: 0.75 }), [reference.motion]);
  const ownAvatar = latest.status === "ready"
    ? representativeGlyph(latest.record.profile.frames[representativeReleaseFrameIndex(latest.record.profile)], "side", latest.record.shootingHand)
    : null;

  const stories: StoryItem[] = [
    { key: "capture", kind: "capture", label: "촬영", accessibilityLabel: "슛폼 촬영", onPress: onOpenCapture },
    ...(ownAvatar ? [{ key: "own", kind: "glyph" as const, glyph: ownAvatar, accent: true, label: "내 슛폼", accessibilityLabel: "내 슛폼 프로필 열기", onPress: onOpenProfile }] : []),
    { key: "reference", kind: "glyph", glyph: referenceAvatar, label: reference.shortLabel, accessibilityLabel: `${reference.shortLabel} 참조 모션 열기`, onPress: onOpenReference },
  ];

  const placeholderLine = latest.status === "signed-out"
    ? "로그인 후 촬영"
    : latest.status === "error"
      ? "내 슛폼을 불러오지 못했습니다"
      : latest.status === "disabled"
        ? "대표 슛폼 저장이 꺼져 있습니다"
        : "첫 슛폼을 촬영해 보세요";

  return (
    <ScrollView contentContainerStyle={[styles.page, { width }]} showsVerticalScrollIndicator={false}>
      <StoryStrip items={stories} />

      {latest.status === "ready" ? (
        <FeedCard
          actions={[
            // The analysis route redirects while the viewer flag is off, so the
            // action only exists when it can open something.
            ...(viewerEnabled
              ? [{ icon: "arrow-expand" as const, label: "내 대표 슛폼 분석 열기", onPress: () => onOpenAnalysis(latest.summary.id) }]
              : []),
            { icon: "human", label: "내 슛폼 프로필 열기", onPress: onOpenProfile },
          ]}
          caption={focusTitle}
          captionLead={`목표 · ${goalLabel}`}
          confidence={representativeConfidence(latest.record.profile)}
          meta={relativeDayLabel(latest.summary.createdAt.toDate())}
          stage={(
            <LoopStage accessibilityLabel="내 최근 대표 슛폼 skeleton" height={stageHeight} width={width}>
              {(paused) => (
                <SkeletonLoop
                  accessibilityLabel="내 최근 대표 슛폼 skeleton, 사선 시점 재생"
                  confidence={representativeConfidence(latest.record.profile)}
                  height={stageHeight}
                  paused={paused}
                  profile={latest.record.profile}
                  shootingHand={latest.record.shootingHand}
                  view="oblique"
                  width={width}
                />
              )}
            </LoopStage>
          )}
          title="내 슛폼"
        />
      ) : (
        <FeedCard
          actions={[{ icon: "video", label: "슛폼 촬영", onPress: onOpenCapture }]}
          caption={focusTitle}
          captionLead={`목표 · ${goalLabel}`}
          stage={(
            <View accessible accessibilityLabel={latest.status === "loading" ? "내 슛폼을 불러오는 중" : placeholderLine} style={[styles.placeholder, { width, height: stageHeight }]}>
              <View pointerEvents="none" style={styles.silhouette}>
                <SkeletonGlyph accessible={false} accessibilityLabel="" data={silhouette} ground={false} height={stageHeight} padding={Math.round(stageHeight * 0.14)} width={width} />
              </View>
              {latest.status === "loading" ? <ActivityIndicator color={tokens.mutedForeground} /> : <Text style={styles.placeholderText}>{placeholderLine}</Text>}
            </View>
          )}
          title="내 슛폼"
        />
      )}

      <FeedCard
        actions={[{ icon: "arrow-expand", label: `${reference.shortLabel} 참조 모션 열기`, onPress: onOpenReference }]}
        caption={reference.styleTitle}
        meta="CMU optical mocap"
        stage={(
          <LoopStage accessibilityLabel={`${reference.shortLabel} 참조 skeleton`} height={stageHeight} width={width}>
            {(paused) => (
              <PoseMotionLoop
                accessibilityLabel={`${reference.shortLabel} 참조 skeleton, 사선 시점 재생`}
                height={stageHeight}
                motion={reference.motion}
                paused={paused}
                view="oblique"
                width={width}
              />
            )}
          </LoopStage>
        )}
        title={reference.shortLabel}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", paddingBottom: 32 },
  placeholder: { alignItems: "center", backgroundColor: tokens.stage, justifyContent: "flex-end", overflow: "hidden", paddingBottom: 22 },
  silhouette: { left: 0, opacity: 0.16, position: "absolute", top: 0 },
  placeholderText: { ...typography.callout, color: tokens.mutedForeground },
});
```

- [ ] **Step 4: Rewrite `app/(tabs)/index.tsx` as the wiring route**

```tsx
import { useRouter } from "expo-router";
import { useState } from "react";

import { HomeFeed } from "@/components/home/home-feed";
import { ScreenContainer } from "@/components/screen-container";
import { TopBar } from "@/components/ui/top-bar";
import { useLatestRepresentativeProfile } from "@/hooks/use-latest-representative-profile";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { FORMPATH_FLAGS } from "@/lib/feature-flags";
import { useFirebaseAuth } from "@/lib/firebase-auth";
import { useProfile } from "@/lib/profile-store";
import { getPracticeFocus } from "@/lib/recommendation";

const FALLBACK_WIDTH = 375;
const MAX_WIDTH = 680;
const GOAL_LABELS = { consistency: "일관성", range: "거리", release: "릴리스", rhythm: "리듬" } as const;

/**
 * 홈 answers three things in one glance: what I can do now (촬영), what my
 * motion looks like now (my latest skeleton), and what to look at next (the
 * anonymous reference). This route only wires auth, flags and navigation;
 * the feed is `HomeFeed`.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useProfile();
  const { user, loading: authLoading } = useFirebaseAuth();
  const latest = useLatestRepresentativeProfile(user, authLoading);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const width = Math.min(measuredWidth || FALLBACK_WIDTH, MAX_WIDTH);

  return (
    <ScreenContainer
      containerClassName="bg-background"
      onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}
    >
      <TopBar wordmark="Hoop Hub" />
      <HomeFeed
        focusTitle={getPracticeFocus(profile.goal).title}
        goalLabel={GOAL_LABELS[profile.goal]}
        latest={latest}
        onOpenAnalysis={(profileId) => router.push(`/private-analysis/${profileId}` as never)}
        onOpenCapture={() => router.push("/private-capture" as never)}
        onOpenProfile={() => router.navigate("/profile" as never)}
        onOpenReference={() => router.push("/library" as never)}
        reference={ANONYMOUS_POSE_REFERENCES[0]}
        viewerEnabled={FORMPATH_FLAGS.representative4DViewer}
        width={width}
      />
    </ScreenContainer>
  );
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `corepack pnpm vitest run tests/ui-home.test.ts tests/relative-day.test.ts tests/ui-navigation.test.ts` → PASS.
Run: `corepack pnpm check` → pass.

- [ ] **Step 6: Commit**

Message file `uiv1-t6.txt`:

```
feat(home): restructure home around the motion loop

A story strip (capture first, then the skeletons that exist), my latest
representative skeleton looping as a post with an honest recency label
and a confidence band, and the anonymous reference loop; one caption
line per card, no kickers, no KPI rows. The latest profile is read with
the profile route's owner rules. The feed is presentational so the
development demo can render the ready state without an account.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 7: Profile — skeleton as identity

**Files:**
- Create (port from PR5): `components/profile/profile-hero.tsx`, `components/profile/profile-stats.tsx`, `components/profile/motion-grid.tsx`, `components/profile/account-panel.tsx`
- Modify (port from PR5): `app/(tabs)/profile.tsx`
- Delete: `components/shooting-profile/profile-list.tsx`
- Test (port from PR5): `tests/ui-profile.test.ts`, `tests/shooting-profile-persistence-ui.test.ts`

**Interfaces:**
- Produces: `ProfileHero({ width, state, record?, view, onViewChange })` with `ProfileHeroState = "signed-out" | "loading" | "empty" | "ready"`; `ProfileStats({ stats, locked })`; `MotionGrid({ records, glyphs, loading, error, deletingProfileId, canOpen, width, onOpen, onDelete })`; `AccountPanel(...)`.

- [ ] **Step 1: Port the tests and watch them fail**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- tests/ui-profile.test.ts tests/shooting-profile-persistence-ui.test.ts
```

Run: `corepack pnpm vitest run tests/ui-profile.test.ts tests/shooting-profile-persistence-ui.test.ts`
Expected: FAIL — `components/profile/*` missing.

- [ ] **Step 2: Port the profile and remove the list**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- components/profile/profile-hero.tsx components/profile/profile-stats.tsx components/profile/motion-grid.tsx components/profile/account-panel.tsx "app/(tabs)/profile.tsx"
```

```
git rm components/shooting-profile/profile-list.tsx
```

Confirm the owner-bound logic is a superset of `main`'s: `git diff origin/main -- "app/(tabs)/profile.tsx"` must show `loadV1`, `loadV2`, `deleteV2`, `confirmDeleteV2`, `openV2`, the generation guards and `runOwnerBoundDeleteOperationV2` unchanged, with only the visual composition and the added `loadV2Glyphs` differing.

- [ ] **Step 3: Run tests and typecheck**

Run: `corepack pnpm vitest run tests/ui-profile.test.ts tests/shooting-profile-persistence-ui.test.ts tests/ui-navigation.test.ts` → PASS.
Run: `corepack pnpm check` → pass.

- [ ] **Step 4: Commit**

Message file `uiv1-t7.txt`:

```
feat(profile): make the skeleton the profile identity

The owner's latest representative skeleton loops as the hero with
three view dots; two numbers with tiny labels; one goal line; a
three-column grid of skeleton stills where tap opens the analysis and
long-press deletes. Account controls move behind a bar action. Every
owner-bound load, delete and recovery decision stays in the route
exactly as on main; tiles fetch their full record once, guarded by the
same owner and generation checks.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 8: Analysis in three layers with a skeleton highlight; zero-literal gate on

**Files:**
- Create (port from PR5): `lib/skeleton/analysis-evidence.ts`, `components/analysis/analysis-layers.tsx`
- Modify (port from PR5, then extend): `app/private-analysis/[id].tsx`, `components/shooting-profile/sequence-viewer.tsx`
- Test: `tests/ui-analysis.test.ts` (ported then extended), `tests/analysis-evidence.test.ts` (ported), `tests/ui-tokens.test.ts` (un-skip), `tests/ui-render.test.tsx` (ported)

**Interfaces:**
- Consumes: Task 3 `SequenceViewer`, Task 4 glyph helpers.
- Produces: `SequenceViewer` gains `highlightJoint?: PersistedJointNameV2`; `primaryFinding(profile): { joint, maxConeDegrees, line }`, `confidenceBandCopy(profile)`, `jointConeSummary(profile)`, `anchorPositions(profile)`; `AnalysisSummaryLine({ profile })`, `AnalysisDetails({ profile, confidence?, shootingHand })`, `AnalysisEvidence({ profile })`.

- [ ] **Step 1: Port the tests, add the highlight assertions, watch them fail**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- tests/ui-analysis.test.ts tests/analysis-evidence.test.ts tests/ui-render.test.tsx
```

Append to `tests/ui-analysis.test.ts` inside `describe("analysis in three layers", …)`:

```ts
  it("puts one visual highlight on the skeleton: the joint behind the primary finding", () => {
    // The route hands the least certain joint to the player, and the player
    // draws exactly one ring around it, in the accent, on top of the joints.
    expect(route).toContain("highlightJoint={primaryFinding(loadState.record.profile).joint}");
    expect(viewer).toContain("highlightJoint?: PersistedJointNameV2;");
    const stage = viewer.slice(viewer.indexOf("<Svg"), viewer.indexOf("</Svg>"));
    expect(stage).toContain("highlightJoint ? (");
    expect(stage).toContain('fill="none"');
    expect(stage).toContain("stroke={tokens.primary}");
    expect(stage.indexOf("highlightJoint ? (")).toBeGreaterThan(stage.indexOf("DISPLAY_JOINTS.map"));
  });
```

Run: `corepack pnpm vitest run tests/ui-analysis.test.ts tests/analysis-evidence.test.ts`
Expected: FAIL — `components/analysis/analysis-layers.tsx` missing.

- [ ] **Step 2: Port the analysis files**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- lib/skeleton/analysis-evidence.ts components/analysis/analysis-layers.tsx "app/private-analysis/[id].tsx"
```

- [ ] **Step 3: Add the highlight to the player**

In `components/shooting-profile/sequence-viewer.tsx`:

1. Extend the props type:

```ts
type SequenceViewerProps = {
  profile: RepresentativePose4DV2;
  /** Accepted for callers that pass the record whole; the percentage is shown by the analysis route's detail layer, not here. */
  confidence?: number;
  shootingHand?: ShootingHandV2;
  /** One joint to ring in the accent: the joint behind layer 1's finding. */
  highlightJoint?: PersistedJointNameV2;
};
```

2. Destructure it: `export function SequenceViewer({ profile, shootingHand = "right", highlightJoint }: SequenceViewerProps) {`

3. Inside the `<Svg>` after the `{DISPLAY_JOINTS.map(...)}` block and before `</Svg>`, add:

```tsx
          {highlightJoint ? (
            <Circle
              cx={canvasPoints[highlightJoint].x}
              cy={canvasPoints[highlightJoint].y}
              r={13}
              fill="none"
              stroke={tokens.primary}
              strokeWidth={2}
              strokeDasharray="3 3"
              opacity={0.95}
            />
          ) : null}
```

4. Extend the stage accessibility label so the highlight is announced: change `accessibilityLabel={`${selectedView.label}, ${frameIndex}% 위상 대표 골격 이미지, 관측 관절 12개와 표시용 파생 관절 4개`}` to `accessibilityLabel={`${selectedView.label}, ${frameIndex}% 위상 대표 골격 이미지, 관측 관절 12개와 표시용 파생 관절 4개${highlightJoint ? `, ${JOINT_LABELS_KO[highlightJoint]} 강조` : ""}`}` and add the import `import { JOINT_LABELS_KO } from "@/lib/skeleton/analysis-evidence";`.

Then in `app/private-analysis/[id].tsx` add `primaryFinding` to the import from `@/lib/skeleton/analysis-evidence` (`import { primaryFinding } from "@/lib/skeleton/analysis-evidence";`) and pass it:

```tsx
        <SequenceViewer
          confidence={loadState.record.confidence}
          highlightJoint={primaryFinding(loadState.record.profile).joint}
          profile={loadState.record.profile}
          shootingHand={loadState.record.shootingHand}
        />
```

- [ ] **Step 4: Turn the colour-literal gate on**

In `tests/ui-tokens.test.ts` change `it.skip("leaves no colour literal` back to `it("leaves no colour literal` and delete the comment line added in Task 1.

- [ ] **Step 5: Run everything that now exists**

Run: `corepack pnpm vitest run tests/ui-analysis.test.ts tests/analysis-evidence.test.ts tests/ui-tokens.test.ts tests/ui-render.test.tsx tests/shooting-profile-sequence-viewer.test.ts` → PASS (the sequence-viewer static-safety test still passes: the ring uses `tokens.primary`, and `fill="none"` is not a colour literal).
Run: `corepack pnpm check` → pass. `corepack pnpm lint` → 0 problems.

- [ ] **Step 6: Commit**

Message file `uiv1-t8.txt`:

```
feat(analysis): show one finding, one highlight, then the numbers

Layer one is a confidence band and the single statement the stored
record can support honestly: the least certain joint and its cone. The
player rings that joint in the accent so the finding is visible on the
skeleton itself, and the stage label says so for VoiceOver. The
percentage and conventions sit one tap deeper; per-joint cones and the
boundary of what the record is sit a tap below that. Access rules are
unchanged. With every screen painted from tokens, the colour-literal
gate is now enforced.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 9: Capture guidance — protocol data separated from presentation (yaw-ready)

**Files:**
- Create: `lib/shooting-profile/capture-guidance.ts`
- Test: `tests/capture-guidance.test.ts`

**Interfaces:**
- Consumes: `buildCapturePlan(mode)` from `@/lib/shooting-profile/capture-plan` (unchanged), types from `@/lib/shooting-profile/types`.
- Produces:

```ts
export type CaptureGuidanceViewId = CaptureViewV2 | "left_oblique" | "right_oblique";
export type CaptureGuidanceIcon = "human" | "camera" | "angle-acute";
export type CaptureViewGuidance = Readonly<{ view: CaptureGuidanceViewId; title: string; stand: string; camera: string; cameraYawDegrees: number | null; icon: CaptureGuidanceIcon }>;
export type CaptureProtocolPresentation = Readonly<{ mode: CaptureProtocolV2; modeTitle: string; modeLine: string; takesPerView: number; views: readonly CaptureViewGuidance[] }>;
export function captureViewGuidance(view: CaptureGuidanceViewId, shootingHand: ShootingHandV2): CaptureViewGuidance;
export function captureProtocolPresentation(mode: CaptureProtocolV2, shootingHand: ShootingHandV2): CaptureProtocolPresentation;
export function captureGuidanceForSlot(slot: Pick<CaptureSlotV2, "view">, shootingHand: ShootingHandV2): CaptureViewGuidance;
export function describeCameraYaw(guidance: CaptureViewGuidance): string | null;
```

- [ ] **Step 1: Write the failing test `tests/capture-guidance.test.ts`**

```ts
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  captureGuidanceForSlot,
  captureProtocolPresentation,
  captureViewGuidance,
  describeCameraYaw,
} from "@/lib/shooting-profile/capture-guidance";
import { buildCapturePlan } from "@/lib/shooting-profile/capture-plan";

describe("capture guidance: protocol data, not layout", () => {
  it("derives the views to present from the capture plan, in plan order, once per view", () => {
    const basic = captureProtocolPresentation("basic_1_plus_1", "right");
    const high = captureProtocolPresentation("high_accuracy_3_plus_3", "left");

    expect(basic.views.map((view) => view.view)).toEqual(["front", "shooting_side"]);
    expect(high.views.map((view) => view.view)).toEqual(["front", "shooting_side"]);
    expect(basic.takesPerView).toBe(1);
    expect(high.takesPerView).toBe(3);
    expect(basic.modeLine).toContain("1");
    expect(high.modeLine).toContain("3");
  });

  it("tells a shooter where to stand and where the camera goes, in one line each, in their own handedness", () => {
    const right = captureViewGuidance("shooting_side", "right");
    const left = captureViewGuidance("shooting_side", "left");

    expect(right.camera).toContain("오른쪽");
    expect(left.camera).toContain("왼쪽");
    for (const guidance of [right, left, captureViewGuidance("front", "right")]) {
      expect(guidance.title.length).toBeGreaterThan(0);
      expect(guidance.stand).not.toContain("\n");
      expect(guidance.camera).not.toContain("\n");
      expect(guidance.stand.length).toBeLessThanOrEqual(40);
      expect(guidance.camera.length).toBeLessThanOrEqual(40);
    }
  });

  it("maps every slot of both protocols to guidance without inventing views", () => {
    for (const mode of ["basic_1_plus_1", "high_accuracy_3_plus_3"] as const) {
      for (const slot of buildCapturePlan(mode)) {
        expect(captureGuidanceForSlot(slot, "right").view).toBe(slot.view);
      }
    }
  });

  it("carries no camera-yaw requirement for the current protocol, and renders yaw only when a protocol declares one", () => {
    for (const mode of ["basic_1_plus_1", "high_accuracy_3_plus_3"] as const) {
      for (const guidance of captureProtocolPresentation(mode, "right").views) {
        expect(guidance.cameraYawDegrees).toBeNull();
        expect(describeCameraYaw(guidance)).toBeNull();
      }
    }
    // The presentation vocabulary already knows oblique views so a future
    // protocol needs configuration, not a new screen; today nothing selects them.
    expect(captureViewGuidance("left_oblique", "right").cameraYawDegrees).toBeNull();
    expect(captureViewGuidance("right_oblique", "right").cameraYawDegrees).toBeNull();
    expect(describeCameraYaw({ ...captureViewGuidance("right_oblique", "right"), cameraYawDegrees: 57.5 })).toBe("카메라 각도 57.5°");
    const source = readFileSync("lib/shooting-profile/capture-guidance.ts", "utf8");
    expect(source).not.toMatch(/45|60|90/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `corepack pnpm vitest run tests/capture-guidance.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/shooting-profile/capture-guidance.ts`**

```ts
import { buildCapturePlan } from "@/lib/shooting-profile/capture-plan";
import type { CaptureProtocolV2, CaptureSlotV2, CaptureViewV2, ShootingHandV2 } from "@/lib/shooting-profile/types";

/**
 * Capture guidance as data.
 *
 * The protocol (`buildCapturePlan`) decides which views and how many takes;
 * this module only says how to present a view: where to stand, where the
 * camera goes, and — when a protocol declares one — the camera yaw. The
 * presentation vocabulary is deliberately wider than today's protocol so a
 * future oblique protocol is a configuration change, not a new screen.
 * Nothing here defines a yaw requirement; every current view carries null.
 */
export type CaptureGuidanceViewId = CaptureViewV2 | "left_oblique" | "right_oblique";
export type CaptureGuidanceIcon = "human" | "camera" | "angle-acute";

export type CaptureViewGuidance = Readonly<{
  view: CaptureGuidanceViewId;
  title: string;
  /** Where to stand, one short line. */
  stand: string;
  /** Where to put the camera, one short line. */
  camera: string;
  /** Shooter-centric camera yaw in degrees when the protocol declares one; null otherwise. */
  cameraYawDegrees: number | null;
  icon: CaptureGuidanceIcon;
}>;

export type CaptureProtocolPresentation = Readonly<{
  mode: CaptureProtocolV2;
  modeTitle: string;
  modeLine: string;
  takesPerView: number;
  views: readonly CaptureViewGuidance[];
}>;

const HAND_SIDE: Readonly<Record<ShootingHandV2, string>> = { right: "오른쪽", left: "왼쪽" };
const OTHER_SIDE: Readonly<Record<ShootingHandV2, string>> = { right: "왼쪽", left: "오른쪽" };

export function captureViewGuidance(view: CaptureGuidanceViewId, shootingHand: ShootingHandV2): CaptureViewGuidance {
  switch (view) {
    case "front":
      return { view, title: "정면", stand: "골대를 보고 평소 자리에", camera: "골대 쪽에서 정면, 전신이 다 보이게", cameraYawDegrees: null, icon: "human" };
    case "shooting_side":
      return { view, title: "슈팅 측면", stand: "같은 자리에서 같은 슛", camera: `슈팅 손 쪽(${HAND_SIDE[shootingHand]}) 옆에서, 전신이 다 보이게`, cameraYawDegrees: null, icon: "camera" };
    case "left_oblique":
      return { view, title: "왼쪽 사선", stand: "같은 자리에서 같은 슛", camera: `${OTHER_SIDE["right"]} 앞 대각선에서, 전신이 다 보이게`, cameraYawDegrees: null, icon: "angle-acute" };
    case "right_oblique":
      return { view, title: "오른쪽 사선", stand: "같은 자리에서 같은 슛", camera: `${HAND_SIDE["right"]} 앞 대각선에서, 전신이 다 보이게`, cameraYawDegrees: null, icon: "angle-acute" };
  }
}

export function captureProtocolPresentation(mode: CaptureProtocolV2, shootingHand: ShootingHandV2): CaptureProtocolPresentation {
  const slots = buildCapturePlan(mode);
  const views = [...new Set(slots.map((slot) => slot.view))].map((view) => captureViewGuidance(view, shootingHand));
  const takesPerView = views.length === 0 ? 0 : slots.length / views.length;
  return {
    mode,
    modeTitle: mode === "basic_1_plus_1" ? "Basic" : "High",
    modeLine: mode === "basic_1_plus_1" ? "정면 1 · 측면 1 · 대표 스냅샷" : "정면 3 · 측면 3 · 반복 일치",
    takesPerView,
    views,
  };
}

export function captureGuidanceForSlot(slot: Pick<CaptureSlotV2, "view">, shootingHand: ShootingHandV2): CaptureViewGuidance {
  return captureViewGuidance(slot.view, shootingHand);
}

/** A yaw line only when a protocol declared one; the current protocol never does. */
export function describeCameraYaw(guidance: CaptureViewGuidance): string | null {
  if (guidance.cameraYawDegrees === null || !Number.isFinite(guidance.cameraYawDegrees)) return null;
  return `카메라 각도 ${guidance.cameraYawDegrees}°`;
}
```

(The oblique `camera` lines reference the right-hand side only as words, never as a number; the test's `/45|60|90/` scan enforces that no yaw number lives here.)

- [ ] **Step 4: Run the test**

Run: `corepack pnpm vitest run tests/capture-guidance.test.ts` → PASS (4 tests).
Run: `corepack pnpm check` → pass.

- [ ] **Step 5: Commit**

Message file `uiv1-t9.txt`:

```
feat(capture): describe capture views as guidance data

Which views and how many takes stay the protocol's decision in
buildCapturePlan; this module only says how to present a view: where
to stand, where the camera goes, and a yaw line when a protocol
declares one. The vocabulary already includes oblique views so a
future protocol is configuration rather than a new screen, and every
view the current protocol produces carries a null yaw, which the test
pins alongside a scan that no yaw number appears in the module.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 10: Capture presentation — stand, camera, shoot, accept or recapture

**Files:**
- Create: `components/capture/capture-guide.tsx`
- Modify (rewrite): `components/shooting-profile/capture-session.tsx`, `components/shooting-profile/capture-mode-picker.tsx`, `components/shooting-profile/capture-slot-card.tsx`, `components/shooting-profile/quality-summary.tsx`
- Test: `tests/ui-capture.test.ts` (new), `tests/ui-apple-design.test.ts` (ported then extended), `tests/shooting-profile-persistence-ui.test.ts` (unchanged, must stay green)

**Interfaces:**
- Consumes: `useShootingProfileCapture` (unchanged), `captureProtocolPresentation`/`captureGuidanceForSlot` (Task 9), `SkeletonLoop`/`LoopStage`/`representativeConfidence` (Task 4), `confidenceBandCopy` (Task 8), `TopBar`, tokens, typography.
- Produces: `CaptureSession({ completionActionLabel, onClose, onComplete, saveProfile? })` (unchanged signature) and `CaptureSessionView({ controller, completionActionLabel, onClose, onComplete, width? })` with

```ts
export type CaptureController = {
  state: CaptureSessionState;
  canSave: boolean;
  selectMode: (mode: CaptureProtocolV2) => void;
  returnToModeSelect: () => void;
  setShootingHand: (hand: ShootingHandV2) => void;
  startCollection: () => void;
  acquireSlot: (slotId: string, source: "camera" | "library") => Promise<void> | void;
  retakeSlot: (slotId: string) => void;
  cancelSession: () => void;
  retrySession: () => void;
  save: () => Promise<void> | void;
};
```

`CaptureGuide({ views })`, `CaptureModePicker({ onSelect, disabled? })`, `CaptureSlotCard({ slot, title, onCamera, onLibrary, onRetake, disabled? })`, `QualitySummary({ mode, profile, confidence, shootingHand, canSave, saving, onSave, width })`.

- [ ] **Step 1: Write the failing test `tests/ui-capture.test.ts`**

```ts
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const session = readFileSync("components/shooting-profile/capture-session.tsx", "utf8");
const guide = readFileSync("components/capture/capture-guide.tsx", "utf8");
const picker = readFileSync("components/shooting-profile/capture-mode-picker.tsx", "utf8");
const slot = readFileSync("components/shooting-profile/capture-slot-card.tsx", "utf8");
const review = readFileSync("components/shooting-profile/quality-summary.tsx", "utf8");
const hook = readFileSync("hooks/use-shooting-profile-capture.ts", "utf8");

describe("capture: stand, camera, shoot, accept or recapture", () => {
  it("keeps the state machine and the hook untouched and renders every status", () => {
    expect(session).toContain("useShootingProfileCapture({ saveProfile })");
    expect(session).toContain("export function CaptureSessionView(");
    for (const status of ["mode_select", "setup", "collecting", "ready_to_aggregate", "aggregating", "result_review", "saving", "complete", "cancelled", "error"]) {
      expect(session, status).toContain(`"${status}"`);
    }
    // Recapture guidance comes from the typed reasons the hook already maps; the view never invents copy.
    expect(session).not.toMatch(/reasonCode ===|recaptureReasonCode ===/);
    expect(slot).toContain("slot.rejectionReason");
    expect(hook).toContain("recaptureReason(result.reason)");
  });

  it("renders guidance from protocol data, never from a hard-coded view layout or a yaw number", () => {
    expect(session).toContain("captureProtocolPresentation(");
    expect(session).toContain("captureGuidanceForSlot(");
    expect(guide).toContain("describeCameraYaw(");
    expect(guide).toContain("views.map(");
    expect(session).not.toMatch(/정면 클립부터|카메라를 한 번 옮겨/);
    for (const source of [session, guide, picker, slot, review]) {
      expect(source).not.toMatch(/45°|60°|±/);
      expect(source).not.toMatch(/#[0-9A-Fa-f]{6}\b|rgba?\(/);
      expect(source).not.toMatch(/fontFamily: "Barlow/);
    }
  });

  it("keeps the text budget: one line to stand, one line for the camera, short step titles", () => {
    expect(guide).toContain("numberOfLines={1}");
    expect(session).not.toMatch(/모든 필수 클립이 통과했습니다\. 정면과 측면의 서로 다른 시간축/);
    expect(session).not.toContain("StepHeader");
    expect(picker).not.toContain("각 시점의 반복 슛을 먼저 비교한 뒤");
  });

  it("puts the result skeleton first on review and keeps the truthful consent copy beside save", () => {
    expect(review).toContain("<SkeletonLoop");
    expect(review).toContain("<LoopStage");
    expect(review.indexOf("<LoopStage")).toBeLessThan(review.indexOf("<Pressable"));
    expect(review).toContain("confidenceBandCopy(profile)");
    expect(review).toContain("representativeConfidence(profile)");
    expect(review).not.toMatch(/정규화 위상|101/);
  });

  it("labels every control for assistive technology with a 44-point target and touch-down feedback", () => {
    for (const source of [session, picker, slot, review]) {
      const pressables = source.match(/<Pressable\b/g)?.length ?? 0;
      expect(pressables).toBeGreaterThan(0);
      expect(source.match(/accessibilityRole=/g)?.length ?? 0).toBeGreaterThanOrEqual(pressables);
      expect(source.match(/accessibilityLabel=/g)?.length ?? 0).toBeGreaterThanOrEqual(pressables);
      expect(source).toMatch(/minHeight: (?:44|4[5-9]|[5-9]\d)/);
      expect(source).toMatch(/pressed && (?:!\w+ && )?styles\.pressed/);
    }
    expect(session).toContain("accessibilityLiveRegion");
  });
});
```

- [ ] **Step 2: Port `tests/ui-apple-design.test.ts` and extend its list**

```
git checkout origin/feat/uiux-skeleton-social-redesign -- tests/ui-apple-design.test.ts
```

Edit the `REDESIGNED` array: replace `"app/(tabs)/index.tsx",` with `"app/(tabs)/index.tsx",\n  "components/home/home-feed.tsx",`, and append `"components/shooting-profile/capture-session.tsx",\n  "components/shooting-profile/capture-mode-picker.tsx",\n  "components/shooting-profile/capture-slot-card.tsx",\n  "components/shooting-profile/quality-summary.tsx",\n  "components/capture/capture-guide.tsx",` before the closing `];`. In the test "makes every loop behave like a post", change `for (const file of ["app/(tabs)/index.tsx", "components/profile/profile-hero.tsx"])` to `for (const file of ["components/home/home-feed.tsx", "components/profile/profile-hero.tsx", "components/shooting-profile/quality-summary.tsx"])`.

Run: `corepack pnpm vitest run tests/ui-capture.test.ts tests/ui-apple-design.test.ts`
Expected: FAIL — `components/capture/capture-guide.tsx` missing; capture files still use Barlow.

- [ ] **Step 3: Write `components/capture/capture-guide.tsx`**

```tsx
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { StyleSheet, Text, View } from "react-native";

import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { describeCameraYaw, type CaptureViewGuidance } from "@/lib/shooting-profile/capture-guidance";

type CaptureGuideProps = { views: readonly CaptureViewGuidance[] };

/**
 * Where to stand and where the camera goes, one row per view, rendered from
 * guidance data. A yaw line appears only when the protocol declares one.
 */
export function CaptureGuide({ views }: CaptureGuideProps) {
  return (
    <View style={styles.list}>
      {views.map((guidance) => {
        const yaw = describeCameraYaw(guidance);
        return (
          <View key={guidance.view} accessible accessibilityLabel={`${guidance.title}. 서는 곳: ${guidance.stand}. 카메라: ${guidance.camera}${yaw ? `. ${yaw}` : ""}`} style={styles.row}>
            <View style={styles.icon}>
              <MaterialCommunityIcons name={guidance.icon} size={22} color={tokens.primary} />
            </View>
            <View style={styles.copy}>
              <Text numberOfLines={1} style={styles.title}>{guidance.title}</Text>
              <Text numberOfLines={1} style={styles.line}>{guidance.stand}</Text>
              <Text numberOfLines={1} style={styles.line}>{guidance.camera}</Text>
              {yaw ? <Text numberOfLines={1} style={styles.yaw}>{yaw}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: { alignItems: "center", backgroundColor: tokens.surface, borderRadius: 14, flexDirection: "row", gap: 12, minHeight: 64, paddingHorizontal: 12, paddingVertical: 10 },
  icon: { alignItems: "center", backgroundColor: tokens.primarySoft, borderRadius: 12, height: 40, justifyContent: "center", width: 40 },
  copy: { flex: 1, gap: 1 },
  title: { ...typography.headline, color: tokens.foreground },
  line: { ...typography.callout, color: tokens.mutedForeground },
  yaw: { ...typography.label, color: tokens.primary },
});
```

- [ ] **Step 4: Rewrite `components/shooting-profile/capture-mode-picker.tsx`**

```tsx
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { captureProtocolPresentation } from "@/lib/shooting-profile/capture-guidance";
import type { CaptureProtocolV2 } from "@/lib/shooting-profile/types";

type CaptureModePickerProps = {
  onSelect: (mode: CaptureProtocolV2) => void;
  disabled?: boolean;
};

const MODES: readonly CaptureProtocolV2[] = ["basic_1_plus_1", "high_accuracy_3_plus_3"];

/** Two rows: the mode name and one line of what it asks for. */
export function CaptureModePicker({ onSelect, disabled = false }: CaptureModePickerProps) {
  return (
    <View style={styles.options}>
      {MODES.map((mode) => {
        const presentation = captureProtocolPresentation(mode, "right");
        const evidence = mode === "basic_1_plus_1" ? "대표 스냅샷 추정 · 반복성 측정 아님" : "3회 반복 일치도를 확인하는 고정밀 모드";
        return (
          <Pressable
            key={mode}
            accessibilityLabel={`${presentation.modeTitle} · ${presentation.modeLine} 선택. ${evidence}`}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onSelect(mode)}
            style={({ pressed }) => [styles.option, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
          >
            <View style={styles.copy}>
              <Text style={styles.title}>{presentation.modeTitle}</Text>
              <Text numberOfLines={1} style={styles.line}>{presentation.modeLine}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color={tokens.mutedForeground} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  options: { gap: 10 },
  option: { alignItems: "center", backgroundColor: tokens.surface, borderRadius: 14, flexDirection: "row", gap: 12, minHeight: 64, paddingHorizontal: 14, paddingVertical: 12 },
  copy: { flex: 1, gap: 2 },
  title: { ...typography.title, color: tokens.foreground },
  line: { ...typography.callout, color: tokens.mutedForeground },
  disabled: { opacity: 0.46 },
  pressed: { opacity: 0.7 },
});
```

- [ ] **Step 5: Rewrite `components/shooting-profile/capture-slot-card.tsx`**

```tsx
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import type { CaptureSessionSlot } from "@/lib/shooting-profile/capture-session-reducer";

type CaptureSlotCardProps = {
  slot: CaptureSessionSlot;
  /** The view's guidance title, e.g. 정면 or 슈팅 측면. */
  title: string;
  onCamera: () => void;
  onLibrary: () => void;
  onRetake: () => void;
  disabled?: boolean;
};

function slotLabel(slot: CaptureSessionSlot, title: string): string {
  return `${title} ${slot.takeIndex + 1}회`;
}

function statusCopy(slot: CaptureSessionSlot): string {
  if (slot.status === "acquiring") return "권한 확인 및 영상 선택 중";
  if (slot.status === "analyzing") {
    const progress = slot.progress;
    return progress && progress.total > 0 ? `기기 내 포즈 분석 중 · ${progress.completed}/${progress.total}` : "기기 내 포즈 분석 준비 중";
  }
  if (slot.status === "accepted") return "통과";
  if (slot.status === "rejected") return "재촬영 필요";
  if (slot.status === "cancelled") return "선택 취소";
  return slot.enabled ? "촬영 가능" : "이전 클립 통과 후";
}

function StatusDot({ slot }: { slot: CaptureSessionSlot }) {
  const color = slot.status === "accepted"
    ? tokens.positive
    : slot.status === "rejected"
      ? tokens.warning
      : slot.status === "acquiring" || slot.status === "analyzing"
        ? tokens.primary
        : tokens.mutedForeground;
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

/**
 * One take: a status line, then the actions that apply. Rejection copy is the
 * typed reason the hook already translated; it never grows into a paragraph.
 */
export function CaptureSlotCard({ slot, title, onCamera, onLibrary, onRetake, disabled = false }: CaptureSlotCardProps) {
  const label = slotLabel(slot, title);
  const working = slot.status === "acquiring" || slot.status === "analyzing";
  const captureDisabled = disabled || !slot.enabled || working || slot.status === "accepted";
  const retakeDisabled = disabled || working;

  return (
    <View style={[styles.row, !slot.enabled && slot.status !== "accepted" && styles.waiting]}>
      <StatusDot slot={slot} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.label}>{label}</Text>
        <Text accessibilityLiveRegion="polite" numberOfLines={1} style={styles.status}>{statusCopy(slot)}</Text>
        {slot.rejectionReason ? (
          <Text accessibilityLiveRegion="assertive" numberOfLines={2} style={styles.reason}>{slot.rejectionReason}</Text>
        ) : null}
      </View>
      {slot.status === "accepted" ? (
        <Pressable
          accessibilityLabel={`${label} 클립 다시 촬영 또는 선택`}
          accessibilityRole="button"
          accessibilityState={{ disabled: retakeDisabled }}
          disabled={retakeDisabled}
          onPress={onRetake}
          style={({ pressed }) => [styles.action, retakeDisabled && styles.disabled, pressed && !retakeDisabled && styles.pressed]}
        >
          <MaterialCommunityIcons name="refresh" size={22} color={tokens.foreground} />
        </Pressable>
      ) : (
        <>
          <Pressable
            accessibilityLabel={`${label} 카메라로 로컬 슈팅 클립 촬영`}
            accessibilityRole="button"
            accessibilityState={{ disabled: captureDisabled }}
            disabled={captureDisabled}
            onPress={onCamera}
            style={({ pressed }) => [styles.action, styles.primaryAction, captureDisabled && styles.disabled, pressed && !captureDisabled && styles.pressed]}
          >
            <MaterialCommunityIcons name="video" size={22} color={tokens.primaryForeground} />
          </Pressable>
          <Pressable
            accessibilityLabel={`${label} 기기 보관함에서 슈팅 영상 선택`}
            accessibilityRole="button"
            accessibilityState={{ disabled: captureDisabled }}
            disabled={captureDisabled}
            onPress={onLibrary}
            style={({ pressed }) => [styles.action, captureDisabled && styles.disabled, pressed && !captureDisabled && styles.pressed]}
          >
            <MaterialCommunityIcons name="folder-play-outline" size={22} color={tokens.foreground} />
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", backgroundColor: tokens.surface, borderRadius: 14, flexDirection: "row", gap: 10, minHeight: 64, paddingHorizontal: 12, paddingVertical: 8 },
  waiting: { opacity: 0.55 },
  dot: { borderRadius: 4, height: 8, width: 8 },
  copy: { flex: 1, gap: 1 },
  label: { ...typography.headline, color: tokens.foreground },
  status: { ...typography.caption, color: tokens.mutedForeground },
  reason: { ...typography.caption, color: tokens.warning },
  action: { alignItems: "center", borderRadius: 22, height: 44, justifyContent: "center", minHeight: 44, minWidth: 44, width: 44 },
  primaryAction: { backgroundColor: tokens.primary },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.7 },
});
```

- [ ] **Step 6: Rewrite `components/shooting-profile/quality-summary.tsx` (the review step)**

The pinned consent strings and their order come from `tests/shooting-profile-persistence-ui.test.ts`; keep them verbatim.

```tsx
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { LoopStage } from "@/components/skeleton/loop-stage";
import { representativeConfidence } from "@/components/skeleton/representative-glyph";
import { SkeletonLoop } from "@/components/skeleton/skeleton-loop";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { confidenceBandCopy } from "@/lib/skeleton/analysis-evidence";
import type { CaptureProtocolV2, RepresentativePose4DV2, ShootingHandV2 } from "@/lib/shooting-profile/types";

type QualitySummaryProps = {
  mode: CaptureProtocolV2;
  profile: RepresentativePose4DV2;
  confidence: number;
  shootingHand: ShootingHandV2;
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
  width: number;
};

/**
 * Review: the result skeleton first, one band line, then the truthful consent
 * copy and the save action. The percentage stays out of this step; the
 * analysis route's detail layer shows it after saving.
 */
export function QualitySummary({ mode, profile, confidence, shootingHand, canSave, saving, onSave, width }: QualitySummaryProps) {
  const [focused, setFocused] = useState(false);
  const saveDisabled = !canSave || saving;
  const band = confidenceBandCopy(profile);
  const height = Math.round(width * 0.9);
  const evidence = mode === "basic_1_plus_1" ? "대표 스냅샷 추정 · 반복성 측정 아님" : "3회 반복 일치도를 확인하는 고정밀 모드";
  const confidenceKnown = Number.isFinite(confidence);

  return (
    <View style={styles.review}>
      <LoopStage accessibilityLabel="대표 슛폼 결과 skeleton" height={height} width={width}>
        {(paused) => (
          <SkeletonLoop
            accessibilityLabel={`대표 슛폼 결과 skeleton, 사선 시점 재생${confidenceKnown ? "" : ""}`}
            confidence={representativeConfidence(profile)}
            height={height}
            paused={paused}
            profile={profile}
            shootingHand={shootingHand}
            view="oblique"
            width={width}
          />
        )}
      </LoopStage>
      <View accessible accessibilityLabel={`${band.title}, ${band.quality}. ${evidence}. 위상 결합 4D 추정 · 실측 3D 아님`} style={styles.bandRow}>
        <View style={[styles.dot, band.band === "high" && styles.dotHigh, !profile.quality.passed && styles.dotRecapture]} />
        <Text numberOfLines={1} style={styles.bandText}>{band.title} · <Text style={profile.quality.passed ? styles.pass : styles.recapture}>{band.quality}</Text></Text>
      </View>
      <Text numberOfLines={1} style={styles.evidence}>{evidence} · 위상 결합 4D 추정 · 실측 3D 아님</Text>
      <View style={styles.consent}>
        <MaterialCommunityIcons name="lock-outline" size={18} color={tokens.mutedForeground} />
        <Text style={styles.consentText}>
          {saving
            ? "12개 허용 관절의 위상 정규화 2D 관찰값과 대표 추정치만 비공개로 저장하는 중입니다. 원본 영상, 파일명, 원본 MediaPipe 깊이값은 업로드하지 않습니다. 아직 저장 완료로 표시하지 않습니다."
            : canSave
            ? "아직 저장되지 않았습니다. 저장하면 12개 허용 관절의 위상 정규화 2D 관찰값과 대표 추정치만 업로드합니다. 원본 영상, 파일명, 원본 MediaPipe 깊이값은 업로드하지 않습니다. 이 파생 데이터는 사용자가 삭제할 때까지 비공개로 보관됩니다."
            : "아직 저장되지 않았습니다. 이 결과의 비공개 저장 준비 데이터가 현재 세션에 없습니다. 필요한 클립을 다시 촬영해 주세요."}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={saving ? "대표 슛폼 비공개 저장 중" : canSave ? "대표 슛폼을 비공개 프로필로 저장" : "비공개 저장 기능 준비 중"}
        accessibilityRole="button"
        accessibilityState={{ disabled: saveDisabled, busy: saving }}
        disabled={saveDisabled}
        focusable
        onBlur={() => setFocused(false)}
        onFocus={() => setFocused(true)}
        onPress={onSave}
        style={({ pressed }) => [styles.save, focusStyle(focused), saveDisabled && styles.disabled, pressed && !saveDisabled && styles.pressed]}
      >
        <MaterialCommunityIcons name="lock" size={18} color={tokens.primaryForeground} />
        <Text accessibilityLiveRegion="polite" style={styles.saveText}>{saving ? "저장 중" : canSave ? "비공개 저장" : "비공개 저장 준비 중"}</Text>
      </Pressable>
    </View>
  );
}

function focusStyle(focused: boolean): ViewStyle {
  if (!focused) return {};
  return {
    elevation: 8,
    outlineColor: tokens.focusRing,
    outlineOffset: 2,
    outlineStyle: "solid",
    outlineWidth: 3,
    shadowColor: tokens.background,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  };
}

const styles = StyleSheet.create({
  review: { gap: 8 },
  bandRow: { alignItems: "center", flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingTop: 8 },
  dot: { backgroundColor: tokens.mutedForeground, borderRadius: 5, height: 10, width: 10 },
  dotHigh: { backgroundColor: tokens.analysisHighConfidence },
  dotRecapture: { backgroundColor: tokens.warning },
  bandText: { ...typography.callout, color: tokens.foreground, fontWeight: "700" },
  pass: { color: tokens.positive, fontWeight: "400" },
  recapture: { color: tokens.warning, fontWeight: "400" },
  evidence: { ...typography.caption, color: tokens.mutedForeground, paddingHorizontal: 14 },
  consent: { alignItems: "flex-start", flexDirection: "row", gap: 8, marginHorizontal: 14, marginTop: 6 },
  consentText: { ...typography.caption, color: tokens.mutedForeground, flex: 1 },
  save: { alignItems: "center", backgroundColor: tokens.primary, borderRadius: 12, flexDirection: "row", gap: 8, justifyContent: "center", marginHorizontal: 14, marginTop: 8, minHeight: 48, minWidth: 44, paddingHorizontal: 16 },
  saveText: { ...typography.headline, color: tokens.primaryForeground },
  disabled: { opacity: 0.44 },
  pressed: { opacity: 0.74 },
});
```

Remove the no-op template piece: replace `accessibilityLabel={`대표 슛폼 결과 skeleton, 사선 시점 재생${confidenceKnown ? "" : ""}`}` with `accessibilityLabel="대표 슛폼 결과 skeleton, 사선 시점 재생"` and delete the `confidenceKnown` line (the `confidence` prop stays in the props type because the session passes it and the analysis layer shows it later; add `void confidence;` immediately after the destructuring so the unused-variable lint rule is satisfied explicitly).

- [ ] **Step 7: Rewrite `components/shooting-profile/capture-session.tsx`**

```tsx
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { CaptureGuide } from "@/components/capture/capture-guide";
import { ScreenContainer } from "@/components/screen-container";
import { CaptureModePicker } from "@/components/shooting-profile/capture-mode-picker";
import { CaptureSlotCard } from "@/components/shooting-profile/capture-slot-card";
import { QualitySummary } from "@/components/shooting-profile/quality-summary";
import { TopBar } from "@/components/ui/top-bar";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { type SaveRepresentativeProfile, useShootingProfileCapture } from "@/hooks/use-shooting-profile-capture";
import { captureGuidanceForSlot, captureProtocolPresentation } from "@/lib/shooting-profile/capture-guidance";
import type { CaptureSessionState } from "@/lib/shooting-profile/capture-session-reducer";
import type { CaptureProtocolV2, ShootingHandV2 } from "@/lib/shooting-profile/types";

type CaptureSessionProps = {
  completionActionLabel: string;
  onClose: () => void;
  onComplete: (savedProfileId: string) => void;
  saveProfile?: SaveRepresentativeProfile;
};

/** Everything the presentation needs from the capture hook; the hook's return type satisfies it. */
export type CaptureController = {
  state: CaptureSessionState;
  canSave: boolean;
  selectMode: (mode: CaptureProtocolV2) => void;
  returnToModeSelect: () => void;
  setShootingHand: (hand: ShootingHandV2) => void;
  startCollection: () => void;
  acquireSlot: (slotId: string, source: "camera" | "library") => Promise<void> | void;
  retakeSlot: (slotId: string) => void;
  cancelSession: () => void;
  retrySession: () => void;
  save: () => Promise<void> | void;
};

type CaptureSessionViewProps = {
  controller: CaptureController;
  completionActionLabel: string;
  onClose: () => void;
  onComplete: (savedProfileId: string) => void;
  /** Stage width for the review skeleton; measured by the container when omitted. */
  width?: number;
};

const FALLBACK_WIDTH = 375;
const MAX_WIDTH = 680;
const STEP_TITLES: Readonly<Record<CaptureSessionState["status"], string>> = {
  mode_select: "어떻게 만들까요?",
  setup: "서는 곳과 카메라",
  collecting: "촬영",
  ready_to_aggregate: "결합 중",
  aggregating: "결합 중",
  result_review: "확인",
  saving: "확인",
  complete: "저장 완료",
  cancelled: "멈춤",
  error: "다시 확인",
};

function focusStyle(focused: boolean, dark = false): ViewStyle {
  if (!focused) return {};
  return {
    elevation: 8,
    outlineColor: tokens.focusRing,
    outlineOffset: 2,
    outlineStyle: "solid",
    outlineWidth: 3,
    shadowColor: dark ? tokens.background : tokens.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  };
}

/** Owns the capture hook; nothing else. */
export function CaptureSession({ completionActionLabel, onClose, onComplete, saveProfile }: CaptureSessionProps) {
  const capture = useShootingProfileCapture({ saveProfile });
  return <CaptureSessionView completionActionLabel={completionActionLabel} controller={capture} onClose={onClose} onComplete={onComplete} />;
}

/**
 * Capture in four moves: where to stand and where the camera goes (from
 * guidance data), shoot, then accept or recapture. Every status of the
 * unchanged state machine is rendered; recapture copy is the typed reason
 * the hook already translated.
 */
export function CaptureSessionView({ controller, completionActionLabel, onClose, onComplete, width: forcedWidth }: CaptureSessionViewProps) {
  const { state } = controller;
  const [focusedControl, setFocusedControl] = useState<string | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const width = Math.min(forcedWidth ?? (measuredWidth || FALLBACK_WIDTH), MAX_WIDTH);
  const saving = state.status === "saving";
  const presentation = state.mode ? captureProtocolPresentation(state.mode, state.shootingHand) : null;

  const close = () => {
    controller.cancelSession();
    onClose();
  };

  const focus = (key: string) => ({
    focusable: true,
    onBlur: () => setFocusedControl((current) => current === key ? null : current),
    onFocus: () => setFocusedControl(key),
  });

  const renderSlots = () => (
    <View style={styles.slots}>
      {(presentation?.views ?? []).map((guidance) => {
        const slots = state.slots.filter((slot) => slot.view === guidance.view);
        const accepted = slots.filter((slot) => slot.status === "accepted").length;
        return (
          <View key={guidance.view} style={styles.slotGroup}>
            <View style={styles.slotHead}>
              <Text style={styles.slotTitle}>{guidance.title}</Text>
              <Text accessibilityLiveRegion="polite" style={styles.slotCount}>{accepted}/{slots.length}</Text>
            </View>
            {slots.map((slot) => (
              <CaptureSlotCard
                key={slot.id}
                disabled={saving}
                onCamera={() => void controller.acquireSlot(slot.id, "camera")}
                onLibrary={() => void controller.acquireSlot(slot.id, "library")}
                onRetake={() => controller.retakeSlot(slot.id)}
                slot={slot}
                title={captureGuidanceForSlot(slot, state.shootingHand).title}
              />
            ))}
          </View>
        );
      })}
    </View>
  );

  const primary = (key: string, label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      {...focus(key)}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, focusStyle(focusedControl === key, true), disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );

  const secondary = (key: string, label: string, onPress: () => void) => (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: false }}
      disabled={false}
      {...focus(key)}
      onPress={onPress}
      style={({ pressed }) => [styles.secondary, focusStyle(focusedControl === key), pressed && styles.pressed]}
    >
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );

  return (
    <ScreenContainer
      containerClassName="bg-background"
      edges={["top", "bottom", "left", "right"]}
      onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}
    >
      <TopBar
        right={(
          <Pressable
            accessibilityLabel="대표 슛폼 촬영 화면 닫기"
            accessibilityRole="button"
            accessibilityState={{ disabled: saving, busy: saving }}
            disabled={saving}
            {...focus("close")}
            onPress={close}
            style={({ pressed }) => [styles.close, focusStyle(focusedControl === "close"), saving && styles.disabled, pressed && !saving && styles.pressed]}
          >
            <MaterialCommunityIcons name="close" size={24} color={tokens.foreground} />
          </Pressable>
        )}
        title="슛폼 촬영"
      />
      <ScrollView contentContainerStyle={[styles.page, { width }]} showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={styles.step}>{STEP_TITLES[state.status]}</Text>

        {state.status === "mode_select" ? <CaptureModePicker onSelect={controller.selectMode} /> : null}

        {state.status === "setup" && presentation ? (
          <View style={styles.stack}>
            <View style={styles.handRow}>
              {(["right", "left"] as const).map((hand) => {
                const selected = state.shootingHand === hand;
                const key = `hand-${hand}`;
                return (
                  <Pressable
                    key={hand}
                    accessibilityLabel={`${hand === "right" ? "오른손" : "왼손"} 슈터 선택`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: false, selected }}
                    aria-selected={selected}
                    disabled={false}
                    {...focus(key)}
                    onPress={() => controller.setShootingHand(hand)}
                    style={({ pressed }) => [styles.hand, selected && styles.handSelected, focusStyle(focusedControl === key), pressed && styles.pressed]}
                  >
                    <Text style={[styles.handText, selected && styles.handTextSelected]}>{hand === "right" ? "오른손" : "왼손"}</Text>
                  </Pressable>
                );
              })}
            </View>
            <CaptureGuide views={presentation.views} />
            <Text numberOfLines={1} style={styles.modeLine}>{presentation.modeTitle} · {presentation.modeLine}</Text>
            {primary("start", `${presentation.views[0]?.title ?? "정면"}부터 촬영`, controller.startCollection)}
            {secondary("mode", "모드 변경", controller.returnToModeSelect)}
          </View>
        ) : null}

        {state.status === "collecting" ? (
          <View style={styles.stack}>
            {renderSlots()}
            {secondary("cancel", "촬영 세션 취소", controller.cancelSession)}
          </View>
        ) : null}

        {state.status === "ready_to_aggregate" || state.status === "aggregating" ? (
          <View style={styles.center}>
            <ActivityIndicator color={tokens.primary} size="large" />
            <Text accessibilityLiveRegion="polite" style={styles.centerLine}>정면과 측면을 위상으로 결합하는 중</Text>
          </View>
        ) : null}

        {(state.status === "result_review" || state.status === "saving") && state.mode && state.profile && state.confidence !== undefined ? (
          <View style={styles.stack}>
            <QualitySummary
              canSave={controller.canSave}
              confidence={state.confidence}
              mode={state.mode}
              onSave={() => void controller.save()}
              profile={state.profile}
              saving={saving}
              shootingHand={state.shootingHand}
              width={width}
            />
            <Text numberOfLines={1} style={styles.retakeLine}>평소 폼과 다르면 클립 하나만 다시 선택하세요</Text>
            {renderSlots()}
          </View>
        ) : null}

        {state.status === "complete" ? (
          <View style={styles.center}>
            <View style={styles.completeIcon}>
              <MaterialCommunityIcons name="lock" size={28} color={tokens.primaryForeground} />
            </View>
            <Text accessibilityLiveRegion="polite" style={styles.centerLine}>원본 영상은 업로드하지 않았고, 파생된 대표 슛폼 데이터만 비공개로 저장했습니다.</Text>
            {primary("complete", completionActionLabel, () => state.savedProfileId && onComplete(state.savedProfileId), !state.savedProfileId)}
          </View>
        ) : null}

        {state.status === "cancelled" ? (
          <View style={styles.center}>
            <MaterialCommunityIcons name="pause-circle-outline" size={44} color={tokens.mutedForeground} />
            <Text style={styles.centerLine}>기기 내 분석 요청을 취소했습니다. 통과한 결과는 이 화면 안에서만 유지됩니다.</Text>
            {primary("resume", "세션으로 돌아가기", controller.retrySession)}
            {secondary("cancel-close", "화면 닫기", onClose)}
          </View>
        ) : null}

        {state.status === "error" ? (
          <View style={styles.center}>
            <MaterialCommunityIcons name="alert-circle-outline" size={44} color={tokens.warning} />
            <Text accessibilityLiveRegion="assertive" style={styles.errorLine}>{state.errorMessage ?? "세션을 계속하지 못했습니다."}</Text>
            {primary("retry", state.recoveryStatus === "result_review" ? "리뷰로 돌아가기" : "클립 확인하기", controller.retrySession)}
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", paddingBottom: 36, paddingTop: 6 },
  close: { alignItems: "center", borderRadius: 22, height: 44, justifyContent: "center", minHeight: 44, minWidth: 44, width: 44 },
  step: { ...typography.title, color: tokens.foreground, paddingHorizontal: 14, paddingBottom: 10, paddingTop: 8 },
  stack: { gap: 12, paddingHorizontal: 14 },
  handRow: { flexDirection: "row", gap: 8 },
  hand: { alignItems: "center", backgroundColor: tokens.elevatedSurface, borderRadius: 999, flex: 1, justifyContent: "center", minHeight: 44, minWidth: 44 },
  handSelected: { backgroundColor: tokens.foreground },
  handText: { ...typography.callout, color: tokens.foreground, fontWeight: "600" },
  handTextSelected: { color: tokens.background },
  modeLine: { ...typography.caption, color: tokens.mutedForeground },
  slots: { gap: 14 },
  slotGroup: { gap: 8 },
  slotHead: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between" },
  slotTitle: { ...typography.headline, color: tokens.foreground },
  slotCount: { ...typography.label, color: tokens.mutedForeground },
  primary: { alignItems: "center", backgroundColor: tokens.primary, borderRadius: 12, justifyContent: "center", minHeight: 48, minWidth: 44, paddingHorizontal: 16 },
  primaryText: { ...typography.headline, color: tokens.primaryForeground },
  secondary: { alignItems: "center", borderRadius: 12, justifyContent: "center", minHeight: 44, minWidth: 44, paddingHorizontal: 14 },
  secondaryText: { ...typography.callout, color: tokens.foreground, fontWeight: "600" },
  center: { alignItems: "center", gap: 14, paddingHorizontal: 24, paddingTop: 28 },
  centerLine: { ...typography.callout, color: tokens.mutedForeground, textAlign: "center" },
  errorLine: { ...typography.callout, color: tokens.warning, textAlign: "center" },
  completeIcon: { alignItems: "center", backgroundColor: tokens.positive, borderRadius: 26, height: 52, justifyContent: "center", width: 52 },
  retakeLine: { ...typography.caption, color: tokens.mutedForeground, paddingTop: 4 },
  disabled: { opacity: 0.44 },
  pressed: { opacity: 0.72 },
});
```

Notes for the implementer: `focusStyle` keeps `outlineStyle: "solid"` in this file because `tests/shooting-profile-persistence-ui.test.ts` scans the file text for `outlineStyle`, `focusable` and `minWidth: 44`. The completion copy string and `const saving = state.status === "saving"` are pinned by the same test; do not paraphrase them.

- [ ] **Step 8: Run the capture, persistence, apple-design and render suites**

Run: `corepack pnpm vitest run tests/ui-capture.test.ts tests/ui-apple-design.test.ts tests/shooting-profile-persistence-ui.test.ts tests/shooting-profile-capture-reducer.test.ts tests/ui-render.test.tsx tests/ui-tokens.test.ts` → PASS.
Run: `corepack pnpm check` → pass. `corepack pnpm lint` → 0 problems.

- [ ] **Step 9: Commit**

Message file `uiv1-t10.txt`:

```
feat(capture): rebuild capture as stand, camera, shoot, accept or recapture

The screen is now four moves. Setup shows, from guidance data, where to
stand and where the camera goes for each view of the chosen protocol,
with a yaw line only when a protocol declares one. Shooting is one row
per take with a status dot and the two ways to supply a clip; a
rejected take shows the typed reason the hook already translated, in
two lines at most. Review puts the result skeleton first as a post,
then a band line and the unchanged consent copy beside save. The
capture hook, the state machine, the admission rules and every flag
gate are untouched; the presentation is a separate component the
development demo can drive with fixture states.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 11: Development demo harness and visual QA evidence

**Files:**
- Create: `lib/dev/ui-demo.ts`, `lib/dev/ui-demo-fixtures.ts`, `app/dev/ui-demo.tsx`, `artifacts/ui-v1-final/*.png`, `docs/uiux/2026-09-15-ui-v1-final-visual-qa.md`
- Test: `tests/ui-demo-isolation.test.ts`

**Interfaces:**
- Consumes: `HomeFeed` (Task 6), `ProfileHero`/`ProfileStats`/`MotionGrid` (Task 7), analysis layers + `SequenceViewer` (Task 8), `CaptureSessionView` (Task 10), `captureSessionReducer`/`createCaptureSession` (unchanged), `buildTwoViewRepresentativeProfile` (unchanged), `syntheticLandmarkSession` (`tests/fixtures`).
- Produces: `UI_DEMO_ENABLED: boolean`; `buildUiDemoFixtures(): UiDemoFixtures`; route `/dev/ui-demo?screen=home|profile|analysis|capture&state=…`.

- [ ] **Step 1: Write the failing isolation test `tests/ui-demo-isolation.test.ts`**

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?)$/.test(entry) ? [path] : [];
  });
}

describe("development demo harness stays out of production", () => {
  const gate = readFileSync("lib/dev/ui-demo.ts", "utf8");
  const route = readFileSync("app/dev/ui-demo.tsx", "utf8");
  const fixtures = readFileSync("lib/dev/ui-demo-fixtures.ts", "utf8");

  it("is enabled only in a development bundle with an explicit opt-in variable", () => {
    expect(gate).toMatch(/UI_DEMO_ENABLED[^=]*=\s*__DEV__ && process\.env\.EXPO_PUBLIC_HOOPHUB_UI_DEMO === "1"/);
  });

  it("loads fixtures only through a require inside the gate, so a production bundle drops them", () => {
    expect(route).toContain("if (!UI_DEMO_ENABLED)");
    expect(route).toContain('require("@/lib/dev/ui-demo-fixtures")');
    expect(route).not.toMatch(/^import .*ui-demo-fixtures/m);
    expect(route.indexOf("if (!UI_DEMO_ENABLED)")).toBeLessThan(route.indexOf('require("@/lib/dev/ui-demo-fixtures")'));
  });

  it("builds fixtures from the synthetic session only: no network, no account, no real person", () => {
    expect(fixtures).toContain("syntheticLandmarkSession");
    expect(fixtures).not.toMatch(/firebase|fetch\(|axios|trpc|ImagePicker/);
    expect(fixtures).toMatch(/demo|fixture/i);
  });

  it("is never imported by a production path", () => {
    const offenders: string[] = [];
    for (const root of ["app", "components", "hooks", "lib"]) {
      for (const file of sourceFiles(join(process.cwd(), root))) {
        const rel = relative(process.cwd(), file).replace(/\\/g, "/");
        if (rel.startsWith("lib/dev/") || rel === "app/dev/ui-demo.tsx") continue;
        const source = readFileSync(file, "utf8");
        if (/@\/lib\/dev\/|@\/tests\//.test(source)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `corepack pnpm vitest run tests/ui-demo-isolation.test.ts` → FAIL (files missing).

- [ ] **Step 3: Write `lib/dev/ui-demo.ts`**

```ts
/**
 * Development-only UI demo gate. Both conditions are required: a development
 * bundle (Metro strips `__DEV__` branches from production output) and an
 * explicit opt-in variable, so the demo never appears in a release build.
 */
export const UI_DEMO_ENABLED: boolean = __DEV__ && process.env.EXPO_PUBLIC_HOOPHUB_UI_DEMO === "1";
```

- [ ] **Step 4: Write `lib/dev/ui-demo-fixtures.ts`**

```ts
import type { ShootingProfileSummaryV2, ShootingProfileViewerRecordV2 } from "@/lib/firebase-shooting-profiles";
import {
  captureSessionReducer,
  createCaptureSession,
  type CaptureSessionState,
} from "@/lib/shooting-profile/capture-session-reducer";
import { buildTwoViewRepresentativeProfile } from "@/lib/shooting-profile/two-view-pipeline";
import type { RepresentativePose4DV2 } from "@/lib/shooting-profile/types";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

/**
 * Deterministic DEMO FIXTURES for visual QA. Everything here derives from the
 * synthetic landmark session the test-suite uses: no account, no network, no
 * recording, no person. Loaded only by the gated demo route.
 */
export type UiDemoFixtures = {
  profile: RepresentativePose4DV2;
  recaptureProfile: RepresentativePose4DV2;
  record: NonNullable<ShootingProfileViewerRecordV2>;
  summaries: ShootingProfileSummaryV2[];
  capture: Record<"setup" | "collecting" | "recapture" | "review", CaptureSessionState>;
};

const DEMO_DATE = new Date(2026, 8, 15, 10, 0, 0);

function timestampLike(date: Date): ShootingProfileSummaryV2["createdAt"] {
  return { toDate: () => date } as unknown as ShootingProfileSummaryV2["createdAt"];
}

export function buildUiDemoFixtures(): UiDemoFixtures {
  const session = syntheticLandmarkSession({ mode: "basic_1_plus_1", shootingHand: "right" });
  const attempts = [...session.front, ...session.shootingSide].map((sequence) => ({ id: `${sequence.view}-${sequence.takeIndex}`, sequence }));
  const result = buildTwoViewRepresentativeProfile({ mode: "basic_1_plus_1", shootingHand: "right", attempts });
  if (result.status !== "complete") throw new Error("demo fixture must reconstruct");
  const profile = result.profile;
  const recaptureProfile: RepresentativePose4DV2 = { ...profile, quality: { passed: false, reasons: ["demo_fixture_recapture"] } };
  const record = { profile, shootingHand: "right" as const, confidence: result.confidence };
  const summaries: ShootingProfileSummaryV2[] = [
    { id: "demo-fixture-001", mode: "basic_1_plus_1", shootingHand: "right", confidence: result.confidence, createdAt: timestampLike(DEMO_DATE) },
    { id: "demo-fixture-002", mode: "high_accuracy_3_plus_3", shootingHand: "right", confidence: result.confidence, createdAt: timestampLike(new Date(2026, 8, 12)) },
    { id: "demo-fixture-003", mode: "basic_1_plus_1", shootingHand: "right", confidence: result.confidence, createdAt: timestampLike(new Date(2026, 8, 3)) },
  ];

  const setup = captureSessionReducer(createCaptureSession(), { type: "SELECT_MODE", mode: "basic_1_plus_1" });
  const collecting = captureSessionReducer(setup, { type: "START_COLLECTION" });
  const frontSlot = collecting.slots[0];
  const started = captureSessionReducer(collecting, { type: "SLOT_ACQUIRE_STARTED", slotId: frontSlot.id, requestId: "demo-request-1", generation: frontSlot.generation + 1 });
  const recapture = captureSessionReducer(started, {
    type: "SLOT_REJECTED",
    slotId: frontSlot.id,
    requestId: "demo-request-1",
    generation: frontSlot.generation + 1,
    reason: "어깨·손목·골반·무릎·발목이 충분히 보이지 않았습니다. 전신과 슈팅 팔이 가려지지 않게 다시 촬영하세요.",
  });
  let review = collecting;
  for (const slot of collecting.slots) {
    const sequence = attempts.find((attempt) => attempt.id === slot.id)?.sequence;
    if (!sequence) throw new Error("demo fixture slot has no sequence");
    const generation = review.slots.find((candidate) => candidate.id === slot.id)!.generation + 1;
    review = captureSessionReducer(review, { type: "SLOT_ACQUIRE_STARTED", slotId: slot.id, requestId: `demo-${slot.id}`, generation });
    review = captureSessionReducer(review, { type: "SLOT_ACCEPTED", slotId: slot.id, requestId: `demo-${slot.id}`, generation, sequence });
  }
  review = captureSessionReducer(review, { type: "AGGREGATE_STARTED" });
  review = captureSessionReducer(review, { type: "AGGREGATE_COMPLETED", sessionGeneration: review.sessionGeneration, profile, confidence: result.confidence });

  return { profile, recaptureProfile, record, summaries, capture: { setup, collecting, recapture, review } };
}
```

If `tsc` reports that a reducer action needs a field this fixture does not pass (for example a `stage` on `SLOT_PROGRESS`, which is not used here), read `lib/shooting-profile/capture-session-reducer.ts` lines 269–325 and pass exactly the declared fields; never change the reducer.

- [ ] **Step 5: Write `app/dev/ui-demo.tsx`**

```tsx
import { Redirect, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnalysisDetails, AnalysisEvidence, AnalysisSummaryLine } from "@/components/analysis/analysis-layers";
import { HomeFeed } from "@/components/home/home-feed";
import { MotionGrid } from "@/components/profile/motion-grid";
import { ProfileHero } from "@/components/profile/profile-hero";
import { ProfileStats } from "@/components/profile/profile-stats";
import { ScreenContainer } from "@/components/screen-container";
import { CaptureSessionView, type CaptureController } from "@/components/shooting-profile/capture-session";
import { SequenceViewer, type RepresentativeViewId } from "@/components/shooting-profile/sequence-viewer";
import { TopBar } from "@/components/ui/top-bar";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { UI_DEMO_ENABLED } from "@/lib/dev/ui-demo";
import { primaryFinding } from "@/lib/skeleton/analysis-evidence";
import type { UiDemoFixtures } from "@/lib/dev/ui-demo-fixtures";

const FALLBACK_WIDTH = 375;
const MAX_WIDTH = 680;
const noop = () => undefined;

function useDemoFixtures(): UiDemoFixtures | null {
  return useMemo(() => {
    if (!UI_DEMO_ENABLED) return null;
    // Required, not imported: Metro drops this branch from a production bundle.
    const module = require("@/lib/dev/ui-demo-fixtures") as typeof import("@/lib/dev/ui-demo-fixtures");
    return module.buildUiDemoFixtures();
  }, []);
}

/**
 * DEV DEMO. Renders the real presentational components with synthetic
 * fixtures so every state can be photographed without an account, a device
 * or a recording. Unreachable in production: the gate is a development bundle
 * plus EXPO_PUBLIC_HOOPHUB_UI_DEMO=1.
 */
export default function UiDemoRoute() {
  const params = useLocalSearchParams<{ screen?: string; state?: string }>();
  const fixtures = useDemoFixtures();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [heroView, setHeroView] = useState<RepresentativeViewId>("oblique");
  if (!UI_DEMO_ENABLED || !fixtures) return <Redirect href="/" />;
  const width = Math.min(measuredWidth || FALLBACK_WIDTH, MAX_WIDTH);
  const screen = typeof params.screen === "string" ? params.screen : "home";
  const state = typeof params.state === "string" ? params.state : "ready";
  const reference = ANONYMOUS_POSE_REFERENCES[0];

  if (screen === "home") {
    const latest = state === "ready"
      ? { status: "ready" as const, summary: fixtures.summaries[0], record: fixtures.record }
      : state === "loading" ? { status: "loading" as const } : { status: "signed-out" as const };
    return (
      <ScreenContainer containerClassName="bg-background" onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}>
        <TopBar wordmark="Hoop Hub" />
        <HomeFeed focusTitle="같은 리듬을 먼저 만드세요" goalLabel="일관성" latest={latest} onOpenAnalysis={noop} onOpenCapture={noop} onOpenProfile={noop} onOpenReference={noop} reference={reference} viewerEnabled width={width} />
      </ScreenContainer>
    );
  }

  if (screen === "profile") {
    const signedIn = state !== "signed-out";
    const glyphs = signedIn ? Object.fromEntries(fixtures.summaries.map((summary) => [summary.id, fixtures.record])) : {};
    return (
      <ScreenContainer containerClassName="bg-background" onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}>
        <TopBar title={signedIn ? "내 슛폼" : "프로필"} />
        <ScrollView contentContainerStyle={[styles.page, { width }]} showsVerticalScrollIndicator={false}>
          <ProfileHero onViewChange={setHeroView} record={signedIn ? fixtures.record : undefined} state={signedIn ? "ready" : "signed-out"} view={heroView} width={width} />
          <ProfileStats locked={!signedIn} stats={[{ value: fixtures.summaries.length, label: "대표 슛폼" }, { value: 0, label: "기존 분석" }]} />
          <Text style={styles.goalLine}>목표 · 일관성</Text>
          {signedIn ? (
            <View style={styles.section}>
              <MotionGrid canOpen deletingProfileId={null} error={null} glyphs={glyphs} loading={false} onDelete={noop} onOpen={noop} records={fixtures.summaries} width={width} />
            </View>
          ) : null}
        </ScrollView>
      </ScreenContainer>
    );
  }

  if (screen === "analysis") {
    const profile = state === "recapture" ? fixtures.recaptureProfile : fixtures.profile;
    return (
      <SafeAreaView style={styles.safeArea}>
        <TopBar title="대표 슛폼" />
        <ScrollView contentContainerStyle={styles.analysisPage}>
          <AnalysisSummaryLine profile={profile} />
          <SequenceViewer confidence={fixtures.record.confidence} highlightJoint={primaryFinding(profile).joint} profile={profile} shootingHand="right" />
          <AnalysisDetails confidence={fixtures.record.confidence} profile={profile} shootingHand="right" />
          <AnalysisEvidence profile={profile} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "capture") {
    const captureState = state === "setup" || state === "collecting" || state === "recapture" || state === "review" ? fixtures.capture[state] : fixtures.capture.setup;
    const controller: CaptureController = {
      state: captureState,
      canSave: captureState.status === "result_review",
      selectMode: noop, returnToModeSelect: noop, setShootingHand: noop, startCollection: noop,
      acquireSlot: noop, retakeSlot: noop, cancelSession: noop, retrySession: noop, save: noop,
    };
    return <CaptureSessionView completionActionLabel="저장된 대표 슛폼 열기" controller={controller} onClose={noop} onComplete={noop} />;
  }

  return <Redirect href="/" />;
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", paddingBottom: 32 },
  goalLine: { ...typography.caption, color: tokens.mutedForeground, paddingHorizontal: 14, paddingTop: 8 },
  section: { marginTop: 14 },
  safeArea: { backgroundColor: tokens.background, flex: 1 },
  analysisPage: { alignSelf: "center", maxWidth: 680, paddingBottom: 40, width: "100%" },
});
```

The demo screen for Explore is the real route (`/explore`) because it needs no fixtures.

- [ ] **Step 6: Run the isolation test, typecheck, lint, full unit suite**

Run: `corepack pnpm vitest run tests/ui-demo-isolation.test.ts` → PASS.
Run: `corepack pnpm check` → pass (if `require` typing complains, keep the `as typeof import(...)` cast; if ESLint flags `@typescript-eslint/no-require-imports`, add `// eslint-disable-next-line @typescript-eslint/no-require-imports` directly above the `require` line — that rule is exactly the trade-off this file documents).
Run: `corepack pnpm lint` → 0 problems. `corepack pnpm test:unit` → all pass.

- [ ] **Step 7: Build the development web bundle with the demo enabled and serve it**

Export outside the repository so no artefact is tracked:

```
EXPO_PUBLIC_HOOPHUB_UI_DEMO=1 corepack pnpm exec expo export --platform web --dev --output-dir C:/Users/USER/AppData/Local/Temp/claude/C--Users-USER-Projects-shooting-profile-coach-ios/8abd4e9e-6bc9-4341-864a-d062c0b4577b/scratchpad/ui-demo-dist
```

(`scripts/serve-web-preview.mjs` only serves `./web-dist`; serve the scratch directory with `npx --yes serve -s <that dir> -l 8090` and open `http://localhost:8090`.) Confirm `http://localhost:8090/dev/ui-demo?screen=home` renders the feed and `http://localhost:8090/` still opens the real tabs.

- [ ] **Step 8: Take the screenshots**

Use the Playwright browser tools (`browser_navigate`, `browser_resize`, `browser_take_screenshot` with a `filename`). Widths 375×812, 390×844, 430×932. Save to `artifacts/ui-v1-final/<screen>-<state>-<width>.png`:

| URL | states | file stem |
| --- | --- | --- |
| `/` (real Home, signed out) | signed-out | `home-signed-out` |
| `/dev/ui-demo?screen=home&state=ready` | ready | `home-ready` |
| `/explore` | reference grid | `explore` |
| `/dev/ui-demo?screen=capture&state=setup` | setup | `capture-setup` |
| `/dev/ui-demo?screen=capture&state=recapture` | recapture | `capture-recapture` |
| `/dev/ui-demo?screen=capture&state=review` | review | `capture-review` |
| `/dev/ui-demo?screen=analysis&state=ready` | complete | `analysis-complete` |
| `/dev/ui-demo?screen=analysis&state=recapture` | insufficient | `analysis-recapture` |
| `/dev/ui-demo?screen=profile&state=signed-out` | signed out | `profile-signed-out` |
| `/dev/ui-demo?screen=profile&state=signed-in` | signed in | `profile-signed-in` |

All ten at 375; Home ready, Capture setup, Analysis complete and Profile signed-in additionally at 390 and 430.

- [ ] **Step 9: Review the screenshots critically and fix before reporting**

Look at each image for: excess text, dead space, tiny skeletons, dashboard-like cards, inconsistent padding, strange safe-area behaviour, duplicated information, metrics above motion, hierarchy problems. Fix any finding in the owning component (Tasks 6–10 files), re-export, re-shoot, and record each fix in `docs/uiux/2026-09-15-ui-v1-final-visual-qa.md` as a table: screen · width · issue · fix · commit.

- [ ] **Step 10: Commit**

Message file `uiv1-t11.txt`:

```
chore(ui): add a gated development demo and the visual QA evidence

A development-only route renders the real presentational components
with fixtures derived from the synthetic landmark session: no account,
no network, no recording, no person. It is reachable only in a
development bundle with an explicit opt-in variable, and it loads its
fixtures through a require inside that gate so a production bundle
drops them; a test pins both conditions and scans every production path
for an import of the demo or the test fixtures. The screenshots are
from the exported bundle at 375, 390 and 430 points and cover every
core screen and the alternative states the owner asked to see.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 12: Status docs and full regression

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS.md`, `HANDOFF.md`

- [ ] **Step 1: Add the status entries**

In `docs/IMPLEMENTATION_STATUS.md`, after the `## 현재 구현 범위` section, add:

```markdown
## 2026-09-15 Hoop Hub UI v1 (`work/hoophub-ui-v1-final`, 소유자 리뷰 대기)

`main` @ `c9da820` 위에 PR #5의 승인된 방향(Graphite / Volt, skeleton identity)을 선별 이식하고 촬영 화면을 다시 만들었다.
23개 semantic token과 시스템 서체만으로 칠하며(`tests/ui-tokens.test.ts`), 하나의 skeleton renderer가 타일·피드·히어로·플레이어를 그린다.
홈은 모션 피드, 탐색은 익명 참조 skeleton 그리드, 촬영은 "서는 곳·카메라·촬영·확인" 네 단계(guidance는 `lib/shooting-profile/capture-guidance.ts`의 데이터, yaw 요구값 없음),
분석은 한 줄 결론 + skeleton 강조 + 접힌 수치·증거, 프로필은 skeleton 히어로·숫자 둘·목표 한 줄·그리드.
재구성 수학, 임계값, privacy 경계, Firestore rules, rollout gate, consent/provenance는 변경하지 않았다.
시각 증거: `artifacts/ui-v1-final/`, 감사: `docs/uiux/2026-09-15-ui-v1-final-audit.md`.
```

In `HANDOFF.md`, directly under `# FormPath repository handoff`, change `Last updated:` to `2026-09-15 UTC` and insert a section:

```markdown
## Hoop Hub UI v1 handoff - 2026-09-15

- Branch `work/hoophub-ui-v1-final` from `main` `c9da820`; not merged, not pushed to `main`; PR #5 stays open as the design donor.
- Plan `docs/superpowers/plans/2026-09-15-hoophub-ui-v1-final.md`, spec `docs/superpowers/specs/2026-09-15-hoophub-ui-v1-final-spec.md`, audit `docs/uiux/2026-09-15-ui-v1-final-audit.md`, visual QA `docs/uiux/2026-09-15-ui-v1-final-visual-qa.md`.
- Representative V2 stays default-off; the UI reads `FORMPATH_FLAGS` through the rollout gate unchanged and shows honest disabled/empty states.
- Owner decisions still open: device review of the screenshots and the capture flow; whether `expo-blur` bars are wanted later (none added).
```

- [ ] **Step 2: Fresh full verification (record every output)**

Run in order and paste the results into the final report:

1. `corepack pnpm check`
2. `corepack pnpm lint`
3. `corepack pnpm test:unit` (expect all files green; if `tests/legacy-server-pose-write-boundary.test.ts` alone times out under load, re-run that file alone and report both results)
4. PowerShell with the portable JRE on PATH: `corepack pnpm test:rules` (expect 42 passed)
5. `corepack pnpm exec expo export --platform web --output-dir web-dist` (report the route count; `web-dist` is gitignored)
6. Focused suites: `corepack pnpm vitest run tests/ui-tokens.test.ts tests/ui-navigation.test.ts tests/ui-home.test.ts tests/ui-profile.test.ts tests/ui-analysis.test.ts tests/ui-apple-design.test.ts tests/ui-render.test.tsx tests/ui-capture.test.ts tests/capture-guidance.test.ts tests/ui-demo-isolation.test.ts tests/skeleton-glyph.test.ts tests/representative-glyph.test.ts tests/analysis-evidence.test.ts tests/relative-day.test.ts`
7. Representative 4D CI-equivalent: `corepack pnpm vitest run tests/representative-4d-integration.test.ts tests/shooting-profile-two-view-pipeline.test.ts tests/shooting-profile-representative-sequence.test.ts tests/feature-flags-release-gate.test.ts`
8. Diff safety audit: `git diff --stat origin/main -- lib/shooting-profile lib/feature-flags.ts lib/firebase-shooting-profiles.ts lib/firebase-shooting-profile-contract.ts firestore.rules modules hooks/use-shooting-profile-capture.ts` must list only `lib/shooting-profile/capture-guidance.ts` (added).

- [ ] **Step 3: Commit and push the branch (never `main`)**

Message file `uiv1-t12.txt`:

```
docs: record the Hoop Hub UI v1 branch state for owner review

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

`git add -A` · `git commit -F <path>` · `git push -u origin work/hoophub-ui-v1-final`.

- [ ] **Step 4: Report**

Produce the deliverables A–H from the spec §29 with exact SHAs, commands and counts, the screenshot paths, and the explicit "No" answers of the diff safety audit backed by Step 2.8.

---

## Self-review against the spec

- §4–5, §16–18 (identity, density, typography, colour, one renderer): Tasks 1, 3, 4 and the literal gate in Task 8.
- §6 (four destinations, capture central, hidden routes kept): Task 5.
- §7–8 (Home feed, journeys): Task 6; capture → analysis → profile links are preserved by the unchanged `app/private-capture.tsx` completion routing.
- §9, §13–14 (Explore honest, nothing faked, omission over dead buttons): Task 5 (Explore only shows the anonymous reference; no compare/save/follow controls anywhere).
- §10 (capture rebuilt, protocol/presentation split, yaw-ready, no ±45°, gates preserved): Tasks 9 and 10; the hook and reducer are never edited (Global Constraints, Task 12 Step 2.8).
- §11 (three layers, one highlight, recapture honesty): Task 8.
- §12 (profile identity, owner-bound behaviour): Task 7.
- §15 (flat bars, no expo-blur): Task 5, Global Constraints.
- §19–21, §24–25 (widths, states, accessibility, screenshots, dev fixtures): Tasks 10–11.
- §22 (protected areas untouched): Global Constraints and Task 12 Step 2.8.
- §23 (tests): every task carries its suite; the four PR #5 test modifications are ported deliberately in Tasks 2, 3, 5, 7.
- §26 (performance): loops and stages are the PR #5 implementations with their lifecycle rules; no new decoding in render paths.
- §27–30 (phases, acceptance, deliverables, stop): Task 12.

Type consistency: `HomeFeedProps` (Task 6) is consumed verbatim in Task 11; `CaptureController` (Task 10) is consumed verbatim in Task 11; `highlightJoint?: PersistedJointNameV2` (Task 8) is used in Task 11; `captureProtocolPresentation` / `captureGuidanceForSlot` / `describeCameraYaw` (Task 9) are used in Task 10 with the signatures declared there; `QualitySummary` gains `shootingHand` and `width` (Task 10) and Task 10's session passes both.
