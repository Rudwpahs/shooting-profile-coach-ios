# FormPath repository handoff

Last updated: 2026-08-31 UTC

## Active work: P0 privacy / rules / auth

- Branch: `fix/p0-privacy-rules-auth`
- Remote `main` SHA at start: `dba64d67cc010a62ad37a02079d547021a27f919`
- Remote `main` unchanged during this work; no force push, no direct push to `main`.
- Verification environment note: the Firestore Emulator jar cannot be downloaded in the
  environment used for local verification (`storage.googleapis.com` is blocked by the
  network policy: `download failed, status 403: request blocked`). The emulator suite is
  therefore implemented and wired into CI, and its evidence must come from a GitHub
  Actions run on this branch. Run #45 on `main` predates the suite and is **not** rules
  evidence.
- Line endings: the Windows clone checked out CRLF while every tracked text blob is LF
  (`git ls-files --eol`: 424 `i/lf`, 38 binary, 2 empty). Local verification normalises the
  working tree to LF so it matches the CI checkout; without this,
  `tests/pose-detection-v2-contract.test.ts` fails on a `\n` regex against `pnpm-lock.yaml`.

### Task 1 — legacy V1 cloud writes disabled (done)

Reproduction of the defect, before the change:

- `app/(tabs)/profile.tsx` renders `PrivatePoseCapture` unconditionally; with all three V2
  flags off (the default, `lib/feature-flags.ts`) the rendered branch is
  `LegacyPrivatePoseCapture`.
- `components/private-pose-capture.tsx` then called `saveFirebasePrivatePose` with
  `poseJson: JSON.stringify(output.candidate)` — every sampled frame with all 33 MediaPipe
  landmarks (face indices 0-10 included), native `z`, and per-frame `timestampMs` — plus
  `sourceLabel` derived from `asset.fileName`.
- `firestore.rules` treated `poseJson` as an opaque bounded string, so the rules layer
  could not constrain the content.
- A second, unguarded cloud write path existed: tRPC `personalProfile.savePose`
  (`server/routers.ts`) accepted the same payload (`poseJson` up to 1,000,000 chars,
  `sourceLabel` up to 160 chars) and inserted it into MySQL through
  `savePersonalPoseAnalysis` (`server/db.ts`). This was found by the independent review of
  the first implementation and closed in the same task.

Red evidence: `tests/legacy-private-pose-write-boundary.test.ts` initially failed with
`promise resolved "'generated-id'" instead of rejecting` — the pre-change code completed the
Firestore write.

Fixed files and functions:

| File | Change |
| --- | --- |
| `shared/const.ts` | New shared `LEGACY_CLOUD_SAVE_DISABLED` code |
| `lib/firebase-private-data.ts` | `LegacyCloudSaveDisabledError`; `saveFirebasePrivatePose` now `Promise<never>` and throws before creating any Firestore reference. `ensureFirebaseProfile`, `listFirebasePrivatePoses`, `removeFirebasePrivatePose` unchanged |
| `lib/legacy-capture-status.ts` | New pure mapper `describeLegacySaveFailure` → `blocked` / `error` outcome and user copy |
| `components/private-pose-capture.tsx` | Save failure routed through the mapper with an early return, so `setState("complete")` is unreachable on failure; `asset.fileName` no longer read; subtitle and tip state the limitation before the user grants photo access |
| `app/(tabs)/profile.tsx` | V1 empty-state copy no longer promises a saved vault record |
| `server/routers.ts` | `personalProfile.savePose` accepts no pose payload and throws `TRPCError FORBIDDEN` with the shared code |
| `server/db.ts` | `savePersonalPoseAnalysis` fails closed before any database work; list/delete untouched |
| `firestore.rules` | `/users/{userId}/poses/{poseId}`: `allow read, delete: if signedInOwner(userId); allow create, update: if false;` |
| `docs/current-admission-matrix.md` | V1 row now states on-device analysis only, cloud persistence disabled |
| `tests/firestore-rules.test.ts`, `tests/firestore-shooting-profile-rules.test.ts` | Assertions rewritten for the new policy and anchored to the `poses` block |

New tests: `tests/legacy-private-pose-write-boundary.test.ts` (7),
`tests/legacy-capture-status.test.ts` (3), `tests/legacy-server-pose-write-boundary.test.ts` (5).
The boundary tests mock the Firestore SDK to resolve successfully and still assert that
`setDoc` / `doc` / `collection` / `serverTimestamp` are never called, so a reintroduced write
fails the suite.

V2 untouched: `git diff --name-only -- lib/shooting-profile lib/firebase-shooting-profiles.ts
lib/firebase-shooting-profile-contract.ts hooks/ app/private-capture.tsx
components/shooting-profile` is empty. 101 phases, 12 joints, Basic 0.65 cap, 1+1 / 3+3,
exact `"1"` flag comparison and `representative_phase_fused_4d_estimate_not_actual_3d` are
unchanged.

Independent review outcome: the tRPC/SQL bypass, a false V1 empty-state message, an
unanchored rules assertion and an overstated docstring were raised and all fixed. Two
accepted limitations are recorded under "Follow-up decisions".

## Product boundary that must not change

- Front and shooting-side videos are separate, non-simultaneous shots.
- Output boundary remains exactly `representative_phase_fused_4d_estimate_not_actual_3d`.
- Basic is 1+1 with confidence capped at 0.65; High is 3+3 with a deterministic agreeing subset of at least two per view.
- Output is exactly 101 normalized phase samples and 12 cloud-allowlisted joints.
- It is not synchronized, calibrated, triangulated, metric, personal anatomy, or actual 3D.
- All three V2 flags require the exact value `"1"` and remain default-off.
- Compact persistence remains Basic 5 documents / High 9 documents, one mutation per request, head last, exact payload lengths 14,544 and 48,480 bytes, two-read viewer, and resumable revision → capture → observations → head deletion.

