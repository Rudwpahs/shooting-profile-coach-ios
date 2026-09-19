# Hoop Hub Product Release Compliance Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep named-player/research-only analysis out of the production bundle, close shipping-asset/license and accessibility release checks, and produce a final 20-item compliance matrix whose unresolved production facts remain blockers.

**Architecture:** Product-safe anonymous reference data lives in a module with no named-player imports. Historical/named-player evidence moves to a research-only module that no production route imports. Release readiness is represented by pure blocker functions plus an evidence matrix; source-automatable checks can pass while Mac/device/operator-dependent checks stay explicitly blocked.

**Tech Stack:** Expo Router/Metro, React Native, TypeScript/Vitest, Expo web production export, Markdown compliance artifacts.

**Spec:** `docs/superpowers/specs/2026-09-16-hoophub-release-compliance-design.md`

## Global Constraints

- Production bundle must not contain named-player review assets or imply named-player matching.
- Approved product reference motion remains anonymous and provenance-backed.
- Research/history files may retain factual player identity when they are not imported by production code.
- `not actual 3D` / estimate boundaries remain explicit wherever applicable.
- Accessibility completion requires both automated source checks and real-device manual QA; do not mark device-only checks passed without evidence.
- License entries require inspectable upstream/license evidence; unknowns stay blockers.
- No merge to `main` in this plan.

---

### Task 1: Split product-safe reference library from named-player research evidence

**Files:**
- Modify: `lib/anonymous-pose-library.ts`
- Create: `lib/research/player-analysis-evidence.ts`
- Modify: tests that intentionally inspect player evidence, including `tests/pose-motion.test.ts`
- Modify: any scripts/components that intentionally use named-player research exports so production code has zero importer of the research module
- Create: `tests/production-player-identity-boundary.test.ts`

**Interfaces:**
- `lib/anonymous-pose-library.ts` exports only product-safe anonymous reference types/data/status.
- `lib/research/player-analysis-evidence.ts` owns `PLAYER_VIDEO_REVIEW_RECORDS`, `PLAYER_SOURCE_SKELETON_REVIEWS`, `PLAYER_MONOCULAR_3D_ANALYSES` and their player-specific JSON imports.

- [ ] **Step 1: Write failing boundary test**

```ts
const productLibrary = readFileSync("lib/anonymous-pose-library.ts", "utf8");
expect(productLibrary).not.toMatch(/Stephen Curry|Paul George|curry-|paul-george-/i);
expect(productLibrary).not.toContain("PLAYER_MONOCULAR_3D_ANALYSES");
```

Scan production `app/`, `components/`, `hooks/`, and `lib/reels/` imports and assert none import `@/lib/research/player-analysis-evidence`.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/production-player-identity-boundary.test.ts`
Expected: FAIL because named-player data/imports currently live in the product library and `/motion` consumes them.

- [ ] **Step 3: Move named-player evidence to research-only module**

Move the player types, JSON imports, construction logic and named-player exports without changing their evidence content. Keep historical tests pointed at the research module. The product module retains only CMU/approved anonymous references and product status fields.

- [ ] **Step 4: Verify GREEN for module boundary**

Run: `pnpm vitest run tests/production-player-identity-boundary.test.ts tests/pose-motion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "refactor: isolate player research evidence"`

---

### Task 2: Remove legacy named-player production route and assert bundle isolation

**Files:**
- Replace: `app/(tabs)/motion.tsx`
- Modify: `.github/workflows/ui-web-preview-pages.yml`
- Create: `tests/production-claim-boundary.test.ts`

**Interfaces:**
- `/motion` is a minimal redirect to the supported anonymous product surface and imports no research evidence.

- [ ] **Step 1: Write failing production-claim test**

Assert `app/(tabs)/motion.tsx` contains `Redirect` and does not contain `PLAYER_`, `Stephen`, `Curry`, `Paul George`, `Image 3D`, or player-analysis imports. Assert the ordinary production-export CI grep rejects `Stephen Curry`, `Paul George`, `IMAGE-LIFTED 3D ANALYSIS`, and `PLAYER_MONOCULAR_3D_ANALYSES` in `web-production-check`.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/production-claim-boundary.test.ts`
Expected: FAIL because the current route renders named-player analysis.

- [ ] **Step 3: Replace route with redirect**

Use Expo Router `Redirect` to the supported product route (profile/home as selected by existing navigation semantics) and remove all legacy imports/UI from this route.

- [ ] **Step 4: Strengthen production export leak check**

