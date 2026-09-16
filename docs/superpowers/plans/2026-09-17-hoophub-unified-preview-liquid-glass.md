# Hoop Hub Unified Preview + Liquid Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public GitHub Pages URL behave like the real Hoop Hub app with synthetic preview data, while adding medium-strength cross-platform Liquid Glass to approved floating chrome on web and iOS.

**Architecture:** Keep one Expo Router application. Add a narrow preview runtime provider that exists only in Pages preview builds and supplies synthetic auth/profile/analysis/capture state to real routes. Add one `GlassSurface` product abstraction with platform implementations: native `expo-glass-effect` on supported iOS, lightweight web glass with graceful CSS/Graphite fallback, and a non-glass Graphite fallback elsewhere.

**Tech Stack:** Expo SDK 54, React Native 0.81, Expo Router 6, React 19, TypeScript, Vitest, `expo-glass-effect`, `react-native-svg`, GitHub Pages static export.

**Spec:** `docs/superpowers/specs/2026-09-16-hoophub-unified-preview-liquid-glass-design.md`

## Global Constraints

- Work only on `work/hoophub-unified-preview-liquid-glass`; do not merge to `main` without owner approval.
- Preserve Graphite / Volt identity and skeleton-first hierarchy.
- Preview fixtures must be build-time gated and absent from ordinary production exports.
- Preview mode must perform no Firebase writes and no real authentication.
- Do not change reconstruction, 3D fusion, analysis thresholds, capture acceptance/yaw protocol, MotionPacket, Coach API, Firestore Rules, privacy contracts, rollout gates, or Reels playback semantics.
- iOS uses `expo-glass-effect` only when `isLiquidGlassAvailable()` is true; unsupported platforms remain fully usable.
- Web glass must never block pointer input, accessibility, text readability, or Reels frame rate.
- `iyinchao/liquid-glass-studio` is MIT; any substantial copied shader/function code must retain attribution in source and `THIRD_PARTY_NOTICES.md`.
- Visible UI changes follow the repository UI UX Pro Max quality gate: safe areas, compact widths, contrast, focus/selection, 44pt targets, reduced motion, screen-reader semantics, and mobile-safe reflow.

---

### Task 1: Preview Runtime Core

**Files:**
- Create: `lib/preview/preview-runtime.ts`
- Create: `lib/preview/preview-session-state.ts`
- Create: `lib/preview/preview-runtime-provider.tsx`
- Create: `lib/preview/preview-runtime-fixtures.ts`
- Modify: `app/_layout.tsx`
- Test: `tests/preview-runtime.test.ts`
- Test: `tests/preview-runtime-isolation.test.ts`

**Interfaces:**
- Produces: `PREVIEW_RUNTIME_ENABLED: boolean`, `usePreviewRuntime(): PreviewRuntime`, `PreviewRuntimeProvider`, `PreviewSessionState`, and preview fixture factories.
- `PreviewRuntime` exposes `enabled`, synthetic representative summaries/records/profile lookup, `latest`, and session actions `addCapturedRepresentative()` / `reset()`.
- Fixture module is imported only behind a build-time-foldable `EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"` gate.

- [ ] **Step 1: Write failing pure runtime tests**

```ts
import { describe, expect, it } from "vitest";
import { createPreviewSessionState, previewSessionReducer } from "@/lib/preview/preview-session-state";

describe("preview session", () => {
  it("adds one captured representative without mutating the canonical fixture", () => {
    const initial = createPreviewSessionState();
    const next = previewSessionReducer(initial, { type: "capture-complete" });
    expect(next.representatives).toHaveLength(initial.representatives.length + 1);
    expect(initial.representatives).not.toBe(next.representatives);
  });
});
```

- [ ] **Step 2: Run the targeted tests and verify RED**

Run: `pnpm vitest run tests/preview-runtime.test.ts tests/preview-runtime-isolation.test.ts`

Expected: FAIL because the preview runtime modules do not exist.

- [ ] **Step 3: Implement pure session state and build-mode detection**

Create focused pure modules first. Keep fixture creation in `preview-runtime-fixtures.ts`; `preview-runtime.ts` must not import the fixture module at module top level.

- [ ] **Step 4: Re-run targeted tests and verify GREEN**

Run: `pnpm vitest run tests/preview-runtime.test.ts tests/preview-runtime-isolation.test.ts`

