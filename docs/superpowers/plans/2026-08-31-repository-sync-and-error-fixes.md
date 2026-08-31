# Repository Sync and Error Fixes Implementation Plan

> **For agentic workers:** Execute this plan with test-first changes, fresh verification, and a non-force fast-forward update of `main`.

**Goal:** Bring the current iOS/Expo repository into a reproducible, warning-free state, document the actual implementation boundary, and synchronize the verified result to GitHub `main`.

**Architecture boundary:** Preserve the existing representative dual-view pipeline: separately recorded front and shooting-side takes are phase-normalized to 101 samples and fused into an explicitly non-synchronized, non-metric representative 4D skeleton. This task fixes repository/build integrity and documentation; it does not relabel the result as calibrated or actual 3D motion capture.

**Tech stack:** Expo 54, React Native 0.81, TypeScript, pnpm 9.12, Vitest, ESLint, Firebase/Firestore.

---

### Task 1: Reproduce and isolate the export failure

**Files:**
- Verify: `package.json`
- Verify: `pnpm-lock.yaml`
- Verify: `.npmrc`

1. Reinstall dependencies with the locked pnpm version and frozen lockfile.
2. Confirm `react-native-css-interop` resolves through NativeWind.
3. Re-run the Expo web export to distinguish an incomplete local install from a dependency declaration defect.
4. Do not add a redundant direct dependency if a clean locked install resolves the module.

### Task 2: Add and validate all configured app assets

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `app/_layout.tsx`
- Create: `tests/app-assets.test.ts`
- Create: `assets/images/formpath-mark.svg`
- Create: `assets/images/icon.png`
- Create: `assets/images/android-icon-foreground.png`
- Create: `assets/images/android-icon-background.png`
- Create: `assets/images/android-icon-monochrome.png`
- Create: `assets/images/favicon.png`
- Create: `assets/images/splash-icon.png`
- Verify: `app.config.ts`

1. Add a failing contract test proving every local image path referenced by Expo config exists and is a valid PNG.
2. Replace direct tracked TTF references with the licensed Expo Google Fonts packages required by the existing Barlow design system, then remove the obsolete local font files.
3. Create one deterministic source mark and derive platform-sized image assets from it.
4. Run the focused asset test, Expo config resolution, and web export.

### Task 3: Remove repository lint debt without behavior changes

**Files:**
- Modify: `eslint.config.js`
- Modify: files reported by `pnpm lint`

1. Use the current warning set as the failing quality baseline.
2. Fix unused imports/bindings and the stale hook dependency.
3. Apply safe array-type formatting fixes.
4. Keep the project CommonJS-compatible and remove the ESLint config module warning.
5. Require zero ESLint warnings and errors.

### Task 4: Synchronize implementation and status documentation

**Files:**
- Create: `docs/IMPLEMENTATION_STATUS.md`
- Modify: `README.md`
- Modify: `docs/PROJECT_MAP.md`

1. Record what is implemented, partially implemented, and externally blocked.
2. Document the mathematical reconstruction contract and its limitations.
3. Record validation commands and the next implementation milestones.
4. Keep claims honest: no synchronized capture, camera calibration, metric body dimensions, approved production model, or real-device validation is implied.

### Task 5: Verify from a fresh repository state

1. Run `pnpm check`.
2. Run `pnpm lint` with zero warnings.
3. Run `pnpm test:unit`.
4. Run `pnpm exec expo export --platform web`.
5. Inspect the diff for accidental or generated-file changes.
6. Remove previously tracked `web-dist/` output and keep it ignored.

### Task 6: Review and synchronize GitHub

1. Review the final diff against the requested architecture and current remote `main`.
2. Create a GitHub commit whose parent is the latest `main` commit.
3. Update `refs/heads/main` with `force: false`.
4. Re-read the remote ref and commit to prove the repository is synchronized.
5. Report commit identity, verification evidence, current implementation state, known limits, and the next plan.
