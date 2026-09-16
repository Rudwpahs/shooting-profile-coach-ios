# Hoop Hub Data Minimization and Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the unnecessary Firestore root-profile sync and implement complete, owner-safe Firebase account deletion covering legacy and V2 data before deleting Firebase Authentication.

**Architecture:** Subcollections under `/users/{uid}` remain the durable owner-private data boundary; no root user profile document is created for new sessions. Whole-account deletion is a dedicated service with explicit dependency ports so ordering and failure behavior can be unit-tested: reauthenticate first, delete all owner cloud data while authorization still exists, delete any legacy root document, then delete the Firebase Auth user, then clear local profile state in UI.

**Tech Stack:** Firebase JS SDK 12.18, Cloud Firestore, Firebase Authentication, Expo/React Native, Vitest, Firestore emulator.

**Spec:** `docs/superpowers/specs/2026-09-16-hoophub-release-compliance-design.md`

## Global Constraints

- Never delete Firebase Auth before owner-protected Firestore cleanup finishes.
- Reauthenticate before destructive cloud operations.
- A cloud deletion failure must leave the Auth account intact so retry remains possible.
- New sign-in/sign-up/restored sessions must not duplicate email/display name into Firestore.
- Existing legacy `/users/{uid}` documents remain deletable by the owner.
- Existing V2 staged deletion invariants stay intact.
- Local profile clear runs only after the remote account deletion succeeds.
- No merge to `main` in this plan.

---

### Task 1: Remove root owner-profile sync and duplicate PII write

**Files:**
- Modify: `lib/firebase-auth.tsx`
- Modify: `lib/firebase-private-data.ts`
- Delete: `lib/firebase-profile-sync.ts`
- Modify: `firestore.rules`
- Modify: `tests/firebase-profile-sync.test.ts` (rename content purpose to minimization contract; file may be renamed in a later cleanup commit)
- Modify: `tests/legacy-private-pose-write-boundary.test.ts`
- Modify: `tests/ui-render.test.tsx`
- Modify: `app/(tabs)/profile.tsx`

**Interfaces:**
- `FirebaseAuthContextValue` no longer exposes `profileSync`.
- `firebase-private-data.ts` retains only legacy read/delete boundaries; no root profile upsert API.

- [ ] **Step 1: Write failing minimization tests**

Update tests so they assert:

```ts
expect(authSource).not.toContain("syncOwnerProfile");
expect(authSource).not.toContain("profileSync");
expect(privateDataSource).not.toContain("ensureFirebaseProfile");
expect(privateDataSource).not.toContain("user.email");
expect(profileSource).not.toContain("profileSync");
```

Add a Firestore rule source/emulator assertion that new clients cannot create/update arbitrary root user documents, while owner subcollection rules and owner root deletion remain available for legacy cleanup.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/firebase-profile-sync.test.ts tests/legacy-private-pose-write-boundary.test.ts tests/firestore-rules.test.ts`
Expected: FAIL because the root-profile sync still exists.

- [ ] **Step 3: Remove root sync from Auth provider**

`signIn` and `signUp` return after Firebase Auth succeeds. Restored `onAuthStateChanged` sessions only update Auth state. Remove `profileSync`, `syncedUidRef`, `runProfileSync`, and the sync warning in `profile.tsx`.

- [ ] **Step 4: Remove root profile upsert code**

Delete `ensureFirebaseProfile`, its missing-email error types/constants, and `firebase-profile-sync.ts`. Keep legacy pose list/delete APIs intact.

- [ ] **Step 5: Tighten root Firestore rule**

For `match /users/{userId}`, preserve owner `read` and `delete` so legacy root docs can be inspected/removed; disallow root `create, update`. Do not alter nested V2/legacy subcollection admission rules except where emulator tests prove necessary.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm vitest run tests/firebase-profile-sync.test.ts tests/legacy-private-pose-write-boundary.test.ts tests/firestore-rules.test.ts && pnpm test:rules && pnpm check`
Expected: PASS.

- [ ] **Step 7: Commit**

`git commit -m "refactor: remove duplicate firebase profile pii"`

---

### Task 2: Pure account-deletion orchestration contract

**Files:**
- Create: `lib/firebase-account-deletion.ts`
- Create: `tests/firebase-account-deletion.test.ts`

**Interfaces:**

```ts
export type AccountDeletionPort = {
  reauthenticate: () => Promise<void>;
  resumePendingV2: () => Promise<void>;
  listV2ProfileIds: () => Promise<string[]>;
  deleteV2Profile: (profileId: string) => Promise<void>;
  listLegacyPoseIds: () => Promise<string[]>;
  deleteLegacyPose: (poseId: string) => Promise<void>;
  deleteLegacyRoot: () => Promise<void>;
  deleteAuthUser: () => Promise<void>;
};

export async function runAccountDeletion(port: AccountDeletionPort): Promise<void>;
```

- [ ] **Step 1: Write failing ordering tests**