Expected: PASS.

- [ ] **Step 5: Wire the provider at the root without changing real auth behavior**

`app/_layout.tsx` should wrap content with `PreviewRuntimeProvider`; when preview is disabled, the provider is inert and existing `FirebaseAuthProvider` behavior remains unchanged.

- [ ] **Step 6: Commit**

```bash
git add lib/preview app/_layout.tsx tests/preview-runtime*.test.ts
git commit -m "feat(preview): add isolated preview runtime"
```

### Task 2: Make the Public Preview Use Real App Navigation

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/(tabs)/profile.tsx`
- Modify: `app/private-capture.tsx`
- Modify: `app/private-analysis/[id].tsx`
- Modify: `app/reels.tsx` only if handoff fallback needs preview data
- Create: `components/preview/preview-profile-content.tsx`
- Create: `components/preview/preview-capture-route.tsx`
- Test: `tests/ui-unified-preview.test.ts`
- Test: `tests/ui-preview-navigation.test.ts`

**Interfaces:**
- Consumes: `usePreviewRuntime()` from Task 1.
- Produces: the normal app routes functioning without Firebase/auth in preview builds.
- Real-user branches remain behaviorally unchanged.

- [ ] **Step 1: Write failing route-contract tests**

```ts
it("preview Home uses synthetic latest data and the real Reels route", () => {
  const home = read("app/(tabs)/index.tsx");
  expect(home).toContain("usePreviewRuntime");
  expect(home).toContain("router.push(`/reels?start=");
});

