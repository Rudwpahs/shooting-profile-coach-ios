# Plan Review Adjustment

The implementation plan was reviewed before execution. One load-bearing safety gap was found and is now mandatory for Task 1:

- A Pages preview build must disable `FirebaseAuthProvider` side effects at the root. Merely avoiding `useFirebaseAuth()` in preview routes is insufficient because a persisted browser session could restore a real Firebase user and trigger owner-profile sync writes.
- `FirebaseAuthProvider` therefore gains an explicit `disabled?: boolean` mode. `app/_layout.tsx` passes `disabled={PREVIEW_RUNTIME_ENABLED}`.
- In disabled mode the provider must not subscribe to Firebase auth state, must not call profile sync, and must expose a settled inert context (`user: null`, `loading: false`, `configured: false`). Sign-in/sign-up/logout actions must reject or no-op without contacting Firebase.
- `tests/preview-runtime-isolation.test.ts` is the TDD contract for this requirement.

No other architectural change to the approved spec is introduced by this adjustment.
