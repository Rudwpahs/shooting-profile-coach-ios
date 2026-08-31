# Compact Representative 4D Persistence Design

Status: approved for implementation  
Repository: `Rudwpahs/shooting-profile-coach-ios`  
Branch: `codex/representative-dual-view-4d`  
Date: 2026-08-26

## 1. Decision

Replace the pre-release V2 per-phase Firestore documents with one packed sequence per accepted attempt and one packed representative sequence in the immutable revision document.

- Basic writes two observation documents, one capture session, one representative revision, and the publication head last: **5 total writes**.
- High accuracy writes six observation documents, one capture session, one representative revision, and the publication head last: **9 total writes**.
- `RULE_SAFE_BATCH_MUTATIONS_V2` remains `1`. The safety model stays one acknowledged mutation at a time; the improvement comes from document granularity, not a larger batch.
- The biomechanical boundary remains exactly `representative_phase_fused_4d_estimate_not_actual_3d`. This change does not make the result calibrated, metric, synchronized, or actual 3D.

The V2 feature has not been merged to `main` and its three runtime flags remain default-off. Therefore this branch changes the pre-release V2 storage contract in place. It does not add a legacy reader for the unreleased 720-document layout. Unknown, missing, or hybrid storage layouts fail closed.

## 2. Why this layout

The current High staging plan creates 606 observation phase documents, 6 observation heads, 1 capture-session head, 101 representative phase documents, 5 phase-summary documents, and 1 revision head: 720 staging writes before publication. The payload bytes are already compact; the excessive cost and failure surface come from storing every phase separately.

One document for all six attempts would use fewer writes, but it would couple unrelated attempts into one corruption and retry unit. Keeping one document per attempt preserves the existing identity and privacy boundary while still reducing High persistence from 721 total writes to 9.

Both packed payloads remain far below Firestore's 1 MiB document limit:

| Payload | Formula | Exact bytes |
|---|---:|---:|
| One normalized observation attempt | `101 phases × 12 joints × 3 int32 slots × 4` | 14,544 |
| One representative sequence | `101 phases × 12 joints × 10 int32 slots × 4` | 48,480 |

## 3. Exact storage topology

```text
users/{uid}/captureSessions/{captureSessionId}
users/{uid}/captureSessions/{captureSessionId}/observations/{attemptId}
users/{uid}/motionProfiles/{profileId}/revisions/{revisionId}
users/{uid}/motionProfiles/{profileId}
```

For this unreleased V2 layout, one generated opaque value is intentionally reused for `captureSessionId`, `profileId`, and `revisionId`. The explicit fields remain in every schema, but the three values and their path segments must be equal. Consequently, a profile has only one valid staging capture path and one valid revision path; create-only Rules cannot admit a second chain that could later be orphaned by publication of the first.

There are no V2 `frameChunks`, `sequenceChunks`, or `phaseSummaries` subcollections in the compact layout.

Every compact document carries:

```ts
storageLayout: "phase_sequence_payloads_v1"
```

The existing common owner, consent, retention, algorithm, model, boundary, time-basis, and timestamp fields remain exact and immutable.

### 3.1 Observation document

One document is written for each canonical attempt ID (`front-0`, `shooting_side-0`, and the additional `-1`/`-2` attempts in High mode).

```ts
{
  recordType: "normalized_observation_v2",
  storageLayout: "phase_sequence_payloads_v1",
  captureSessionId,
  profileId,
  revisionId,
  attemptId,
  status: "complete",
  view,
  shootingHand,
  takeIndex,
  frameCount: 101,
  framePayloadByteLength: 144,
  payloadByteLength: 14_544,
  payloadFormat: "int32_be_fixed_1e6_v1",
  fixedPointScale: 1_000_000,
  packingOrder: "phase_major_joint_major_xy_visibility_v1",
  missingVisibilitySentinel: -2_147_483_648,
  payload: Bytes
}
```

The payload is the direct concatenation of the existing validated frame representation in phase order. Phase position is implicit: byte range `phaseIndex × 144 .. +143` belongs to that phase. Exact total length therefore requires all 101 slots, with no sparse document IDs to reconcile.

### 3.2 Capture-session document

The capture session retains the existing canonical `attemptIds`, `attemptCount`, mode, hand, and path identities, and adds the storage-layout discriminator. It is created only after all required observation documents exist.

### 3.3 Representative revision document

The representative sequence is embedded in the immutable revision:

```ts
{
  recordType: "representative_revision_v2",
  storageLayout: "phase_sequence_payloads_v1",
  profileId,
  captureSessionId,
  revisionId,
  status: "complete",
  mode,
  shootingHand,
  confidence,
  attemptCount,
  frameCount: 101,
  phaseSummaryCount: 5,
  units: "template_shoulder_breadths",
  framePayloadByteLength: 480,
  payloadByteLength: 48_480,
  payloadFormat: "int32_be_fixed_1e6_v1",
  fixedPointScale: 1_000_000,
  packingOrder: "phase_major_joint_major_xyz_covariance6_cone_v1",
  uncertaintyModel: "heuristic_v1",
  payload: Bytes,
  quality: { passed: true, reasons: [] }
}
```

