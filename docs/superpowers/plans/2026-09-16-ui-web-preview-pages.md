# Hoop Hub UI Web Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the already-built Hoop Hub UI v1 as an install-free, iPhone-browser preview without changing production app behavior.

**Architecture:** Keep the existing `/dev/ui-demo` harness as the source of preview states. Add an environment-controlled Expo `experiments.baseUrl` so the static export works under the GitHub Pages repository subpath, then add a GitHub Pages workflow that builds a development web export with the demo gate enabled and deploys only the exported static bundle. Production builds keep the base URL unset and the demo remains excluded by the existing `__DEV__` gate.

**Tech Stack:** Expo Router static web export, React Native Web, GitHub Actions, GitHub Pages, Vitest.

**Spec:** Existing approved Hoop Hub UI v1 spec and `docs/uiux/2026-09-15-ui-v1-final-visual-qa.md`.

## Global Constraints

- Do not alter reconstruction math, representative V2 thresholds, privacy contracts, Firestore rules, or native capture behavior.
- Do not expose real user data, real recordings, Firebase credentials, or account-bound fixtures.
- Preview fixtures must remain synthetic and development-only.
- Production export must continue to strip `ui-demo-fixtures`.
- Preview must be hosted under `/shooting-profile-coach-ios` without changing production routing when no preview environment variable is present.
- No new runtime dependency.

---

### Task 1: Add preview base-path configuration

**Files:**
- Modify: `app.config.ts`
- Test: `tests/ui-web-preview.test.ts`

**Interfaces:**
- Consumes: `process.env.HOOPHUB_WEB_PREVIEW_BASE_URL`
- Produces: `config.experiments.baseUrl` only when the environment variable is non-empty.

- [ ] **Step 1: Write the failing test**

Create `tests/ui-web-preview.test.ts` with assertions that `app.config.ts` reads `HOOPHUB_WEB_PREVIEW_BASE_URL`, trims it, and assigns `baseUrl: webPreviewBaseUrl || undefined` inside `experiments` while retaining `typedRoutes` and `reactCompiler`.

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/ui-web-preview.test.ts`
Expected: FAIL because `app.config.ts` does not yet reference `HOOPHUB_WEB_PREVIEW_BASE_URL`.

- [ ] **Step 3: Write minimal implementation**

Add before `config`:

```ts
const webPreviewBaseUrl = process.env.HOOPHUB_WEB_PREVIEW_BASE_URL?.trim();
```

and extend `experiments`:

```ts
experiments: {
  typedRoutes: true,
  reactCompiler: true,
  baseUrl: webPreviewBaseUrl || undefined,
},
```

- [ ] **Step 4: Run focused test and typecheck**

Run:

```sh
corepack pnpm vitest run tests/ui-web-preview.test.ts
corepack pnpm check
```

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(preview): support Expo Pages base path`

---

### Task 2: Add GitHub Pages preview workflow

**Files:**
- Create: `.github/workflows/ui-web-preview-pages.yml`
- Modify: `tests/ui-web-preview.test.ts`

**Interfaces:**
- Consumes: current `main`, `EXPO_PUBLIC_HOOPHUB_UI_DEMO=1`, `HOOPHUB_WEB_PREVIEW_BASE_URL=/shooting-profile-coach-ios`
- Produces: a GitHub Pages artifact containing the development Expo static export.

- [ ] **Step 1: Extend the test first**

Assert the workflow:

```text
uses pinned checkout and setup-node actions
activates pnpm 9.12.0
sets EXPO_PUBLIC_HOOPHUB_UI_DEMO to "1"
sets HOOPHUB_WEB_PREVIEW_BASE_URL to "/shooting-profile-coach-ios"
runs `pnpm exec expo export --platform web --dev --output-dir web-preview-dist`
uses actions/configure-pages@v5
actions/upload-pages-artifact@v4 with `web-preview-dist`
actions/deploy-pages@v4
has contents: read, pages: write and id-token: write permissions
uses the github-pages environment
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/ui-web-preview.test.ts`
Expected: FAIL because the workflow file does not exist.

- [ ] **Step 3: Add the workflow**

Create a workflow triggered by `workflow_dispatch` and pushes to `main`. Build on Ubuntu with Node 22 and pnpm 9.12.0, install with `--frozen-lockfile`, run the existing UI demo isolation test before export, export the development web bundle with the two preview environment variables, configure Pages, upload `web-preview-dist`, then deploy in a dependent `deploy` job using the `github-pages` environment.

- [ ] **Step 4: Verify locally through CI-compatible checks**

Run:

```sh
corepack pnpm vitest run tests/ui-web-preview.test.ts tests/ui-demo-isolation.test.ts
corepack pnpm check
corepack pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `ci(preview): deploy install-free UI demo to Pages`

---

### Task 3: Merge and verify the live preview

**Files:**
- No product-code changes expected.

**Interfaces:**
- Consumes: merged workflow on `main`.
- Produces: public preview at `https://rudwpahs.github.io/shooting-profile-coach-ios/` with demo state URLs under `/dev/ui-demo.html` or the static route emitted by Expo.

- [ ] **Step 1: Run full branch verification**

Run CI equivalent:

```sh
corepack pnpm check
corepack pnpm lint
corepack pnpm test:unit
```

and require the existing Representative 4D CI to remain green on the PR.

- [ ] **Step 2: Merge only after green checks**

Create a PR from `work/ui-web-preview-pages` to `main`, wait for all required workflows, then merge if green.

- [ ] **Step 3: Verify Pages deployment**

Confirm the Pages workflow completes and inspect the deployment URL. Open the root and the UI demo route at iPhone-size viewport. Confirm Home, Profile, Capture setup/recapture/review, and Analysis complete/recapture render without 404 or missing assets.

- [ ] **Step 4: Record any platform-only limitation**

If GitHub Pages is not enabled for the repository, do not weaken the workflow or product code. Report the one-time repository Pages enablement requirement precisely and keep the build workflow ready to rerun.
