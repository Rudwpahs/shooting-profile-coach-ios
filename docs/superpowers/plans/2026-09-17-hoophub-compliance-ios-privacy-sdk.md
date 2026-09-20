# Hoop Hub iOS Privacy and SDK Release Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Minimize unused native capabilities, configure Expo privacy-manifest aggregation, document shipped SDK/data behavior, and create a release gate that cannot be marked complete without final Xcode privacy-report evidence.

**Architecture:** Source configuration handles only facts that can be proven from the repository: enabled permissions, linked packages, app-level privacy-manifest defaults, and SDK inventory. Final IPA/Xcode privacy-report, SDK-signature, App Store Connect privacy-label, and production Firebase-region checks remain explicit manual blockers in a machine-readable release-readiness model.

**Tech Stack:** Expo SDK 54, React Native 0.81.5, `expo-build-properties`, CocoaPods/MediaPipeTasksVision 0.10.21, Firebase 12.18, TypeScript/Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-hoophub-release-compliance-design.md`

## Global Constraints

- Never claim the final IPA is compliant from source inspection alone.
- Do not invent Required Reason API declarations before the final native dependency/archive audit establishes actual API categories.
- Tracking stays disabled unless the product later deliberately adds tracking.
- Remove unused runtime permissions/capabilities rather than explaining them away.
- Keep camera/photo-library purpose strings tied to local pose analysis.
- No merge to `main` in this plan.

---

### Task 1: Remove unused audio/notification capabilities

**Files:**
- Modify: `app.config.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` importer dependency entries
- Create: `tests/native-capability-minimization.test.ts`

**Interfaces:** none.

- [ ] **Step 1: Write failing source contract**

```ts
const appConfig = readFileSync("app.config.ts", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

expect(appConfig).not.toContain("microphonePermission");
expect(appConfig).not.toContain("POST_NOTIFICATIONS");
expect(pkg.dependencies).not.toHaveProperty("expo-audio");
expect(pkg.dependencies).not.toHaveProperty("expo-notifications");
```

Also assert the repository contains no runtime import of either package before dependency removal.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/native-capability-minimization.test.ts`
Expected: FAIL because both packages/permissions currently exist.

- [ ] **Step 3: Remove unused app configuration and direct dependencies**

Remove the `expo-audio` plugin configuration, `POST_NOTIFICATIONS` permission entry, and direct package dependencies. Remove only their importer entries from `pnpm-lock.yaml`; leave unrelated shared snapshot entries untouched. `pnpm install --frozen-lockfile` in CI is the acceptance test that importer/package metadata remain consistent.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run tests/native-capability-minimization.test.ts && pnpm install --frozen-lockfile && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "chore: remove unused native capabilities"`

---

### Task 2: Configure app-level privacy manifest and CocoaPods manifest aggregation

**Files:**
- Modify: `app.config.ts`
- Create: `tests/ios-privacy-manifest-config.test.ts`

**Interfaces:** Expo config must generate an app privacy manifest with tracking disabled and enable Pod manifest aggregation.

- [ ] **Step 1: Write failing config test**

Load/evaluate the Expo config in a test-safe environment and assert:

```ts
expect(config.ios?.privacyManifests?.NSPrivacyTracking).toBe(false);
expect(config.ios?.privacyManifests?.NSPrivacyTrackingDomains).toEqual([]);
```

Structural assertion for `expo-build-properties` verifies:

```ts
expect(source).toContain("privacyManifestAggregationEnabled: true");
```

Do not assert fabricated `NSPrivacyAccessedAPITypes` entries.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/ios-privacy-manifest-config.test.ts`
Expected: FAIL because privacy manifest config is absent.

- [ ] **Step 3: Add minimal truthful config**

Add under `ios`:

```ts
privacyManifests: {
  NSPrivacyTracking: false,
  NSPrivacyTrackingDomains: [],
},
```

Add under the `expo-build-properties` iOS object:

```ts
ios: {
  privacyManifestAggregationEnabled: true,
},
```

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run tests/ios-privacy-manifest-config.test.ts && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "chore: configure ios privacy manifest aggregation"`

---

### Task 3: Durable third-party SDK and data-transfer ledger

**Files:**
- Create: `docs/compliance/third-party-sdk-inventory.md`
- Create: `docs/compliance/data-transfer-ledger.md`
- Create: `tests/compliance-sdk-ledger.test.ts`

**Interfaces:** Every release-relevant native/data provider has provider, package/version/source, product purpose, data boundary, network transfer, linked-to-user status, tracking status, storage/processing region knowledge, deletion behavior, license/provenance status, and final-build verification state.

- [ ] **Step 1: Write failing ledger coverage test**

Assert inventory includes at minimum exact tokens for:

```text
Firebase Authentication
Cloud Firestore
MediaPipeTasksVision 0.10.21
ExpoModulesCore
expo-image-picker
expo-secure-store
@react-native-async-storage/async-storage
```

Assert data-transfer ledger states Firebase Authentication `United States` and Firestore region `BLOCKED — verify production project`.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/compliance-sdk-ledger.test.ts`
Expected: FAIL because ledgers do not exist.

- [ ] **Step 3: Write evidence-backed ledgers**

For each item distinguish `repository fact`, `vendor fact`, and `release-time unknown`. Do not label a transitive package as data-collecting merely because it exists. Record Firebase Auth US-only processing from Firebase official documentation; keep actual Firestore region blocked until production-project evidence exists.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run tests/compliance-sdk-ledger.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "docs: add sdk and data transfer ledger"`

---

### Task 4: Machine-readable iOS release readiness model

**Files:**
- Create: `lib/compliance/ios-release-readiness.ts`
- Create: `tests/ios-release-readiness.test.ts`
- Create: `docs/release/ios-privacy-release-gate.md`

**Interfaces:**

```ts
export type IosReleaseEvidence = {
  xcodePrivacyReportReviewed: boolean;
  requiredReasonApisReviewed: boolean;
  thirdPartySdkManifestsReviewed: boolean;
  appStorePrivacyLabelsReviewed: boolean;
  productionFirestoreRegionVerified: boolean;
};

export function getIosReleaseBlockers(evidence: IosReleaseEvidence): string[];
```

- [ ] **Step 1: Write failing readiness tests**

Assert all-false evidence returns five stable blockers; all-true returns `[]`; no source-config flag can implicitly mark final archive evidence true.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/ios-release-readiness.test.ts`
Expected: FAIL because readiness model does not exist.

- [ ] **Step 3: Implement pure readiness model**

Map each false field to one stable code:
`xcode_privacy_report`, `required_reason_apis`, `third_party_sdk_manifests`, `app_store_privacy_labels`, `firestore_region`.

- [ ] **Step 4: Write manual release runbook**

`ios-privacy-release-gate.md` requires a Mac/Xcode Archive, generated privacy report review, inspection of linked SDK privacy manifests/signatures, Required Reason API validation, App Store Connect privacy-label reconciliation, and production Firestore-region evidence. Include a place to record archive version/build/SHA; do not pre-check any manual item.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run tests/ios-release-readiness.test.ts tests/ios-privacy-manifest-config.test.ts tests/compliance-sdk-ledger.test.ts && pnpm check`
Expected: PASS.

- [ ] **Step 6: Commit**

`git commit -m "feat: add ios privacy release gate"`

---

### Task 5: CI/package-lock checkpoint

- [ ] Confirm `pnpm install --frozen-lockfile` succeeds in PR CI.
- [ ] Confirm typecheck/lint/unit/rules/export workflows are green on the same commit.
- [ ] Keep final Xcode archive items `BLOCKED` until real Mac/App Store evidence is attached.
