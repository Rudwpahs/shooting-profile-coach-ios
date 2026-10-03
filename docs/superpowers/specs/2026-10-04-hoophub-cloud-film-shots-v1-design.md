# Cloud film shots v1 — design

**Decision (owner, 2026-10-04):** keep footage on the device by default; let the owner opt in **per shot** to keep a film shot in their own private cloud space so it is visible after signing in on another device. Backend: Firebase Storage + Cloud Firestore, on the Auth, Firestore and rules-test infrastructure the app already has. The "store in a DB behind login" idea is this feature; the legacy `server/` (drizzle/MySQL) is not used for footage.

## What exists today

- Firestore `users/{uid}/...` holds **derived** data only (observations, capture sessions, motion profiles, revisions), owner-private, rules-tested in the emulator (`tests/emulator/`). Account deletion erases these before the Auth user.
- Film shots (`lib/film-space/film-shots.ts`) are **device-local**: AsyncStorage index + record, the local film association, and on the web the file itself in IndexedDB. Nothing uploads. Every surface (Home stories, Profile tiles, Reels film reel, capture completion copy, privacy notice, App Store sheet) states that raw footage is never uploaded.
- Firebase Storage is not used anywhere. `storage.rules` does not exist.

## Goals

1. A signed-in owner can keep a film shot in the cloud **only when they turn it on for that shot**. Default is off; nothing about the default path changes.
2. On another device, signed in as the same owner, the shot appears in Profile as a cloud shot and can be downloaded into the device store and played through Film Space exactly like a captured shot.
3. The owner can delete a cloud shot; deleting the account deletes every cloud shot (files and documents) before the Auth user.
4. Nobody but the owner can read, list, write or delete the files or documents. Size, type and shape are enforced by rules, not by the client alone.
5. Every promise the app makes about footage is updated to say exactly this, and the preview build never talks to Firebase.

## Non-goals (v1)

- Pose analysis of footage, sharing with other people, public feeds, thumbnails, transcoding, resumable uploads, background sync, native file downloads (see "Platforms").
- Creating film shots on the iPhone app. Today only the web capture flow produces film shots; a native "영상만 보관" path is a separate lane and the prerequisite for the owner's own iPhone clips to reach the cloud.

## Data model

### Storage object

`users/{uid}/filmShots/{shotId}/{slotId}` — the clip bytes, `contentType` one of `video/mp4`, `video/quicktime`, `video/webm`, size 1 B … 64 MiB. `shotId` matches `^[A-Za-z0-9_-]{1,128}$`; `slotId` matches `^(front|shooting_side)-[0-2]$`. Objects are created once (no overwrite), readable and deletable by the owner only. No metadata beyond content type; no file name anywhere.

### Firestore documents

`users/{uid}/filmShots/{shotId}` — head, exact keys:

| key | value |
| --- | --- |
| `ownerUid` | `uid` |
| `schemaVersion` | `1` |
| `recordType` | `"film_shot_head_v1"` |
| `boundary` | `"owner_footage_only_no_pose_analysis_v1"` |
| `dataClass` | `"owner_private_raw_footage_v1"` |
| `retentionClass` | `"owner_deleted_v1"` |
| `consentReference` | `"owner_cloud_footage_consent_v1"` |
| `status` | `"complete"` |
| `deletionState` | `"active"` \| `"in_progress"` |
| `shotId` | `== {shotId}` |
| `title` | string, `^[A-Za-z0-9가-힣 ·]{1,24}$` (a display name, never a file name) |
| `clipIds` | list of 1–6 slot ids, each `^(front|shooting_side)-[0-2]$`, no duplicates |
| `clipCount` | `== clipIds.size()` |
| `createdAt`, `updatedAt` | timestamps, `== request.time` on create |

`users/{uid}/filmShots/{shotId}/clips/{slotId}` — one per clip, exact keys: the seven common fields above with `recordType: "film_shot_clip_v1"`, plus `shotId`, `slotId == {slotId}`, `view` (`front`|`shooting_side`, consistent with `slotId`), `takeIndex` (0–2, consistent), `durationMs` (int 200–60000), `width`, `height` (int 16–8192), `byteLength` (int 1–67108864), `contentType` (as above), `storagePath == "users/{uid}/filmShots/{shotId}/{slotId}"`, `createdAt`, `updatedAt`.

Rules cannot see Storage, so the **client writes the object first**, then the clip document, then the head. The head create requires every `clipIds` entry to exist as a clip document owned by the same uid with the same `shotId`. A clip document can be created only while no head exists. Deletion is the mirror of motion profiles: head `active → in_progress` (owner, only those two keys change), then objects, then clip documents (allowed when the head is absent or `in_progress`), then the head (allowed only when `in_progress` and no clip document remains). Resume-on-launch finishes any `in_progress` deletion.

