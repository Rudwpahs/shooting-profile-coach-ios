# Hoop Hub Legal Signup and Age Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add truthful in-app legal surfaces and a Korea V1 14+ / Terms / privacy-notice signup gate that runs before Firebase account creation.

**Architecture:** Keep legal facts and signup gating outside React components. `AccountPanel` remains presentational, `profile.tsx` owns interaction state, and a pure compliance function decides whether signup may proceed. Legal routes render from one centralized legal configuration so missing real operator facts remain explicit release blockers rather than fabricated copy.

**Tech Stack:** Expo SDK 54, Expo Router, React Native, TypeScript 5.9, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-hoophub-release-compliance-design.md`

## Global Constraints

- Korea-first release; V1 account creation is 14+.
- Do not collect or persist exact DOB solely for age gating.
- Do not call Firebase signup before the age/legal gates pass.
- Do not invent operator/company/contact facts.
- Privacy notice acknowledgement is not mislabeled as blanket consent.
- All new controls need screen-reader semantics, focusability, 44px minimum target, and existing token-based contrast.
- No merge to `main` in this plan.

---

### Task 1: Pure signup compliance gate

**Files:**
- Create: `lib/compliance/signup-gate.ts`
- Create: `tests/signup-compliance-gate.test.ts`

**Interfaces:**
- Produces: `SignupComplianceState`, `SignupGateResult`, `evaluateSignupGate(state)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { evaluateSignupGate } from "@/lib/compliance/signup-gate";