it("preview capture never calls saveShootingProfileV2", () => {
  const route = read("app/private-capture.tsx");
  expect(route).toContain("PreviewCaptureRoute");
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/ui-unified-preview.test.ts tests/ui-preview-navigation.test.ts`

Expected: FAIL on missing preview route integration.

- [ ] **Step 3: Implement Home preview data injection**

In `HomeScreen`, choose `preview.latest` only when `preview.enabled`; otherwise preserve `useLatestRepresentativeProfile(user, authLoading)` result. Continue using `setReelHandoff` and `/reels` exactly as Reels v1 does.

- [ ] **Step 4: Implement Profile preview branch**

Split the route into an outer selector and the existing owner-bound implementation. When preview is enabled, render `PreviewProfileContent` using existing `ProfileHero`, `ProfileStats`, and `MotionGrid`; do not run owner-bound Firebase effects.

- [ ] **Step 5: Implement Capture preview branch**

`PreviewCaptureRoute` uses the existing `CaptureSessionView` presentational state machine fixtures, advances through setup → collecting → review, and calls `preview.addCapturedRepresentative()` on save. It never accesses camera, Firebase, AsyncStorage, or auth.

- [ ] **Step 6: Implement Analysis preview lookup**

At the route boundary, resolve synthetic preview profile IDs through the preview runtime before invoking real owner-bound Firebase loading. Preserve the existing real-user authorization path unchanged.

- [ ] **Step 7: Verify navigation tests GREEN**

Run: `pnpm vitest run tests/ui-unified-preview.test.ts tests/ui-preview-navigation.test.ts tests/ui-reels.test.ts tests/ui-navigation.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app components/preview tests/ui-unified-preview.test.ts tests/ui-preview-navigation.test.ts
git commit -m "feat(preview): make Pages follow the real app flow"
```

### Task 3: Cross-Platform GlassSurface Contract

**Files:**
- Create: `lib/glass/glass-tokens.ts`
- Create: `lib/glass/glass-capabilities.ts`
- Create: `components/glass/glass-surface.tsx`
- Create: `components/glass/glass-surface.ios.tsx`
- Create: `components/glass/glass-surface.web.tsx`
- Create: `components/glass/glass-surface.native.tsx`
- Test: `tests/glass-surface.test.ts`
- Test: `tests/glass-capabilities.test.ts`

**Interfaces:**
- Produces: `GlassSurface` with `variant: "bar" | "chip" | "button" | "panel"`, `interactive?: boolean`, semantic `tint?: "neutral" | "volt"`, and normal `ViewProps`.
- Produces deterministic `GLASS_PRESETS` and capability selection helpers testable without rendering native modules.

- [ ] **Step 1: Write failing preset/capability tests**

```ts
it("medium preset keeps refraction restrained", () => {
  expect(GLASS_PRESETS.chip.refraction).toBeLessThanOrEqual(0.18);
  expect(GLASS_PRESETS.chip.glareOpacity).toBeLessThanOrEqual(0.28);
});

it("falls back when native liquid glass is unavailable", () => {
  expect(selectGlassBackend({ platform: "ios", liquidGlass: false, webgl2: false, backdropFilter: false })).toBe("graphite");
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/glass-surface.test.ts tests/glass-capabilities.test.ts`

Expected: FAIL because glass modules do not exist.

- [ ] **Step 3: Implement semantic presets and fallback selection**

Presets are product constants, not user-tunable studio parameters. Keep contrast and border treatment encoded in semantic tokens rather than literal colors inside screens.

- [ ] **Step 4: Implement iOS `GlassView` backend**

Use `isLiquidGlassAvailable()` and `GlassView`. Set `glassEffectStyle` to `regular` for bars/panels and `clear` for compact controls only where legibility remains strong. `isInteractive` is decided at mount and not toggled dynamically.

- [ ] **Step 5: Implement web and generic fallbacks**

Web tier order: lightweight glass renderer → `backdrop-filter` approximation → Graphite. Generic native fallback is a normal `View` with Graphite translucent styling.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm vitest run tests/glass-surface.test.ts tests/glass-capabilities.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/glass components/glass tests/glass-*.test.ts
git commit -m "feat(ui): add cross-platform glass surface"
```

### Task 4: Apply Glass to Approved Hoop Hub Chrome

**Files:**
- Modify: `components/hoophub-tab-bar.tsx`
- Modify: `components/ui/top-bar.tsx`
- Modify: `components/reels/reel-overlay.tsx`
- Modify: `app/(tabs)/explore.tsx`
- Modify: approved floating-control sections in `components/shooting-profile/capture-session.tsx`
- Test: `tests/ui-glass-contract.test.ts`
- Update: `tests/ui-render.test.tsx` where snapshots/contracts require it

**Interfaces:**
- Consumes: `GlassSurface` from Task 3.
- No playback, routing, capture reducer, or analysis math changes.

- [ ] **Step 1: Write failing scope contract**

```ts
it("glassifies chrome but not motion content", () => {
  expect(read("components/hoophub-tab-bar.tsx")).toContain("GlassSurface");
  expect(read("components/reels/reel-overlay.tsx")).toContain("GlassSurface");
  expect(read("components/shooting-profile/sequence-viewer.tsx")).not.toContain("GlassSurface");
  expect(read("components/skeleton/skeleton-glyph.tsx")).not.toContain("GlassSurface");
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/ui-glass-contract.test.ts`

Expected: FAIL because product chrome does not use `GlassSurface` yet.

- [ ] **Step 3: Apply glass to tab bar and capture action**

Wrap only the bar/container and central Capture affordance; keep tab semantics and haptic behavior unchanged.

- [ ] **Step 4: Apply glass to Reels floating chrome**

Close button, view chips, Analysis action, and paused indicator become glass. Caption, progress line, skeleton stage, and media remain non-glass.

- [ ] **Step 5: Apply glass to Explore chips and approved Capture overlays**

Do not glassify the grid or capture body copy. Maintain 44pt touch targets and focus states.

- [ ] **Step 6: Verify existing UI/Reels contracts**

Run: `pnpm vitest run tests/ui-glass-contract.test.ts tests/ui-reels*.test.ts tests/ui-navigation.test.ts tests/ui-capture.test.ts tests/ui-render.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components app tests/ui-glass-contract.test.ts tests/ui-render.test.tsx
git commit -m "feat(ui): apply liquid glass to Hoop Hub chrome"
```

### Task 5: Lightweight Web Glass Derived from liquid-glass-studio + Attribution

**Files:**
- Modify: `components/glass/glass-surface.web.tsx`
- Create: `lib/glass/web-glass-style.ts`
- Create or Modify: `THIRD_PARTY_NOTICES.md`
- Test: `tests/web-glass.test.ts`

**Interfaces:**
- Consumes: `GLASS_PRESETS` and backend selector.
- Produces a bounded web implementation with edge refraction approximation, restrained Fresnel/glare highlight, blur/tint, and no per-control heavyweight render loop.

- [ ] **Step 1: Write failing tests for tier selection and non-interference**

```ts
it("web decorative layer never captures input", () => {
  const source = read("components/glass/glass-surface.web.tsx");
  expect(source).toMatch(/pointerEvents[=:].*none/);
});

it("records liquid-glass-studio MIT attribution", () => {
  expect(read("THIRD_PARTY_NOTICES.md")).toContain("iyinchao/liquid-glass-studio");
  expect(read("THIRD_PARTY_NOTICES.md")).toContain("MIT");
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/web-glass.test.ts`

Expected: FAIL before the derived renderer/notice is present.

- [ ] **Step 3: Implement the smallest web effect**

Adapt only optical ideas needed by Hoop Hub: edge displacement/refraction impression, Fresnel-like rim highlight, localized glare, blur/tint, superellipse-friendly radius. Avoid Leva, MUI, Vite shell, studio editor, WebGPU dependency, and one-WebGL-context-per-button architecture.

- [ ] **Step 4: Add attribution**

Record upstream repository, MIT license, pinned reference commit `f7b28c36305a862f5cffed3ddd51511cf1204f56`, and exact upstream files/functions if any code is substantially adapted.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run tests/web-glass.test.ts tests/glass-*.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/glass lib/glass THIRD_PARTY_NOTICES.md tests/web-glass.test.ts
git commit -m "feat(web): add lightweight attributed glass effect"
```

### Task 6: Pages Root, Isolation, Visual QA, and Full Verification

**Files:**
- Modify: `.github/workflows/ui-web-preview-pages.yml`
- Modify: `tests/ui-web-preview.test.ts`
- Modify: `tests/ui-demo-isolation.test.ts`
- Modify: `tests/ui-pages-preview-routing.test.ts`
- Create: `docs/uiux/2026-09-17-unified-preview-liquid-glass-visual-qa.md`
- Optional artifacts only if generated by the existing QA process: `artifacts/unified-preview-liquid-glass/*`

**Interfaces:**
- Public Pages root is the primary interactive entry.
- `/dev/ui-demo` remains deterministic QA-only.

- [ ] **Step 1: Write failing Pages contracts**

Add assertions that the preview export emits root app entry and preview runtime markers while ordinary production export excludes fixture markers such as `preview_fixture_`, `syntheticPreviewOwner`, and existing demo fixture strings.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/ui-web-preview.test.ts tests/ui-demo-isolation.test.ts tests/ui-pages-preview-routing.test.ts`

Expected: FAIL until workflow/export routing is updated.

- [ ] **Step 3: Update Pages workflow**

Keep the existing ordinary-production isolation export. Preview export continues with `EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD="1"`; validate both root `index.html` and `/dev/ui-demo` output.

- [ ] **Step 4: Verify targeted preview tests GREEN**

Run: `pnpm vitest run tests/ui-web-preview.test.ts tests/ui-demo-isolation.test.ts tests/ui-pages-preview-routing.test.ts tests/ui-unified-preview.test.ts tests/ui-preview-navigation.test.ts`

Expected: PASS.

- [ ] **Step 5: Run full fresh verification**

Run, in order:

```bash
pnpm check
pnpm lint
pnpm test:unit
pnpm test:rules
pnpm exec expo export --platform web --output-dir web-production-check
EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD=1 HOOPHUB_WEB_PREVIEW_BASE_URL=/shooting-profile-coach-ios pnpm exec expo export --platform web --output-dir web-preview-dist
```

Also run the repository's Representative 4D regression test set used by CI.

- [ ] **Step 6: Visual QA at 375 / 390 / 430**

Inspect Home, Explore, Profile, Capture setup/review, Reels playing/paused, and Analysis. Record safe area, contrast, selected/focus state, reduced-motion behavior, skeleton dominance, and glass readability over dark/mixed/bright backgrounds.

- [ ] **Step 7: Verify protected-area diff**

Confirm no changes to reconstruction, 3D fusion, thresholds, capture acceptance/yaw protocol, MotionPacket, Coach API, Firestore Rules, privacy contracts, or Reels playback state logic.

- [ ] **Step 8: Commit QA evidence**

```bash
git add .github/workflows tests docs/uiux artifacts/unified-preview-liquid-glass 2>/dev/null || true
git commit -m "test(ui): verify unified preview and liquid glass"
```

- [ ] **Step 9: Push and open review-only PR**

PR must state that merge is owner-gated. Wait for GitHub CI to finish and treat CI as authoritative for the environment-specific production-isolation export.
