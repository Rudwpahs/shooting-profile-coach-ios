# Task 8B brief — wire private V2 persistence into capture and profile UI

## Scope

Create or modify only:

- `components/shooting-profile/profile-list.tsx` (create)
- `app/(tabs)/profile.tsx`
- `hooks/use-shooting-profile-capture.ts`
- `lib/shooting-profile/capture-session-reducer.ts`
- `components/shooting-profile/capture-session.tsx`
- `components/shooting-profile/quality-summary.tsx`
- `components/private-pose-capture.tsx`
- `app/private-capture.tsx`
- `tests/shooting-profile-capture-reducer.test.ts`
- `tests/shooting-profile-persistence-ui.test.ts` (create)
- this task's implementer report

Do not edit Task 8A contract/service/rules, native pose detection, reconstruction math, V1 persistence, MySQL/tRPC, public sharing/comparison/reference-player paths, dependencies, or GitHub.

## Required behavior

### 1. Capture save envelope and stale-state safety

- Change `SaveRepresentativeProfile` to accept the exact Task 8A `SaveShootingProfileInputV2` envelope and return `Promise<string>` (the opaque profile ID).
- During aggregation, retain the exact `NormalizedViewAttemptV2[]` used to build the completed representative result. Key it to `sessionGeneration`; never recompute from a later reducer state at save time.
- Invalidate that retained envelope on mode change, shooting-hand change, return-to-mode, retake, cancellation, failed/recapture aggregation, and unmount.
- Save is allowed only when all of these belong to the same generation: completed profile, confidence, mode, hand, and retained normalized attempts. Basic/High attempt counts must still be exact.
- Call the callback with `{ profile, shootingHand, confidence, normalizedAttempts }`. Do not pass URIs, filenames, native landmarks, raw video, or slot sequences.
- Save-token protection remains single-flight. Ignore late save completion after the session generation changes.
- `SAVE_SUCCEEDED` carries the returned profile ID. Add `savedProfileId?: string` to state; set it only for the matching generation and clear it with other derived state.

### 2. Authenticated and feature-gated route wiring

- `/private-capture` requires `captureV2`, `profileV2`, completed Firebase auth loading, and a signed-in user before rendering the capture session.
- The profile entry component must expose the V2 capture CTA only when both `captureV2` and `profileV2` are on. When either is off, keep the V1 capture path usable; never show a CTA that only redirects back.
- Flags off or unauthenticated routes safely redirect/replace to `/profile`; auth loading shows a clear loading state, not a false error.
- Pass a save callback that invokes `saveShootingProfileV2(user, input)`.
- On completion, the primary action opens `/private-analysis/{savedProfileId}` only when the representative viewer flag is on and the ID is valid; otherwise it replaces/navigates to `/profile`. Never place profile JSON in route params.
- Keep a safe close fallback using `router.canGoBack()` then `/profile`.

### 3. Truthful consent and completion copy

- Immediately above the enabled save action, visibly state in Korean that saving uploads only the phase-normalized 2D observations for the 12 allowed joints plus the representative estimate; raw video, filename, and original MediaPipe depth are not uploaded; data remains private until the user deletes it.
- Keep the evidence boundary exactly visible: `위상 결합 4D 추정 · 실측 3D 아님`.
- Never say the data is saved before the service resolves and returns an ID.
- Complete state must say raw video was not uploaded, while derived private data was saved.

### 4. V2 profile list beside unchanged V1

- Build a focused `ShootingProfileList` component that receives V2 records/loading/error plus open/delete callbacks. Do not make it own Firebase auth or network state.
- V2 rows show a truthful label: Basic `대표 스냅샷 추정 · 반복성 측정 아님`; High accuracy `3회 반복 대표 슛폼`. Also show confidence and `위상 결합 4D 추정 · 실측 3D 아님`.
- Open V2 only through `/private-analysis/{opaqueId}` when both V2 profile and viewer flags are on.
- Delete asks for native `Alert` confirmation, disables/relabels the targeted row while awaiting `deleteShootingProfileV2`, and reports completion only after that promise's head-deletion postcondition resolves.
- On authenticated profile load, first call `resumePendingShootingProfileDeletionsV2(user)`, then list V2 via `listShootingProfilesV2(user)`. Surface failures; do not silently claim an empty list.
- Do not call or render the V2 persistence path when `profileV2` is off. V1 loading and controls remain independent and usable.
- Guard asynchronous loads by exact owner UID (or generation token) so a prior user's deferred result never renders for a new user.
- Continue loading/listing/deleting/viewing V1 records independently. Label every V1 row `기존 단일 시점 분석`. A V2 failure must not erase or block V1, and a V1 failure must not erase or block V2.
- Do not dual-write V2 into V1 `/poses`.

### 5. Accessibility and visual system

- Preserve the existing warm beige/navy/orange Formpath system and Barlow typography.
- All actionable `Pressable`s are at least 44×44, have an accessibility role/label/state, and expose a visible keyboard/focus treatment that does not change layout (`outline*`/shadow/elevation, no focus-only border width).
- Loading, empty, error, deleting, and saved states are visible and use live regions where state changes.
- Use `Alert`, not a custom unlabelled overlay, for destructive confirmation.

## Tests first

Add failing tests before production edits, then implement. At minimum prove:

- retained normalized attempts are exactly those used for aggregation and are invalidated on every relevant generation-changing path;
- save callback receives the strict envelope and returned ID reaches matching `SAVE_SUCCEEDED` only;
- late save results cannot complete a newer session;
- reducer clears/stores `savedProfileId` correctly;
- capture route checks both flags and auth, wires the Task 8A callback, and routes by ID rather than profile JSON;
- consent copy includes 12-joint normalized 2D data, no raw video/filename/depth, and retention-until-delete wording;
- profile tab resumes interrupted deletion before V2 listing, dual-loads V1/V2 independently, guards owner changes, labels V1/V2 honestly, confirms deletion, and waits for service completion;
- controls meet the static accessibility/min-size/focus constraints;
- no `console.*`, URI/filename persistence, V1 write reuse, MySQL/tRPC, or public share path appears in the changed V2 wiring.

## Verification

Run read-only/static source checks available locally. Try the focused Vitest, TypeScript, and ESLint commands only if project binaries exist; do not install dependencies. Record unavailable executable checks honestly. Do not commit or upload.