The cloud `shotId` **is the device film-shot id** (`film-shot-…`), so a shot that exists both locally and in the cloud is one shot, and a download recreates the device record under the same id.

## Client architecture

- `lib/firebase-film-shot-contract.ts` — pure: constants, validators for head/clip documents, `buildFilmShotWritePlanV1` (object uploads → clip writes → head write), storage path helper, title regex (shared with `film-shots.ts`).
- `lib/firebase-film-shots.ts` — the orchestration against injectable ports (`uploadObject`, `deleteObject`, `downloadObject`, `setDocument`, `readDocumentFromServer`, `listHeads`, `updateDocument`, `deleteDocument`) plus the Firebase adapter (`firebase/storage` `uploadBytes` / `getBytes` / `deleteObject`, Firestore as today). Upload failure cleans the known uploaded objects and documents; a failed head write is resolved like the profile publication (read back, cleanup).
- `lib/film-shot-cloud-source.ts` — the swappable source (production: Firebase; preview build: `available: false`, every call refuses), through the same literal gate + `require` pattern as `shooting-profile-source.ts`. Nothing in `lib/preview/` touches Firebase or Storage.
- Device store link: `lib/film-space/film-shot-cloud-state.ts` keeps, per shot id, `{ state: "uploaded", uploadedAtMs }` in AsyncStorage so the UI can say "클라우드에도 보관됨" without a network read; cleared on cloud delete.
- `hooks/use-cloud-film-shots.ts` — signed-in owner only: lists heads, exposes `download(shotId)` (web: bytes → `Blob` → `saveFilmShot` under the same id with the files persisted; native: `unsupported` until a native file store exists) and `remove(shotId)`.
- Capture: `CaptureController.save(options?: { cloud?: boolean })`. The film review panel shows a switch **"클라우드에도 보관"** (default off) only when the cloud source is available and the user is signed in, with the honest sentence "켜면 선택한 영상이 내 계정 전용 비공개 저장 공간(Firebase Storage)에 업로드됩니다. 끄면 이 기기에만 남습니다." After a local save with `cloud: true`, the clips (with their files) are uploaded; the completion copy says which happened. Upload failure after a successful local save is reported as a recoverable error with retry; the local shot is never lost.
- Profile: film tiles carry a small cloud mark when uploaded; cloud-only shots (not on this device) appear as tiles with "내려받기"; long-press offers "이 기기에서 삭제" and, when uploaded, "클라우드에서도 삭제".
- Account deletion: `runAccountDeletion` gains `listCloudFilmShotIds` / `deleteCloudFilmShot` steps before deleting the legacy root.

## Platforms

- Web (production build with Firebase configured): upload and download both work (`Blob` in IndexedDB).
- iPhone: upload works for a film shot whose clip URIs are readable (`fetch(file://…)` → `Blob`); download is reported as unsupported until a native file store (expo-file-system) is adopted. Native capture does not yet produce film shots; that lane follows this one.
- Install-free public preview: the cloud source is unavailable; the switch is hidden; no Firebase code runs.

## Promises that change (must land in the same PR)

- `app/legal/privacy.tsx` §2: footage is **not** uploaded unless the user turns on cloud keeping for a shot; then the clips are stored in the owner's private Firebase Storage path (Google, region per project), readable only by that account, deleted with the shot or the account.
- Capture film review and completion copy; `app/(tabs)/settings.tsx` sentence; `components/private-pose-capture.tsx` is untouched (legacy V1 path has no footage).
- `docs/release/app-store-privacy-questionnaire.md`: "User content: raw shooting video — optional, user-initiated per shot, linked to UID, app functionality, Firebase Storage"; `docs/release/ios-privacy-release-gate.md`: add the Storage bucket region/evidence item.

## Security and privacy boundaries

- Owner-only everywhere (Storage and Firestore). No public reads, no listing outside the owner's prefix.
- Rules bound size, type, ids, shapes; documents carry no file names, EXIF or landmarks.
- Upload is per-shot opt-in, off by default; the sentence next to the switch names the destination.
- Deletion is complete (objects, clip docs, head) and resumable; account deletion includes it.
- Rules are tested in the Firestore **and** Storage emulators in CI (Java is CI-only; local runs cannot execute the rules suite).

## Verification

- Unit: contract validators, write plan, orchestration with fake ports (success, partial failure cleanup, head read-back), source gating, hooks with mocked AsyncStorage, capture switch behaviour, deletion cascade order.
- Emulator (CI): owner can create objects/clips/head in order; intruder and anonymous cannot read/write/list; oversize or wrong content type objects are refused; head before clips is refused; clip after head is refused; deletion transition and order enforced; wrong `storagePath`, title or clip ids refused.
- Browser preview QA cannot cover this (no Firebase in the preview build); a production web build QA against a Firebase project is an owner-side step.