Extend the existing CI grep rather than creating a parallel workflow. Documentation/research files are not in the exported web bundle, so this gate specifically tests shipped JS/static output.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run tests/production-claim-boundary.test.ts tests/ui-demo-isolation.test.ts && pnpm exec expo export --platform web --output-dir web-production-check`
Then grep the output for the forbidden player tokens; expected zero matches.

- [ ] **Step 6: Commit**

`git commit -m "fix: remove named player analysis from production"`

---

### Task 3: Shipping asset and license inventory

**Files:**
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `docs/compliance/shipping-asset-license-inventory.md`
- Delete if still unreferenced: `assets/images/react-logo.png`, `assets/images/react-logo@2x.png`, `assets/images/react-logo@3x.png`, `assets/images/partial-react-logo.png`
- Create: `tests/shipping-asset-license.test.ts`

**Interfaces:** Inventory status values are `VERIFIED`, `NOT_SHIPPED`, or `BLOCKED`.

- [ ] **Step 1: Research exact upstream licenses before writing notices**

Inspect primary package/upstream license evidence for Barlow/Barlow Condensed, `@expo/vector-icons`/MaterialCommunityIcons, MediaPipeTasksVision/pose model, CMU motion-capture source, and every custom/reused shipping asset. Do not infer a model/data license merely from library code license.

- [ ] **Step 2: Write failing license coverage test**

Assert `THIRD_PARTY_NOTICES.md` and inventory include every verified shipping family used by `app.config.ts`, font loading, icons, native pose module, and product reference library. Assert no entry says `VERIFIED` without a source URL/path and license identifier.

- [ ] **Step 3: Verify RED**

Run: `pnpm vitest run tests/shipping-asset-license.test.ts`
Expected: FAIL because release-grade notices/inventory do not exist.

- [ ] **Step 4: Remove unreferenced template assets**

Repository search currently finds no code reference to the React template-logo assets. Recheck immediately before deletion; delete only assets with zero runtime/config references.

- [ ] **Step 5: Write notices and inventory**

Separate software-library license obligations from source-data/media rights. If the bundled pose model or CMU product data cannot be verified for the intended commercial distribution, mark that exact asset `BLOCKED` rather than upgrading it by assumption.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm vitest run tests/shipping-asset-license.test.ts tests/app-assets.test.ts && pnpm check`
Expected: PASS for inventory structure; any unresolved license remains a documented release blocker rather than a test failure hidden by invented facts.

- [ ] **Step 7: Commit**

`git commit -m "docs: inventory shipping licenses and assets"`

---

### Task 4: Accessibility and operator/manual release readiness

**Files:**
- Create: `lib/compliance/release-readiness.ts`
- Create: `tests/release-readiness.test.ts`
- Create: `docs/release/accessibility-device-qa.md`
- Create: `docs/release/hoophub-compliance-matrix.md`

**Interfaces:**

```ts
export type ManualReleaseEvidence = {
  operatorFactsVerified: boolean;
  publicPrivacyPolicyUrlLive: boolean;
  voiceOverQaPassed: boolean;
  keyboardQaPassed: boolean;
  textScalingQaPassed: boolean;
  finalIosPrivacyGatePassed: boolean;
  shippingLicensesCleared: boolean;
};

export function getManualReleaseBlockers(evidence: ManualReleaseEvidence): string[];
```

- [ ] **Step 1: Write failing readiness tests**

All-false evidence returns stable blocker codes; all-true returns `[]`. The helper has no environment/network side effects.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/release-readiness.test.ts`
Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement pure blocker helper**

Stable codes: `operator_facts`, `privacy_policy_url`, `voiceover_qa`, `keyboard_qa`, `text_scaling_qa`, `ios_privacy_gate`, `shipping_licenses`.

- [ ] **Step 4: Write device QA runbook**

Cover VoiceOver order/labels/actions, external keyboard/Full Keyboard Access focus, Dynamic Type/text scaling, contrast under real overlays, Reduce Motion, destructive account deletion, legal-link reachability, and compact-screen reflow. Record device/iOS/build/SHA; leave checkboxes unchecked until run on a physical supported build.

- [ ] **Step 5: Build the 20-item release matrix**

Map every original item 1–20 to `PASS`, `BLOCKED`, or `N/A`, with exact code/doc/manual evidence. Refund, non-essential-cookie banner, hidden fees, and marketing unsubscribe may be `N/A` only while the corresponding feature is absent. Business/operator details, public policy URL, final Xcode privacy gate, and real-device QA remain `BLOCKED` without evidence.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm vitest run tests/release-readiness.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

`git commit -m "docs: add final release compliance matrix"`

---

### Task 5: Final automated verification and branch review

- [ ] Run `pnpm install --frozen-lockfile`.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test:unit`.
- [ ] Run `pnpm test:rules`.
- [ ] Run ordinary Expo web export and production forbidden-token grep.
- [ ] Inspect PR CI for the exact branch head SHA.
- [ ] Re-read the original 20-item checklist against `docs/release/hoophub-compliance-matrix.md`.
- [ ] Invoke `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`.
- [ ] Do not merge to `main` without explicit user approval.
