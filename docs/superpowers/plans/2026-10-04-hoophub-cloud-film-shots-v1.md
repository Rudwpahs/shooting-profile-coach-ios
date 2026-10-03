# Cloud film shots v1 — implementation plan

> **For agentic workers:** execute task by task with superpowers:test-driven-development. Steps use checkbox syntax. Rules tests run only in CI (Firestore + Storage emulators, Java); write them first, push, and read the CI result as the RED/GREEN evidence.

**Goal:** per-shot opt-in cloud keeping of film shots (Firebase Storage + Firestore), owner-only, with download on another device, complete deletion, and every footage promise in the app updated.

**Spec:** `docs/superpowers/specs/2026-10-04-hoophub-cloud-film-shots-v1-design.md`

## Global constraints

- Default stays device-local; the switch is off by default and hidden when the cloud source is unavailable or no owner is signed in.
- Owner-only Storage and Firestore rules; object size 1 B–64 MiB; content type `video/(mp4|quicktime|webm)`; ids `^[A-Za-z0-9_-]{1,128}$`; slot ids `^(front|shooting_side)-[0-2]$`; title `^[A-Za-z0-9가-힣 ·]{1,24}$`.
- No file names, EXIF or landmarks in any cloud document. No Firebase code in `lib/preview/`. Production bundle unchanged for users who never opt in.
- Firestore schema for motion profiles, `RepresentativePose4DV2`, `ShootingProfileSummaryV2`, the two-view pipeline and the Film Space evidence boundary are untouched.

---

### Task 1: rules (Firestore `filmShots`, `storage.rules`) + emulator suite + CI

Files: `firestore.rules`, `storage.rules` (new), `firebase.json` (storage rules + emulator port 9199), `.github/workflows/representative-4d-ci.yml` (`--only firestore,storage` via `package.json` `test:rules`), `tests/emulator/film-shot-rules.emulator.test.ts` (new), `tests/firestore-rules.test.ts` (static pins).

- [ ] RED: emulator suite (owner order succeeds; intruder/anonymous refused on object, clip, head, list; oversize/wrong type object refused; head without clips refused; clip after head refused; wrong storagePath/title/clipIds refused; deletion transition + order; static pins for the new match blocks).
- [ ] GREEN: rules; CI step runs both emulators.
- [ ] Commit.

### Task 2: contract + write plan (pure)

Files: `lib/firebase-film-shot-contract.ts` (new), `lib/film-space/film-shots.ts` (export the title regex), `tests/firebase-film-shot-contract.test.ts` (new).

- [ ] RED: constants; `filmShotStoragePathV1`; `validateFilmShotHeadV1` / `validateFilmShotClipV1` reject every malformed shape; `buildFilmShotWritePlanV1` orders uploads → clips → head with exact keys and serverTimestamp placeholders; refuses non-local clip refs, bad titles (falls back to default), duplicate slot ids, > 6 clips.
- [ ] GREEN + commit.

### Task 3: cloud orchestration with ports + swappable source + preview stub

Files: `lib/firebase-film-shots.ts` (new), `lib/film-shot-cloud-source.ts` (new), `lib/preview/preview-film-shot-cloud-source.ts` (new), `lib/film-space/film-shot-cloud-state.ts` (new), `tests/firebase-film-shots.test.ts` (new), `tests/preview-runtime-isolation.test.ts` (gated site), `tests/ui-actual-app-preview.test.ts` / `tests/preview-shooting-profile-source.test.ts` (preview stub pins).

- [ ] RED: upload success path calls ports in order and marks the shot; object upload failure cleans uploaded objects and writes nothing; head failure reads back and cleans; list validates heads and drops malformed; download returns clips with blobs and persists through `saveFilmShot` under the same id; delete transitions then removes objects, clips, head and clears the mark; resume finishes `in_progress`; preview source refuses everything and reports `available: false`.
- [ ] GREEN + commit.

### Task 4: capture opt-in

Files: `components/shooting-profile/capture-session.tsx` (switch + copy), `lib/preview/preview-capture-machine.ts` (`save({ cloud })` → `uploadFilmShot` port), `lib/preview/preview-capture-session.tsx` (wires the production cloud source; preview build hides the switch), `hooks/use-shooting-profile-capture.ts` (accepts and ignores `options` for pose saves), `tests/capture-film-only.test.ts` / `tests/preview-capture-controller.test.ts` / render tests.

- [ ] RED: switch hidden when cloud unavailable; visible, off by default when available + signed in; `save({ cloud: true })` uploads after the local save and completes with the cloud copy; upload failure keeps the local shot and offers retry; completion copy names where the footage is.
- [ ] GREEN + commit.

### Task 5: Profile cloud tiles, download, delete

Files: `hooks/use-cloud-film-shots.ts` (new), `components/profile/motion-grid.tsx` (cloud mark, cloud-only tile with 내려받기), `app/(tabs)/profile.tsx` (wiring, confirm sheets), `components/reels/reel-film-media.tsx` (empty state offers 내려받기 on web when the shot is in the cloud), tests.

- [ ] RED/GREEN + commit.

### Task 6: account deletion cascade

Files: `lib/firebase-account-deletion.ts`, `tests/firebase-account-deletion.test.ts`.

- [ ] RED: cloud film shots are deleted after V2 profiles and before the legacy root; a failure aborts the remaining steps.
- [ ] GREEN + commit.

### Task 7: promises

Files: `app/legal/privacy.tsx`, `app/(tabs)/settings.tsx`, capture copy, `docs/release/app-store-privacy-questionnaire.md`, `docs/release/ios-privacy-release-gate.md`, `docs/IMPLEMENTATION_STATUS.md`, tests pinning the copy.

- [ ] RED/GREEN + commit.

### Task 8: verification, PR

- [ ] `corepack pnpm check` / `lint` / `test:unit`; CI rules suite green on the PR head; production isolation export unchanged; preview export unchanged. PR → main for the owner's decision (no merge by the agent).
