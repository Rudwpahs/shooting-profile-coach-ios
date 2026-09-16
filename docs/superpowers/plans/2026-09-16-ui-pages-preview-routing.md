# Hoop Hub Pages Preview Routing Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the existing synthetic `/dev/ui-demo` render correctly on GitHub Pages without installing the iOS app, while keeping normal production builds free of demo fixture data.

**Architecture:** GitHub Pages requires Expo Router's production-only `experiments.baseUrl` behavior. Keep the current development demo path, but add a second explicit build-time gate used only by the Pages workflow. The Pages workflow will use a production static export with that opt-in gate instead of `--dev`. Normal production exports omit the gate and retain the existing fixture isolation contract.

**Tech Stack:** Expo Router static web export, React Native Web, GitHub Actions, GitHub Pages, Vitest.

**Spec:** Existing `app/dev/ui-demo.tsx`, `lib/dev/ui-demo.ts`, `tests/ui-demo-isolation.test.ts`, `.github/workflows/ui-web-preview-pages.yml`.

## Global Constraints

- Do not change reconstruction math, analysis thresholds, privacy, Firestore, Coach, MotionPacket, or native capture behavior.
- Demo data must remain synthetic only.
- Normal production build must not enable the demo.
- GitHub Pages preview build must be explicit and reproducible.
- Use TDD: contract test must fail before implementation.

---

### Task 1: Pin the production-preview build contract

**Files:**
- Modify: `tests/ui-demo-isolation.test.ts`
- Modify: `tests/ui-web-preview.test.ts`

- [ ] Add source-contract assertions requiring `EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD` as a separate explicit preview-only gate.
- [ ] Require Pages workflow to use the preview-build variable and a production `expo export`, not `--dev`.
- [ ] Run focused tests and confirm RED because implementation still uses development-only gate/export.

### Task 2: Add the explicit Pages preview gate

**Files:**
- Modify: `lib/dev/ui-demo.ts`
- Modify: `app/dev/ui-demo.tsx`

- [ ] Define preview-build enablement as `process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"`.
- [ ] Permit demo fixtures when either the existing development opt-in is true or the explicit preview-build flag is true.
- [ ] Keep fixture require inside a build-time-foldable branch; do not add any runtime network/account dependency.
- [ ] Run focused tests and confirm GREEN.

### Task 3: Export Pages preview in production mode

**Files:**
- Modify: `.github/workflows/ui-web-preview-pages.yml`

- [ ] Set `EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD: "1"` only in the preview workflow.
- [ ] Remove `--dev` from the Pages export command.
- [ ] Keep base path `/shooting-profile-coach-ios` and static route output checks.
- [ ] Run CI, verify build/deploy success, then perform a live mobile scrape of `/dev/ui-demo?screen=home` and at least one non-home demo state.

### Task 4: Integrate only after evidence

- [ ] Verify focused tests, full repository CI, Pages build, Pages deploy, and live URL rendering.
- [ ] Merge via PR only after all gates pass.
