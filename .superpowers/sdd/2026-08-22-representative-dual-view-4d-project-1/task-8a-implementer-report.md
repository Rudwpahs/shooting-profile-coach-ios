# Task 8A implementer report — owner-private binary persistence and rules

## Result

Implemented the V2 private persistence boundary with one canonical binary document per normalized phase:

- each observation attempt stores exactly 101 nonpadded phase documents (`0` through `100`), each containing a 144-byte payload for 12 allowlisted joints × `(x, y, visibility)`;
- each representative revision stores exactly 101 nonpadded phase documents, each containing a 480-byte payload for 12 joints × `(x, y, z, covariance6, cone)`;
- all slots are signed int32, big-endian, fixed at scale `1_000_000`; missing observation visibility alone uses `INT32_MIN`;
- Firebase `Bytes.fromUint8Array` and `toUint8Array` are used only at the Firestore service boundary;
- strict client serializers/readers validate exact keys, lengths, ordering, numeric bounds, visibility/sentinel semantics, covariance PSD through the representative codec, canonical IDs, empty completed quality, and Basic confidence at or below `0.65`;
- raw media, URI, filename, EXIF, thumbnails, source timestamps, nonallowlisted landmarks, and native MediaPipe `z` never enter the cloud write plan;
- owner-only rules validate the exact immutable envelope, path identity, metadata literals, byte type, and exact 144/480-byte size;
- the profile head is published last only after the complete revision exists and matches its publication identity;
- deletion transitions the head to `in_progress`, deletes subordinate paths while continuing past already-absent paths, and deletes the head last with server-read ambiguity checks.

The public boundary remains `representative_phase_fused_4d_estimate_not_actual_3d`, the time basis remains the exact 101-frame `normalized_shot_phase`, and `heuristic_v1` is not presented as calibrated uncertainty.

## Binary layouts

Observation payload (`144` bytes):

`12 joints × 3 int32 × 4 bytes`

The canonical joint-major slot order is `x, y, visibility`. Coordinates are bounded to `[-2, 2]`, visibility to `[0, 1]`, and missing visibility uses only `-2147483648`.

Representative payload (`480` bytes):

`12 joints × 10 int32 × 4 bytes`

The canonical joint-major slot order is `x, y, z, xx, xy, xz, yy, yz, zz, cone`. Coordinates are bounded to `[-10, 10]`, covariance entries to `[-100, 100]` with nonnegative diagonal slots, and cone to `[0, 180]`. Full profile reconstruction runs the strict covariance PSD codec before returning data to the viewer.

## Security boundary and tradeoff

Firestore Rules can prove owner identity, exact keys, metadata, path IDs, byte type, and byte length, but they do not decode arbitrary binary slots. Therefore a hostile authenticated owner could write arbitrary same-size bytes into that owner's own private documents. The trusted app serializer and strict reader reject malformed semantics, and the fixed-size owner-private envelope limits cross-user disclosure and payload expansion, but it is not server attestation. App Check or a trusted server-side validation/attestation path is required before treating owner-written bytes as authoritative comparative-player data.

Rules expression cost is kept below the conservative test ceiling of 700 per create path. To stay within the request-wide Rules expression budget and preserve precise ambiguous-write cleanup, `RULE_SAFE_BATCH_MUTATIONS_V2` is intentionally `1`. A High capture produces 720 staging writes before the final publication write. This is safe but potentially slow and is an explicit rollout blocker until emulator and real-network latency testing passes or the storage protocol is revised.

## Test-first and static evidence

Tests were changed first to require exact 144/480-byte layouts, deterministic big-endian round trips, missing-visibility behavior, Firebase `Bytes` conversion, malformed length/type rejection, decoded numeric bounds, covariance PSD rejection, 101 canonical phase documents, head-last publication, owner-only rules, and deletion ambiguity handling.

After production changes, system Node 24 with `--experimental-strip-types --check` parsed the contract, service, contract test, and rules test files successfully. Source inspection confirmed:

- observation and representative rules contain exact `bytes` type and size checks;
- sequence and observation counts are exactly 101 with nonpadded IDs;
- obsolete 202-document coordinate/uncertainty grouping and nested numeric rule validation are absent;
- the service converts to/from Firebase `Bytes` only at persistence boundaries;
- the viewer reconstructs all 101 phases and re-runs the strict representative codec;
- publication remains head-last and deletion remains subordinate-first/head-last.

Executable Vitest, TypeScript, ESLint, Firebase Rules compiler/emulator, live Firestore latency, and ambiguous-network integration checks remain pending because the materialized dependency tree is quarantined. No project dependency binary or package manager was used.

## Files changed

- `lib/firebase-shooting-profile-contract.ts`
- `lib/firebase-shooting-profiles.ts`
- `firestore.rules`
- `tests/firebase-shooting-profile-contract.test.ts`
- `tests/firestore-shooting-profile-rules.test.ts`
- `.superpowers/sdd/2026-08-22-representative-dual-view-4d-project-1/task-8a-brief.md`
- this report

## Release gates

Do not enable the V2 flags until all of the following pass in a clean environment: full TypeScript/Vitest/lint, Firebase Rules compilation and emulator authorization tests, real-network save latency and retry/cleanup behavior for Basic and High, cross-account denial, reopen/readback, deletion resumption, Xcode native build, and physical-iPhone capture validation.
