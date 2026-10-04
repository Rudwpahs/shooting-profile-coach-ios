# Cloud film shots v1 — design

**Decision (owner, 2026-10-04):** keep footage on the device by default; let the owner opt in **per shot** to keep a film shot in their own private cloud space so it is visible after signing in on another device. Backend: Firebase Storage + Cloud Firestore, on the Auth, Firestore and rules-test infrastructure the app already has. The "store in a DB behind login" idea is this feature; the legacy `server/` (drizzle/MySQL) is not used for footage.

## Architecture gate (added 2026-10-04, after `docs/HOOPHUB_AI_PRODUCT_ARCHITECTURE.md` landed on main)

The AI product architecture locks raw shooting video to the device by default and says a change that uploads raw video needs a new reviewed architecture decision (§6, and the MVP criterion "raw video remains local"). The owner's decision above predates that document and has not been reviewed against it. This lane therefore ships the feature **behind a build flag that is off by default**:

- `EXPO_PUBLIC_HOOPHUB_CLOUD_FILM_SHOTS_V1=1` turns it on; nothing else does, and the install-free preview never gets it even with the flag set.
- With the flag off (every ordinary build): no surface offers cloud keeping, every existing "never uploaded" promise stays true and unchanged, and the bundle does not contain the upload code, the Firebase source or the web capture session. The Pages workflow greps the ordinary production export for those and fails on a hit.
- The one piece that ships in every build is **delete-only**: account deletion erases the owner's cloud film shots, so footage kept by a flag-on build can never outlive an account deleted from a flag-off build.
- Turning the flag on in a shipped build is the owner's call and requires the reviewed architecture decision; the checklist is in `docs/release/ios-privacy-release-gate.md`. This lane does not turn it on anywhere.

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
| `status` | `"uploading"` \| `"complete"` (created as `uploading`; only `complete` is a kept shot) |
| `deletionState` | `"active"` \| `"in_progress"` |
| `shotId` | `== {shotId}` |
| `title` | string, `^[A-Za-z0-9가-힣 ·]{1,24}$` (a display name, never a file name) |
| `clipIds` | list of 1–6 slot ids, each `^(front|shooting_side)-[0-2]$`, no duplicates |
| `clipCount` | `== clipIds.size()` |
| `createdAt`, `updatedAt` | timestamps, `== request.time` on create |

`users/{uid}/filmShots/{shotId}/clips/{slotId}` — one per clip, exact keys: the seven common fields above with `recordType: "film_shot_clip_v1"`, plus `shotId`, `slotId == {slotId}`, `view` (`front`|`shooting_side`, consistent with `slotId`), `takeIndex` (0–2, consistent), `durationMs` (int 200–60000), `width`, `height` (int 16–8192), `byteLength` (int 1–67108864), `contentType` (as above), `storagePath == "users/{uid}/filmShots/{shotId}/{slotId}"`, `createdAt`, `updatedAt`.

**The head is the journal.** Rules cannot see Storage, and an upload interrupted after an object is stored but before any document exists (a closed tab is enough) would leave raw footage that nothing names and nothing can find. So the client writes in this order, and the rules enforce it:

1. the head, created as `status: "uploading"`, `deletionState: "active"`, already naming every clip in `clipIds`;
2. the objects;
3. one clip document per clip — accepted only under an `uploading`, `active` head that names that slot;
4. an update of the head to `status: "complete"` that changes only `status` and `updatedAt` and requires every named clip document to exist.

From step 1 on, a Firestore document names every object the upload may create. Deletion works for a kept shot and for an unfinished upload alike: head `active → in_progress` (only those two keys change), then for every slot the head names the object and the clip document (a clip document is deletable only while its head is `in_progress`; the object paths come from the head, never from the clip documents), then the head (only when `in_progress` and no clip document remains). Every upload failure runs that deletion; if it fails too, the head stays behind and a later pass finishes it. The resume pass finishes `in_progress` deletions and removes uploads whose head has not changed for two hours, leaving a recent one alone because it may still be running elsewhere. Only `complete`, `active` heads are listed or downloaded. A retry is a no-op for a shot that is already kept and erases a leftover head before starting clean.

The cloud `shotId` **is the device film-shot id** (`film-shot-…`), so a shot that exists both locally and in the cloud is one shot, and a download recreates the device record under the same id.

## Client architecture