Canonical anchors are schema constants and are reconstructed as `ready=0`, `deepestDip=25`, `rise=50`, `releaseProxy=75`, and `followThrough=100`; duplicate summary documents are unnecessary.

### 3.4 Publication head

The small profile head keeps list/display fields and immutable IDs. It includes the storage layout and `representativePayloadByteLength: 48_480` instead of a sequence-chunk count. It is the final mutation and is the only record that makes the profile visible to normal listing and viewer flows.

## 4. Binary codec contract

Add explicit frame and sequence constants rather than using an ambiguous `PAYLOAD_BYTE_LENGTH` name:

```ts
OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2 = 144
OBSERVATION_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2 = 14_544
REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2 = 480
REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2 = 48_480
```

Serialization validates the full source object first, packs each phase using the existing int32 big-endian fixed-point codec, and concatenates exactly 101 blocks. Decoding must:

1. require `Uint8Array` inside the pure contract and Firestore `Bytes` at the Firestore boundary;
2. require exact frame and total byte lengths and exact packing metadata;
3. slice all 101 positional blocks;
4. run the existing strict per-frame numeric validation on each block;
5. rebuild the complete representative sequence and pass it through `parseRepresentativePose4D`, including covariance positive-semidefinite validation.

Any malformed block invalidates the whole document. Source timestamps, URIs, filenames, EXIF, thumbnails, video bytes, face/head landmarks, and MediaPipe image-relative `z` remain forbidden from cloud persistence.

## 5. Ordered publication and proof chain

Writes occur in this order:

1. canonical observation documents;
2. capture-session document;
3. representative revision document;
4. publication head.

All staging writes remain single-mutation commits. A failed or ambiguous write is compared with the exact planned immutable fields and `Bytes`; only acknowledged or server-observed matching paths are cleanup candidates.

Firestore rules establish an immutable evidence chain:

- each observation create validates its exact schema, path identity, canonical shared chain ID, byte type, and byte length and requires that no publication head exists;
- capture-session create reads the exact two or six canonical observation documents and validates their identities against the session;
- revision create reads the completed capture session and validates the shared IDs, mode, hand, attempt count, and storage layout;
- publication-head create reads the completed revision, invokes the full packed-revision validator (including the 48,480-byte `Bytes` payload), and validates all immutable publication identities.

This costs at most seven document-access calls for the High capture-session create and two for revision creation, below Firestore's per-operation limit of ten. Publication requires one document read. The conservative expression-budget regression check remains at 700.

Firestore rules cannot decode arbitrary `Bytes`, recompute a 2-of-3 consensus, or prove that a malicious owner submitted genuine video-derived motion. They can enforce owner isolation, exact shape and lengths, immutable relationships, and ordered publication. Strong semantic provenance would require a trusted backend and is outside this client-only release.

## 6. Deletion and interrupted recovery

Compact paths are known from the validated head, so deletion performs no collection enumeration.

1. Transition the head from `active` to `in_progress`.
2. Delete the revision.
3. Delete the capture session.
4. Delete the two or six observation documents.
5. Delete the head last and verify its absence.

Before publication, dependency-aware rules require the reverse of creation order: an observation cannot be deleted while its capture session exists, and a capture session cannot be deleted while its revision exists. This preserves the proof chain and still permits safe reverse-order cleanup. Once the head is `in_progress`, owner deletion can resume after interruption.

## 7. Read path

The viewer reads only the publication head and referenced revision. It strictly validates both documents, decodes all 101 frames from the revision payload, derives the five canonical anchors, and returns the existing `ShootingProfileViewerRecordV2`. A missing revision, wrong layout, wrong length, unknown key, non-PSD covariance, or identity mismatch fails closed.

List behavior remains head-only. Observation payloads are not needed for display and remain private evidence for later owner-controlled diagnostics or recomputation.

## 8. Verification and rollout gates

- Add behavior tests for exact offsets, 101-frame round trips, length/type/metadata corruption, covariance corruption, Basic/High write counts, head-last order, ambiguous cleanup, direct deletion, and strict viewer reconstruction.
- Add rules tests for exact schemas, owner isolation, evidence order, publication denial without a valid stored revision, active-head deletion denial, and resumable deletion. Static parser tests remain useful, but a real Firebase Emulator run is a release gate.
- Add clean GitHub pull-request CI pinned to Node 22 and pnpm 9.12.0 with a frozen install, typecheck, lint, hermetic Vitest suite, and Expo web export. The live Firebase configuration test remains a separate secret-gated integration check.
- Keep all three V2 flags off. No merge or rollout claim may be made until clean CI passes.
- A macOS/Xcode build, exact MediaPipe pod resolution, approved model artifact/hash/license, bundled resource verification, and the physical-iPhone acceptance matrix remain separate mandatory release gates.

## 9. Explicit non-goals

- This storage change does not improve the reconstruction algorithm's scientific validity.
- It does not convert normalized phase into simultaneous wall-clock time.
- It does not add reference-athlete comparison, sharing, or coaching recommendations.
- It does not activate any V2 feature flag.
- It does not claim native or Firebase production readiness without their external gates.
