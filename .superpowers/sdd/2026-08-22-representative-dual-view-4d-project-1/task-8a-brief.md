# Task 8A brief — strict V2 private persistence contract, Firestore service, and rules

## Scope

Create or modify only:

- `lib/firebase-shooting-profile-contract.ts`
- `lib/firebase-shooting-profiles.ts`
- `firestore.rules`
- `tests/firebase-shooting-profile-contract.test.ts`
- `tests/firestore-shooting-profile-rules.test.ts`
- this task's implementer report

Do not modify profile UI, capture UI/hook, V1 `/poses`, MySQL/tRPC, or upload/commit. Task 8B will wire the service into UI immediately afterward.

## Non-negotiable product boundary

- V2 remains owner-only and uses `representative_phase_fused_4d_estimate_not_actual_3d` plus `normalized_shot_phase`.
- Raw video, URI, filename, EXIF, thumbnail, raw bytes, all face/head landmarks, and native image-relative `z` must never enter a cloud-write object.
- Persisted source observations are the already phase-normalized attempts (`NormalizedViewAttemptV2`), not raw `LandmarkSequenceV2`. They contain exactly 101 samples and only source-space 2D x/y plus optional visibility for the 12 allowlisted joints.
- Reconstructed representative output may and must retain estimated x/y/z and uncertainty for the same 12 joints.
- No V2 write to legacy `/poses` or any MySQL/tRPC path.
- No public/share/comparison/reference paths in Project 1.

## Required public API

Use an explicit input envelope:

```ts
export type SaveShootingProfileInputV2 = {
  profile: RepresentativePose4DV2;
  shootingHand: ShootingHandV2;
  confidence: number;
  normalizedAttempts: readonly NormalizedViewAttemptV2[];
};

export type ShootingProfileViewerRecordV2 = {
  profile: RepresentativePose4DV2;
  shootingHand: ShootingHandV2;
  confidence: number;
};
```

Export:

- `saveShootingProfileV2(user, input): Promise<string>` returning the opaque profile ID.
- `listShootingProfilesV2(user): Promise<ShootingProfileSummaryV2[]>` returning only completed, active owner heads and never trajectory chunks.
- `getShootingProfileV2(user, profileId): Promise<ShootingProfileViewerRecordV2 | null>` matching Task 7 exactly.
- `deleteShootingProfileV2(user, profileId): Promise<void>` resumable and idempotent after the head is gone.
- Pure serializers/validators/chunk helpers needed by tests, including `serializeObservationForCloud` and a strict profile-write validator.

Opaque IDs accepted by public get/delete APIs and produced by save must satisfy `/^[A-Za-z0-9_-]{1,128}$/`, matching Task 7.

## Firestore layout and immutable metadata

Use only these owner paths:

```text
/users/{uid}/captureSessions/{sessionId}
  /observations/{attemptId}
    /frameChunks/{chunkId}
/users/{uid}/motionProfiles/{profileId}
  /revisions/{revisionId}
    /sequenceChunks/{chunkId}
    /phaseSummaries/{phaseId}
```

Every record must use an exact key allowlist and include the relevant immutable owner/path IDs, `schemaVersion: 2`, the evidence boundary, data/retention class, consent reference, algorithm/model version strings, and timestamps. Use fixed constants, not user-provided free-form metadata. IDs in fields must equal path IDs.

Persist each observation phase in one exact frame-chunk document and each representative phase in one exact sequence-chunk document. Each stream therefore has exactly 101 documents with the exact unpadded document ID `String(phaseIndex)`. Persist `phaseIndex` only and reconstruct public `phase` as `phaseIndex / 100`; never persist a separately mutable float phase. The five phase summaries are the exact canonical ordered markers: ready, deepestDip, rise, releaseProxy, followThrough.

The two phase payloads are fixed-size Firestore `bytes`, not nested maps/lists:

- Observation payload: exactly 144 bytes = 12 canonical joints × 3 signed 32-bit integers in joint-major `[x, y, visibility]` order. Use the exact `PERSISTED_JOINT_NAMES_V2` order, big-endian two's-complement integers, fixed-point scale 1,000,000, and one named sentinel for missing optional visibility. A missing visibility must decode as absent and behave fail-closed; it must never silently become high confidence.
- Representative payload: exactly 480 bytes = 12 canonical joints × 10 signed 32-bit integers in joint-major `[x, y, z, xx, xy, xz, yy, yz, zz, cone]` order. Use the same exact joint order, big-endian two's-complement integers, scale 1,000,000, and exact uncertainty-model literal `heuristic_v1` in the document envelope.

Every payload document must carry exact, immutable `payloadFormat`, `payloadByteLength`, `fixedPointScale`, and packing-order literals. Use Firebase's documented `Bytes.fromUint8Array` at the service write boundary and `Bytes.toUint8Array` at the service read boundary; keep pack/unpack helpers pure over `Uint8Array`. Do not accept an arbitrary duck-typed object as cloud bytes. Firestore Rules officially supports the `bytes` type and `Bytes.size()`, so rules must require both the type and exact 144/480-byte size.

Quantize every persisted numeric coordinate/visibility/uncertainty value only after proving it finite and within an explicit sane bound. Encode only safe signed-int32 fixed-point values. The trusted serializer and strict cloud reader must validate every decoded slot, including coordinate bounds, visibility/sentinel, covariance diagonal/off-diagonal bounds, cone range, and PSD via the Task 1B codec. They must reject, not coerce, untrusted NaN/infinity/out-of-range values, invalid sentinels, malformed lengths, non-Firestore bytes, and unknown keys. A source observation may contribute only `x`, `y`, and optional `visibility` for the 12 allowlisted joints; any `z`, `nose`, or other landmark must fail before packing. A completed profile and revision always have `quality.passed === true` and exactly zero quality reasons.