- `lib/firebase-film-shot-contract.ts` — pure: constants, validators for head/clip documents, `buildFilmShotWritePlanV1` (head create → object uploads → clip writes → head completion), path helpers, title regex.
- `lib/firebase-film-shot-deletion.ts` — **delete-only, in every build**: `deleteCloudFilmShotV1`, `resumePendingCloudFilmShotDeletionsV1`, `eraseEveryCloudFilmShotV1` and delete-only Firebase ports. It has no way to send or fetch footage (pinned by a test). A refused owner listing means the feature's rules are not deployed, so there is nothing to erase; any other failure aborts.
- `lib/firebase-film-shots.ts` — send and fetch against injectable ports (upload, list, download) plus the Firebase adapter (`uploadBytes` / `getBytes`). Loaded only through the cloud source.
- `lib/film-shot-cloud-source.ts` — the swappable source: unavailable by default and in the preview (every call refuses); the Firebase source (`lib/firebase-film-shot-cloud-source.ts`) is `require`d only behind the literal flag gate so Metro folds it out of ordinary bundles.
- `lib/film-space/web-film-capture-machine.ts` — the browser's footage-only capture machine (moved out of `lib/preview/`, which re-exports it). It saves on the device first and uploads only when the build supplied an upload port **and** the owner turned the switch on for that save; a failed upload is reported, never a lost shot. `components/shooting-profile/web-film-capture-session.tsx` is the signed-in web capture screen, reached from `app/private-capture.tsx` only behind the flag.
- Capture: `CaptureController.save(options?: { cloud?: boolean })`, `cloudKeepAvailable`, `cloudKeepResult`. The film review panel shows the switch **"클라우드에도 보관"** (off by default) only when available; turning it on replaces the "어디에도 업로드되지 않습니다" sentence with one that names the destination, who can see it and how it is deleted. The completion copy says where the footage actually ended up.
- Device store link: `lib/film-space/film-shot-cloud-state.ts` keeps a per-shot "kept in the cloud" note in AsyncStorage; it is a note, the cloud documents are the truth.
- Profile: `lib/film-space/film-shot-cloud-actions.ts` (keep, download, delete everywhere — cloud copy first —, delete cloud only, list, merge into tiles), `hooks/use-cloud-film-shots.ts` (reads nothing unless the source is available and an owner is signed in), `components/profile/film-shot-actions-sheet.tsx` (an in-app sheet that states where the footage is before offering anything; delete takes two presses; it replaces the native alert, which is a no-op in a browser). Film tiles show a cloud mark when kept; a cloud-only shot is listed and can be downloaded (browser) or deleted.
- Account deletion: `runAccountDeletion` gains `eraseCloudFilmShots`, after the legacy poses and before the root document and the Auth user, in every build.

## Platforms

- Web (production build with Firebase configured **and the flag on**): capture with the switch, keep later from the Profile, download and delete all work (`Blob` in IndexedDB).
- iPhone: the native app does not create film shots yet, holds no clip files to send, and cannot hold a download; with the flag on it lists cloud shots and can delete them, and the sheet says the download needs a browser. A native "영상만 보관" capture and a native file store are a separate lane.
- Every build, flag on or off: account deletion erases cloud film shots.
- Install-free public preview: the cloud source is unavailable; the switch is hidden; no Firebase code runs.

## Promises that change (must land in the same PR)

Every promise follows the same build flag as the code that could break it, so the default text is unchanged and stays true:

- `app/legal/privacy.tsx` §2: by default, footage kept as "내 영상" stays on this device and is not uploaded. With the flag on: only for a shot where the user turned on cloud keeping, the clips are stored in the owner's private Firebase Storage path, without file name or EXIF, invisible to other users, deleted with the shot or the account.
- Capture film review and completion copy; `app/(tabs)/settings.tsx` sentence; `components/private-pose-capture.tsx` is untouched (legacy V1 path has no footage).
- `docs/release/app-store-privacy-questionnaire.md` carries both cases and tells the submitter to confirm which one the archive is; `docs/release/ios-privacy-release-gate.md` lists what turning the flag on requires (architecture decision, deployed rules, Storage region, policy and store answers, an end-to-end deletion check on the production project).

## Security and privacy boundaries

- Owner-only everywhere (Storage and Firestore). No public reads, no listing outside the owner's prefix.
- Rules bound size, type, ids, shapes; documents carry no file names, EXIF or landmarks.
- Upload is per-shot opt-in, off by default; the sentence next to the switch names the destination.
- Deletion is complete (objects, clip docs, head) and resumable; account deletion includes it.
- Rules are tested in the Firestore **and** Storage emulators in CI (Java is CI-only; local runs cannot execute the rules suite).

## Verification

- Unit: contract validators, write plan, orchestration with fake ports that refuse what the rules refuse (order, every failure point, cleanup failure, retry, stale uploads, erase-everything, not-deployed), source gating, capture machine and switch, Profile actions and sheet, deletion cascade order and adapter wiring, promise pins.
- Emulator (CI only; no local Java): owner-only objects, write-once, bounded size and type; head created only as `uploading`; clip only under an uploading head that names it; completion only over every named clip and only by changing `status`/`updatedAt`; deletion order for kept and unfinished shots; intruder and anonymous refused everywhere.
- Bundle: the ordinary production export contains none of `firebaseFilmShotCloudSource`, `uploadFilmShotV1`, `WebFilmCaptureSession` (CI guard); a flag-on export contains them (checked locally as the positive control).
- **Not verified, and not claimed:** the Firebase adapter against a real project (upload, list, download, delete, account deletion). The preview build has no Firebase, this machine has no emulator, and no credentials were used. That end-to-end check is an owner-side step and is part of the release gate for turning the flag on.