```ts
it("reauthenticates before deleting cloud data and deletes auth last", async () => {
  const calls: string[] = [];
  // port methods push stable labels
  await runAccountDeletion(port);
  expect(calls).toEqual([
    "reauth",
    "resume-v2",
    "list-v2",
    "delete-v2:p1",
    "list-legacy",
    "delete-legacy:l1",
    "delete-root",
    "delete-auth",
  ]);
});

it("never deletes auth after a cloud deletion failure", async () => {
  await expect(runAccountDeletion(failingPort)).rejects.toThrow("cloud-failed");
  expect(deleteAuthUser).not.toHaveBeenCalled();
});
```

Also test reauthentication failure performs no data deletion, empty accounts still delete root/auth, and multiple profiles are processed deterministically.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/firebase-account-deletion.test.ts`
Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement minimal pure orchestrator**

Implement exactly the ordered calls above. No Firebase imports in the pure orchestrator body beyond exported adapter types.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run tests/firebase-account-deletion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat: add account deletion orchestration"`

---

### Task 3: Firebase adapter and Auth context API

**Files:**
- Modify: `lib/firebase-account-deletion.ts`
- Modify: `lib/firebase-auth.tsx`
- Modify: `tests/firebase-account-deletion.test.ts`
- Create: `tests/firebase-account-deletion-wiring.test.ts`

**Interfaces:**
- Produce `deleteFirebaseAccount(user: User, password: string): Promise<void>`.
- Add `deleteAccount(password: string): Promise<void>` to `FirebaseAuthContextValue`.

- [ ] **Step 1: Write failing adapter/wiring tests**

Mock Firebase Auth/Firestore and existing owner-data functions. Assert the adapter uses `EmailAuthProvider.credential(user.email, password)` + `reauthenticateWithCredential`, lists/deletes V2 and legacy records, deletes `doc(db, "users", uid)` for legacy cleanup, then calls Firebase `deleteUser(user)`. Assert missing email/password fails before destructive calls.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/firebase-account-deletion.test.ts tests/firebase-account-deletion-wiring.test.ts`
Expected: FAIL because Firebase adapter/context method does not exist.

- [ ] **Step 3: Implement Firebase adapter**

Reuse `resumePendingShootingProfileDeletionsV2`, `listShootingProfilesV2`, `deleteShootingProfileV2`, `listFirebasePrivatePoses`, and `removeFirebasePrivatePose`. Use owner root `deleteDoc` only after subcollection cleanup.

- [ ] **Step 4: Expose `deleteAccount` from Auth context**

The Auth provider calls `deleteFirebaseAccount(currentUser, password)`. On success Auth's observer clears the session. Do not fake success by calling `signOut` instead of deleting the user.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run tests/firebase-account-deletion.test.ts tests/firebase-account-deletion-wiring.test.ts && pnpm check`
Expected: PASS.

- [ ] **Step 6: Commit**

`git commit -m "feat: delete firebase account and owner data"`

---

### Task 4: Account deletion UI and local cleanup

**Files:**
- Create: `components/profile/account-deletion-panel.tsx`
- Modify: `components/profile/account-panel.tsx`
- Modify: `app/(tabs)/profile.tsx`
- Create: `tests/account-deletion-ui-contract.test.ts`

**Interfaces:**
- User must explicitly open destructive account deletion, enter current password, then confirm.
- `profile.tsx` calls remote `deleteAccount(password)` first, then `clearProfile()` only on success.

- [ ] **Step 1: Write failing structural UI test**

Assert a logged-in account exposes an accessible `계정 삭제` control, a password reauthentication field appears only in the destructive flow, and source order in the handler places `await deleteAccount(...)` before `await clearProfile()`.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/account-deletion-ui-contract.test.ts`
Expected: FAIL because the UI does not exist.

- [ ] **Step 3: Implement accessible destructive flow**

Use token colors, focusable controls, `accessibilityRole="button"`, `accessibilityState`, assertive error text, and an explicit Korean warning that account and stored shooting data are permanently removed. Do not use deceptive multi-step friction; one open action + password + final confirmation is sufficient.

- [ ] **Step 4: Wire remote-first/local-second cleanup**

Use `const { profile, clearProfile } = useProfile()`. On success reset account-deletion UI state; Auth observer handles user state. On error retain account and local data and show a retryable error.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run tests/account-deletion-ui-contract.test.ts tests/firebase-account-deletion.test.ts tests/firebase-account-deletion-wiring.test.ts && pnpm check && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

`git commit -m "feat: add in-app account deletion flow"`

---

### Task 5: Full Firebase regression checkpoint

- [ ] Run `pnpm test:unit`.
- [ ] Run `pnpm test:rules`.
- [ ] Run `pnpm check` and `pnpm lint`.
- [ ] Ensure PR CI shows the same checks on the branch commit.
- [ ] Record the verified commit/run in the compliance TODO; do not merge.