describe("signup compliance gate", () => {
  it("blocks signup until the 14+ confirmation passes", () => {
    expect(evaluateSignupGate({ age14Plus: false, termsAccepted: true, privacyNoticeAcknowledged: true }))
      .toMatchObject({ ok: false, code: "age_required" });
  });

  it("blocks signup until Terms are accepted", () => {
    expect(evaluateSignupGate({ age14Plus: true, termsAccepted: false, privacyNoticeAcknowledged: true }))
      .toMatchObject({ ok: false, code: "terms_required" });
  });

  it("blocks signup until the privacy notice is acknowledged", () => {
    expect(evaluateSignupGate({ age14Plus: true, termsAccepted: true, privacyNoticeAcknowledged: false }))
      .toMatchObject({ ok: false, code: "privacy_notice_required" });
  });

  it("allows signup only when every required gate passes", () => {
    expect(evaluateSignupGate({ age14Plus: true, termsAccepted: true, privacyNoticeAcknowledged: true }))
      .toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm vitest run tests/signup-compliance-gate.test.ts`
Expected: FAIL because `@/lib/compliance/signup-gate` does not exist.

- [ ] **Step 3: Implement the minimal gate**

```ts
export type SignupComplianceState = {
  age14Plus: boolean;
  termsAccepted: boolean;
  privacyNoticeAcknowledged: boolean;
};

export type SignupGateResult =
  | { ok: true }
  | { ok: false; code: "age_required" | "terms_required" | "privacy_notice_required"; message: string };

export function evaluateSignupGate(state: SignupComplianceState): SignupGateResult {
  if (!state.age14Plus) return { ok: false, code: "age_required", message: "Hoop Hub는 만 14세 이상부터 가입할 수 있습니다." };
  if (!state.termsAccepted) return { ok: false, code: "terms_required", message: "회원가입 전에 이용약관에 동의해 주세요." };
  if (!state.privacyNoticeAcknowledged) return { ok: false, code: "privacy_notice_required", message: "회원가입 전에 개인정보 처리 안내를 확인해 주세요." };
  return { ok: true };
}
```

- [ ] **Step 4: Run test and verify GREEN**

Run: `pnpm vitest run tests/signup-compliance-gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat: add signup compliance gate"`

---

### Task 2: Legal configuration and in-app legal routes

**Files:**
- Create: `lib/compliance/legal-config.ts`
- Create: `components/legal/legal-document-screen.tsx`
- Create: `app/legal/index.tsx`
- Create: `app/legal/privacy.tsx`
- Create: `app/legal/terms.tsx`
- Create: `app/legal/cookies.tsx`
- Create: `tests/legal-surface-contract.test.ts`

**Interfaces:**
- Produces: `LEGAL_DOCUMENT_VERSION`, `LEGAL_CONFIG`, `getLegalReleaseBlockers()`.
- `LEGAL_CONFIG` reads only statically named `EXPO_PUBLIC_*` environment variables.

- [ ] **Step 1: Write failing structural tests**

The test reads the new files and asserts that:

```ts
expect(getLegalReleaseBlockers()).toEqual(expect.arrayContaining([
  "operator_name",
  "support_email",
  "privacy_contact",
  "privacy_policy_url",
  "terms_url",
]));
expect(privacySource).toContain("Firebase Authentication");
expect(privacySource).toContain("원본 영상");
expect(cookieSource).toContain("app_session_id");
expect(termsSource).not.toContain("Stephen Curry");
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/legal-surface-contract.test.ts`
Expected: FAIL because legal configuration/routes do not exist.

- [ ] **Step 3: Implement centralized configuration**

`LEGAL_CONFIG` contains nullable `operatorName`, `supportEmail`, `privacyContact`, `privacyPolicyUrl`, `termsUrl`, and `businessInfo`. `getLegalReleaseBlockers()` returns stable blocker codes for every missing production-required field. Do not substitute sample names or addresses.

- [ ] **Step 4: Implement legal screens**

`LegalDocumentScreen` uses `ScreenContainer`, token colors, scrollable content, accessible headings, and focusable link/back controls. Privacy copy must truthfully state the current product boundary: account email via Firebase Authentication, owner-private Firestore-derived shooting data, raw video remaining local under the current capture policy, deletion flow, Firebase overseas processing disclosure pending verified operator/region values. Terms must cover account use, informational coaching/not medical measurement, user-provided media rights, acceptable use, termination, and IP without inventing operator facts. Cookie notice documents the necessary web `app_session_id` session cookie and states that no advertising/analytics-cookie stack is currently enabled by this release.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run tests/legal-surface-contract.test.ts && pnpm check`
Expected: PASS.

- [ ] **Step 6: Commit**

`git commit -m "feat: add legal and privacy surfaces"`

---

### Task 3: Wire accessible signup acknowledgements before Firebase

**Files:**
- Modify: `components/profile/account-panel.tsx`
- Modify: `app/(tabs)/profile.tsx`
- Create: `tests/signup-compliance-wiring.test.ts`

**Interfaces:**
- `AccountPanel` gains boolean props/callbacks for `age14Plus`, `termsAccepted`, `privacyNoticeAcknowledged`, plus `onOpenTerms` and `onOpenPrivacy`.
- `profile.tsx` calls `evaluateSignupGate` before `signUp`.

- [ ] **Step 1: Write failing wiring test**

Read `profile.tsx` and assert the source slice beginning at `const submit` contains `evaluateSignupGate` before `signUp(email, password)`. Read `account-panel.tsx` and assert three checkbox roles/labels and legal-link callbacks exist.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/signup-compliance-wiring.test.ts`
Expected: FAIL because signup is currently direct.

- [ ] **Step 3: Implement signup state in `profile.tsx`**

Add three booleans initialized `false`. In signup mode, evaluate the gate after basic email/password validation and before setting `submitting`/calling Firebase. On failure, put the gate message in `status` and return. Terms/privacy buttons route to `/legal/terms` and `/legal/privacy`.

- [ ] **Step 4: Implement presentational checkboxes in `AccountPanel`**

Use focusable `Pressable` controls with `accessibilityRole="checkbox"`, `accessibilityState={{ checked }}`, minimum 44px hit area, visible check state, token colors, and concise Korean labels. Show them only in signup mode. Privacy text says the user has **confirmed/acknowledged** the notice, not granted a universal privacy consent.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run tests/signup-compliance-gate.test.ts tests/legal-surface-contract.test.ts tests/signup-compliance-wiring.test.ts && pnpm check && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

`git commit -m "feat: gate signup on age and legal acknowledgements"`

---

### Task 4: Open draft PR to obtain fresh CI evidence

**Files:** none.

- [ ] **Step 1:** Push the branch commits and open a draft PR against `main`.
- [ ] **Step 2:** Confirm `Representative 4D CI` runs typecheck, lint, unit tests, Firestore emulator tests, and Expo export.
- [ ] **Step 3:** Record the run URL/commit SHA in the compliance TODO. Do not merge.