This binary envelope is an explicit Firestore-rules tradeoff: Rules can prove owner isolation, exact keys/metadata/IDs, payload type, and exact payload byte size, while semantic numeric validation happens in the trusted writer and strict reader. Document this honestly; do not claim Rules inspect individual packed integers. The fixed-size owner-private envelope bounds abuse and prevents extra media fields, but emulator-backed App Check/server-side attestation is a future hardening gate if hostile clients must be prevented from placing arbitrary same-size bytes in their own documents.

## Atomic publication protocol

Generate capture-session, profile, and revision refs first. Build every sanitized write object before the first Firebase mutation.

Write in this order:

1. observation frame chunks;
2. completed observation heads;
3. completed capture-session head;
4. representative sequence chunks and phase summaries;
5. completed revision head;
6. completed active motion-profile head last.

Respect both Firestore limits: at most 400 API mutations and at most 1,000 evaluated rules expressions per request. Use a conservatively rule-safe mutation count for the actual deep-validation cost; a batch size of one remains acceptable until emulator evidence supports increasing it. A completed profile head must never exist before all required subordinate writes and the revision summary have succeeded. On any failure before head publication, best-effort deletion must continue across every known staging path even if an earlier delete fails; do not abandon later cleanup targets. Keep the logic testable with pure write-plan helpers.

## Read reconstruction

- Validate the owner head, revision, exact 101 sequence-chunk count/order/IDs, canonical summaries, envelope fields, byte type/length, every decoded slot, and strict V2 codec before returning.
- Fail closed on incomplete, deleting, malformed, mismatched-owner/path, duplicate, missing, or extra chunks. Do not synthesize or interpolate missing frames.
- Do not log IDs or profile data.

## Resumable deletion

- Read and strictly validate the owner head.
- Transition only `deletionState: active -> in_progress` plus `updatedAt`; immutable metadata cannot change.
- Enumerate the known sequence chunks, phase summaries, revision head, linked capture-session observation heads and their frame chunks, then capture-session head.
- Delete subordinate refs in batches of at most 400 and the motion-profile head last.
- If reopened while `in_progress`, enumerate again and resume. Missing subordinate docs are harmless. If the head is already gone, return successfully.
- After deleting the head, read it once and throw unless it no longer exists. UI completion will depend on that postcondition in Task 8B.

## Firestore rules

- Preserve current V1 `/users/{uid}/poses` read/create/delete semantics exactly.
- Require authenticated matching UID for all V2 reads/writes/deletes.
- Use `keys().hasOnly(...)` and `hasAll(...)` at every V2 document level. For phase documents, validate exact binary-format literals plus `payload is bytes` and the exact 144/480-byte `payload.size()`. Do not pretend Firestore Rules validates individual integers hidden inside bytes; the production serializer/reader owns that semantic validation.
- Validate bounded strings, counts, finite-number-compatible numeric bounds, exact constants, path-ID equality, canonical phases, and timestamps.
- Create-only immutable observation/chunk/session/revision documents; owner deletion allowed.
- Profile head create only when the referenced completed revision exists. Profile update only allows the one-way deletion-state transition and timestamp; no other key changes. Deny all other updates.
- Deny-by-default remains in effect; no public access.

## Test-first/static evidence

Write tests before production code. Cover at least:

- source `z`, nose/nonallowlisted joints, raw media keys, URI/filename/EXIF/bytes, unknown keys, NaN/infinity, invalid quantization/bounds;
- exact 12-joint 2D observations and exact 12-joint 3D reconstructed frames;
- Basic 2 attempts and High accuracy 6 attempts with view/take/hand consistency;
- 101 phase indices, 101 observation chunks per attempt, 101 representative chunks, canonical unpadded IDs, phase order and completeness, canonical summaries, and phase reconstruction from index only;
- exact 144/480-byte big-endian payloads, deterministic round-trip, missing-visibility sentinel behavior, Firebase `Bytes` conversion at the service boundary, and rejection of malformed length/type, out-of-range decoded values, invalid sentinel, indefinite covariance with positive diagonals, unknown keys, nonallowlisted joints, and non-finite inputs;
- viewer envelope compatibility, incomplete/deleting head rejection, missing/duplicate/extra chunk rejection;
- write plan places profile head last and every batch is <=400;
- delete plan makes head last, supports `in_progress`, and includes observation/frame-chunk paths;
- static rules contain owner isolation, exact key helpers, path equality, exact bytes type/size/format validation, immutable update diff, and preserve V1.
- an AST-level conservative expression-budget audit parses the actual `allow` body and recursively expands custom functions while counting every unary/binary/ternary operator, call, member/index access, literal/identifier node, and arithmetic/string operation. It must leave a substantial margin below 1,000 (target <=700); do not substitute hand-entered request overhead or omit syntax to improve the result. Firebase compiler/emulator worst-case proof remains a release gate until dependencies are available.

The expression-budget audit must cover every V2 create path, including the observation frame chunk; no legacy nested-map path may remain above the target. Runtime dependencies are unavailable because restoration approval was denied. Do not install or work around this. Record RED/green execution as dependency-blocked; perform rigorous read-only static auditing only. Do not claim Vitest, TypeScript, ESLint, Firebase emulator, or runtime pass.