## Follow-up decisions (investigated, deliberately not implemented here)

| Item | In use? | Files affected if changed | Recommendation | Why separate |
| --- | --- | --- | --- | --- |
| Manus / tRPC / server / drizzle / oauth | Partly. `lib/trpc.ts` is wired in `app/_layout.tsx` but no `useQuery`/`useMutation` consumer exists; `server/` reaches the app only as a type import; `hooks/use-auth.ts` has zero importers; `app/oauth/callback.tsx` is a registered route with no in-app entry point. Only `@trpc/client`, `@trpc/react-query`, `superjson`, `@tanstack/react-query` reach the bundle. `lib/_core/{nativewind-pressable,manus-runtime,theme}.ts` are required and must stay | `app/_layout.tsx`, `lib/trpc.ts`, `lib/_core/{api,auth}.ts`, `constants/oauth.ts`, `hooks/use-auth.ts`, `server/**`, `drizzle/**`, `shared/types.ts`, `tests/auth.logout.test.ts`, `package.json` scripts | Remove in stages, starting with `hooks/use-auth.ts` (zero risk) | Deleting a whole subsystem in a P0 privacy commit would make the security diff unreviewable |
| V1 left-handed support | Not supported. `lib/personal-pose.ts` `selectShotPhaseIndexes` hardcodes `landmarks[16]`; `lib/pose-motion.ts` `validatePoseMotion` hardcodes right-side joints | `lib/personal-pose.ts`, `lib/pose-motion.ts`, `tests/personal-pose.test.ts` | Decide first whether V1 is retired rather than fixed — now that its cloud path is closed, V2 may be the only path worth left-hand work | It is a product decision, not a privacy fix |
| Web pose CDN | Live. `lib/pose-detection.web.ts` loads `vision_bundle.js` and the `.task` model from `cdn.jsdelivr.net` / `storage.googleapis.com` at runtime. `lib/pose-detection.ts` is dead code on every platform (`.web.ts` and `.native.ts` both win Metro resolution) | `lib/pose-detection.ts` (delete), `lib/pose-detection.web.ts` | Delete the dead `pose-detection.ts`; decide separately whether web detection should exist at all | Touching platform resolution needs its own verification pass |
| Player-derived assets and names | Live. Motion Studio displays "Stephen Curry" and "Paul George" from `PLAYER_MONOCULAR_3D_ANALYSES`, derived from user-supplied clips with no licence record | `lib/anonymous-pose-library.ts`, `lib/motions/*.json`, `app/(tabs)/motion.tsx`, `tests/product-boundary-regression.test.ts` | Obtain a licence record or replace with anonymous assets before any public release | Rights question, not a code defect |
| iOS live-region announcements | `accessibilityLiveRegion` is Android-only; VoiceOver announces nothing on state change (pre-existing, affects the existing error path too) | `components/private-pose-capture.tsx` and other status text | Use `AccessibilityInfo.announceForAccessibility` | Accessibility pass across screens, not a privacy change |
| `validateFirebasePrivatePoseInput` | Now unreachable from production; only its own test exercises it | `lib/firebase-private-pose-contract.ts`, `tests/firebase-private-pose-contract.test.ts` | Keep until a minimised V1 record format is decided, then delete or reuse | Removing it now would delete the contract a future V1 redesign needs |
| React Native render tests | Absent. No `@testing-library/react-native`, no `react-test-renderer`; component behaviour is verified only by source-text guards | `package.json`, `vitest.config.ts`, all UI tests | Adopt before the next UI-heavy change | Explicitly out of scope for this P0 branch |

## External release gates still pending

- Firebase Rules compiler/Emulator and live Firebase integration
- clean macOS prebuild/CocoaPods/Xcode/signing
- approved detector model SHA-256, license/redistribution record, and bundle inspection
- physical iPhone matrix including HEVC/VFR/slow motion, permission denial, cancellation/background/retake, airplane mode, force-quit/reopen, deletion resumption
- synthetic, rig/optical-mocap, negative-clip, repeated-user, subgroup, and held-out scientific validation
- V2 own-history comparison/coaching, licensed/pseudonymous style comparison, and opt-in peer sharing remain future Projects 2-4

## Previous checkpoint (CI repair, retained)

- Verified runtime repair on `main`: `0ec9094130cb48c1f3e921ac27d7c9ad07299ca6` (`fix: make clean CI web export deterministic`).
- Run 42 failed at `Typecheck`: `LandmarkSequenceV2.metadata` gained mandatory native evidence fields while two synthetic fixtures in `tests/shooting-profile-phase-normalization.test.ts` still used the older shape. Repair mirrored the complete native evidence structure in both fixtures; no runtime or representative-4D behaviour changed.
- Run 43 passed typecheck, lint and all hermetic unit tests but failed the Expo web export: clean CI had no pre-existing `react-native-css-interop/.cache/web.css` for Metro to hash. Repair enables NativeWind's virtual-module patch when `CI=true` while keeping the filesystem-write workaround for local iOS development.
- Run 44 (`0ec9094`) and run 45 (`dba64d6`) completed with `success`.
- Integration policy: update `main` only with `force: false`; re-read remote `main` immediately before and after the update.
- Never move a branch to incomplete candidate `8f895ecff260f49c9a510fd3ed91a3d05b819418`.
