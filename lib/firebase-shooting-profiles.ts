import type { User } from "firebase/auth";
import {
  Bytes,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Firestore,
  type Timestamp,
} from "firebase/firestore";

import { firestore } from "@/lib/firebase";
import {
  BINARY_PAYLOAD_FORMAT_V2,
  CANONICAL_PHASE_SUMMARIES_V2,
  FIXED_POINT_SCALE_V2,
  FRAME_CHUNK_COUNT_V2,
  MISSING_VISIBILITY_SENTINEL_V2,
  OBSERVATION_PAYLOAD_BYTE_LENGTH_V2,
  OBSERVATION_PAYLOAD_PACKING_ORDER_V2,
  PHASE_SAMPLE_COUNT_V2,
  REPRESENTATIVE_PAYLOAD_BYTE_LENGTH_V2,
  REPRESENTATIVE_PAYLOAD_PACKING_ORDER_V2,
  REPRESENTATIVE_SEQUENCE_CHUNK_COUNT_V2,
  RULE_SAFE_BATCH_MUTATIONS_V2,
  SHOOTING_PROFILE_ALGORITHM_VERSION_V2,
  SHOOTING_PROFILE_BOUNDARY_V2,
  SHOOTING_PROFILE_CONSENT_REFERENCE_V2,
  SHOOTING_PROFILE_DATA_CLASS_V2,
  SHOOTING_PROFILE_MODEL_VERSION_V2,
  SHOOTING_PROFILE_RETENTION_CLASS_V2,
  SHOOTING_PROFILE_SCHEMA_VERSION_V2,
  SHOOTING_PROFILE_TIME_BASIS_V2,
  buildRepresentativeSequenceChunksV2,
  chunkOrderedPhaseFramesV2,
  isOpaqueShootingProfileIdV2,
  quantizeShootingProfileNumberV2,
  reconstructRepresentativeFrameFromPayloadV2,
  serializeObservationForCloud,
  serializeRepresentativeProfileForCloud,
  validatePersistedObservationFrameV2,
  validatePersistedRepresentativeFrameV2,
  validateShootingProfileWriteV2,
  type SaveShootingProfileInputV2,
  type ShootingProfileViewerRecordV2,
} from "@/lib/firebase-shooting-profile-contract";
import { parseRepresentativePose4D } from "@/lib/shooting-profile/codec";
import type {
  CaptureProtocolV2,
  ReconstructionQualityV2,
  RepresentativePose4DV2,
  ShootingHandV2,
} from "@/lib/shooting-profile/types";

export type { SaveShootingProfileInputV2, ShootingProfileViewerRecordV2 } from "@/lib/firebase-shooting-profile-contract";

export type ShootingProfileSummaryV2 = {
  id: string;
  mode: CaptureProtocolV2;
  shootingHand: ShootingHandV2;
  confidence: number;
  createdAt: Timestamp;
};

export type PlannedFirestoreWriteV2 = {
  path: string;
  data: Record<string, unknown>;
};

export type PersistedDocumentV2 = {
  id: string;
  data: unknown;
};

export type ShootingProfileWritePlanV2 = {
  captureSessionId: string;
  profileId: string;
  revisionId: string;
  stagingWrites: PlannedFirestoreWriteV2[];
  publicationWrite: PlannedFirestoreWriteV2;
};

export type ShootingProfileDeletePlanV2 = {
  transitionRequired: boolean;
  deletePaths: string[];
  deleteBatches: string[][];
};

type UnknownRecord = Record<string, unknown>;

type CommonMetadataInputV2 = {
  uid: string;
  recordType: string;
  timestamp: unknown;
};

const COMMON_METADATA_KEYS_V2 = [
  "ownerUid",
  "schemaVersion",
  "boundary",
  "timeBasis",
  "dataClass",
  "retentionClass",
  "consentReference",
  "algorithmVersion",
  "modelVersion",
  "createdAt",
  "updatedAt",
] as const;

const PROFILE_HEAD_KEYS_V2 = [
  ...COMMON_METADATA_KEYS_V2,
  "recordType",
  "profileId",
  "captureSessionId",
  "revisionId",
  "status",
  "deletionState",
  "mode",
  "shootingHand",
  "confidence",
  "attemptIds",
  "attemptCount",
  "frameCount",
  "sequenceChunkCount",
  "phaseSummaryCount",
  "units",
] as const;

const REVISION_HEAD_KEYS_V2 = [
  ...COMMON_METADATA_KEYS_V2,
  "recordType",
  "profileId",
  "captureSessionId",
  "revisionId",
  "status",
  "mode",
  "shootingHand",
  "confidence",
  "attemptCount",
  "frameCount",
  "sequenceChunkCount",
  "phaseSummaryCount",
  "units",
  "quality",
] as const;

const SEQUENCE_CHUNK_KEYS_V2 = [
  ...COMMON_METADATA_KEYS_V2,
  "recordType",
  "profileId",
  "captureSessionId",
  "revisionId",
  "phaseIndex",
  "payloadFormat",
  "payloadByteLength",
  "fixedPointScale",
  "packingOrder",
  "units",
  "uncertaintyModel",
  "payload",
] as const;

const PHASE_SUMMARY_KEYS_V2 = [
  ...COMMON_METADATA_KEYS_V2,
  "recordType",
  "profileId",
  "captureSessionId",
  "revisionId",
  "phaseId",
  "phaseIndex",
] as const;

const OBSERVATION_HEAD_KEYS_V2 = [
  ...COMMON_METADATA_KEYS_V2,
  "recordType",
  "captureSessionId",
  "profileId",
  "revisionId",
  "attemptId",
  "status",
  "view",
  "shootingHand",
  "takeIndex",
  "frameCount",
  "frameChunkCount",
] as const;

const OBSERVATION_CHUNK_KEYS_V2 = [
  ...COMMON_METADATA_KEYS_V2,
  "recordType",
  "captureSessionId",
  "profileId",
  "revisionId",
  "attemptId",
  "view",
  "shootingHand",
  "takeIndex",
  "phaseIndex",
  "payloadFormat",
  "payloadByteLength",
  "fixedPointScale",
  "packingOrder",
  "missingVisibilitySentinel",
  "payload",
] as const;

const PUBLICATION_IDENTITY_KEYS_V2 = [
  "ownerUid",
  "schemaVersion",
  "boundary",
  "timeBasis",
  "dataClass",
  "retentionClass",
  "consentReference",
  "algorithmVersion",
  "modelVersion",
  "recordType",
  "profileId",
  "captureSessionId",
  "revisionId",
  "status",
  "deletionState",
  "mode",
  "shootingHand",
  "confidence",
  "attemptCount",
  "frameCount",
  "sequenceChunkCount",
  "phaseSummaryCount",
  "units",
] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, name: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`${name} must be an object`);
  return value;
}

function requireDocument(value: unknown, name: string): PersistedDocumentV2 {
  const document = requireRecord(value, name);
  assertExactKeys(document, ["id", "data"], name);
  if (typeof document.id !== "string" || document.id.length < 1 || document.id.length > 128) {
    throw new Error(`${name} document ID is invalid`);
  }
  return { id: document.id, data: document.data };
}

function assertExactKeys(value: UnknownRecord, keys: readonly string[], name: string): void {
  const allowed = new Set(keys);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !allowed.has(key))) {
    throw new Error(`${name} contains an unknown or missing key`);
  }
}

function requirePathSegment(value: unknown, name: string): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 128
    || value.includes("/")
    || value === "."
    || value === ".."
  ) {
    throw new Error(`${name} must be a bounded Firestore path segment`);
  }
  return value;
}

function requireOpaqueId(value: unknown, name: string): string {
  if (!isOpaqueShootingProfileIdV2(value)) throw new Error(`${name} must be a valid opaque ID`);
  return value;
}

function requireInteger(value: unknown, expected: number, name: string): void {
  if (value !== expected) throw new Error(`${name} must equal ${expected}`);
}

function requireTimestamp(value: unknown, name: string): void {
  if (!isRecord(value) || typeof value.toMillis !== "function" || typeof value.toDate !== "function") {
    throw new Error(`${name} must be a Firestore timestamp`);
  }
  const milliseconds = value.toMillis();
  const date = value.toDate();
  if (
    typeof milliseconds !== "number"
    || !Number.isFinite(milliseconds)
    || !(date instanceof Date)
    || !Number.isFinite(date.getTime())
  ) {
    throw new Error(`${name} must be a finite Firestore timestamp`);
  }
}

function requireQuantizedUnit(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be finite`);
  const quantized = quantizeShootingProfileNumberV2(value, 0, 1, name);
  if (quantized !== value) throw new Error(`${name} exceeds fixed precision`);
  return value;
}

function commonMetadata({ uid, recordType, timestamp }: CommonMetadataInputV2): UnknownRecord {
  return {
    ownerUid: uid,
    schemaVersion: SHOOTING_PROFILE_SCHEMA_VERSION_V2,
    boundary: SHOOTING_PROFILE_BOUNDARY_V2,
    timeBasis: SHOOTING_PROFILE_TIME_BASIS_V2,
    dataClass: SHOOTING_PROFILE_DATA_CLASS_V2,
    retentionClass: SHOOTING_PROFILE_RETENTION_CLASS_V2,
    consentReference: SHOOTING_PROFILE_CONSENT_REFERENCE_V2,
    algorithmVersion: SHOOTING_PROFILE_ALGORITHM_VERSION_V2,
    modelVersion: SHOOTING_PROFILE_MODEL_VERSION_V2,
    createdAt: timestamp,
    updatedAt: timestamp,
    recordType,
  };
}

function validateCommonMetadata(value: UnknownRecord, uid: string, recordType: string, name: string): void {
  if (
    value.ownerUid !== uid
    || value.schemaVersion !== SHOOTING_PROFILE_SCHEMA_VERSION_V2
    || value.boundary !== SHOOTING_PROFILE_BOUNDARY_V2
    || value.timeBasis !== SHOOTING_PROFILE_TIME_BASIS_V2
    || value.dataClass !== SHOOTING_PROFILE_DATA_CLASS_V2
    || value.retentionClass !== SHOOTING_PROFILE_RETENTION_CLASS_V2
    || value.consentReference !== SHOOTING_PROFILE_CONSENT_REFERENCE_V2
    || value.algorithmVersion !== SHOOTING_PROFILE_ALGORITHM_VERSION_V2
    || value.modelVersion !== SHOOTING_PROFILE_MODEL_VERSION_V2
    || value.recordType !== recordType
  ) {
    throw new Error(`${name} immutable owner metadata is invalid`);
  }
  requireTimestamp(value.createdAt, `${name}.createdAt`);
  requireTimestamp(value.updatedAt, `${name}.updatedAt`);
}

function canonicalAttemptOrder(input: SaveShootingProfileInputV2) {
  return [...input.normalizedAttempts].sort((left, right) => {
    const leftFrame = left.frames[0];
    const rightFrame = right.frames[0];
    const leftView = leftFrame.view === "front" ? 0 : 1;
    const rightView = rightFrame.view === "front" ? 0 : 1;
    return leftView - rightView || leftFrame.takeIndex - rightFrame.takeIndex;
  });
}

function profileBasePath(uid: string, profileId: string): string {
  return `users/${uid}/motionProfiles/${profileId}`;
}

function revisionBasePath(uid: string, profileId: string, revisionId: string): string {
  return `${profileBasePath(uid, profileId)}/revisions/${revisionId}`;
}

function captureBasePath(uid: string, captureSessionId: string): string {
  return `users/${uid}/captureSessions/${captureSessionId}`;
}

export function buildShootingProfileWritePlanV2(args: {
  uid: string;
  captureSessionId: string;
  profileId: string;
  revisionId: string;
  input: SaveShootingProfileInputV2;
  timestamp: unknown;
}): ShootingProfileWritePlanV2 {
  const uid = requirePathSegment(args.uid, "owner UID");
  const captureSessionId = requireOpaqueId(args.captureSessionId, "capture session ID");
  const profileId = requireOpaqueId(args.profileId, "profile ID");
  const revisionId = requireOpaqueId(args.revisionId, "revision ID");
  const input = validateShootingProfileWriteV2(args.input);
  const timestamp = args.timestamp;
  const representative = serializeRepresentativeProfileForCloud(input.profile);
  const attempts = canonicalAttemptOrder(input).map(serializeObservationForCloud);
  const attemptIds = attempts.map((attempt) => attempt.attemptId);
  const confidence = quantizeShootingProfileNumberV2(input.confidence, 0, 1, "confidence");
  const capturePath = captureBasePath(uid, captureSessionId);
  const profilePath = profileBasePath(uid, profileId);
  const revisionPath = revisionBasePath(uid, profileId, revisionId);
  const stagingWrites: PlannedFirestoreWriteV2[] = [];

  for (const attempt of attempts) {
    const observationPath = `${capturePath}/observations/${attempt.attemptId}`;
    for (const chunk of chunkOrderedPhaseFramesV2(attempt.frames)) {
      stagingWrites.push({
        path: `${observationPath}/frameChunks/${chunk.documentId}`,
        data: {
          ...commonMetadata({ uid, recordType: "observation_frame_chunk_v2", timestamp }),
          captureSessionId,
          profileId,
          revisionId,
          attemptId: attempt.attemptId,
          view: attempt.view,
          shootingHand: attempt.shootingHand,
          takeIndex: attempt.takeIndex,
          phaseIndex: chunk.phaseIndex,
          payloadFormat: BINARY_PAYLOAD_FORMAT_V2,
          payloadByteLength: OBSERVATION_PAYLOAD_BYTE_LENGTH_V2,
          fixedPointScale: FIXED_POINT_SCALE_V2,
          packingOrder: OBSERVATION_PAYLOAD_PACKING_ORDER_V2,
          missingVisibilitySentinel: MISSING_VISIBILITY_SENTINEL_V2,
          payload: Bytes.fromUint8Array(chunk.frame.payload),
        },
      });
    }
  }

  for (const attempt of attempts) {
    stagingWrites.push({
      path: `${capturePath}/observations/${attempt.attemptId}`,
      data: {
        ...commonMetadata({ uid, recordType: "normalized_observation_v2", timestamp }),
        captureSessionId,
        profileId,
        revisionId,
        attemptId: attempt.attemptId,
        status: "complete",
        view: attempt.view,
        shootingHand: attempt.shootingHand,
        takeIndex: attempt.takeIndex,
        frameCount: PHASE_SAMPLE_COUNT_V2,
        frameChunkCount: FRAME_CHUNK_COUNT_V2,
      },
    });
  }

  stagingWrites.push({
    path: capturePath,
    data: {
      ...commonMetadata({ uid, recordType: "capture_session_v2", timestamp }),
      captureSessionId,
      profileId,
      revisionId,
      status: "complete",
      mode: input.profile.mode,
      shootingHand: input.shootingHand,
      attemptIds,
      attemptCount: attemptIds.length,
    },
  });

  for (const chunk of buildRepresentativeSequenceChunksV2(representative.frames)) {
    stagingWrites.push({
      path: `${revisionPath}/sequenceChunks/${chunk.documentId}`,
      data: {
        ...commonMetadata({ uid, recordType: "representative_phase_chunk_v2", timestamp }),
        profileId,
        captureSessionId,
        revisionId,
        phaseIndex: chunk.phaseIndex,
        payloadFormat: chunk.payloadFormat,
        payloadByteLength: chunk.payloadByteLength,
        fixedPointScale: chunk.fixedPointScale,
        packingOrder: chunk.packingOrder,
        units: "template_shoulder_breadths",
        uncertaintyModel: chunk.uncertaintyModel,
        payload: Bytes.fromUint8Array(chunk.payload),
      },
    });
  }

  for (const summary of representative.phaseSummaries) {
    stagingWrites.push({
      path: `${revisionPath}/phaseSummaries/${summary.id}`,
      data: {
        ...commonMetadata({ uid, recordType: "representative_phase_summary_v2", timestamp }),
        profileId,
        captureSessionId,
        revisionId,
        phaseId: summary.id,
        phaseIndex: summary.phaseIndex,
      },
    });
  }

  stagingWrites.push({
    path: revisionPath,
    data: {
      ...commonMetadata({ uid, recordType: "representative_revision_v2", timestamp }),
      profileId,
      captureSessionId,
      revisionId,
      status: "complete",
      mode: input.profile.mode,
      shootingHand: input.shootingHand,
      confidence,
      attemptCount: attemptIds.length,
      frameCount: PHASE_SAMPLE_COUNT_V2,
      sequenceChunkCount: REPRESENTATIVE_SEQUENCE_CHUNK_COUNT_V2,
      phaseSummaryCount: CANONICAL_PHASE_SUMMARIES_V2.length,
      units: "template_shoulder_breadths",
      quality: representative.quality,
    },
  });

  const publicationWrite: PlannedFirestoreWriteV2 = {
    path: profilePath,
    data: {
      ...commonMetadata({ uid, recordType: "motion_profile_v2", timestamp }),
      profileId,
      captureSessionId,
      revisionId,
      status: "complete",
      deletionState: "active",
      mode: input.profile.mode,
      shootingHand: input.shootingHand,
      confidence,
      attemptIds,
      attemptCount: attemptIds.length,
      frameCount: PHASE_SAMPLE_COUNT_V2,
      sequenceChunkCount: REPRESENTATIVE_SEQUENCE_CHUNK_COUNT_V2,
      phaseSummaryCount: CANONICAL_PHASE_SUMMARIES_V2.length,
      units: "template_shoulder_breadths",
    },
  };

  return { captureSessionId, profileId, revisionId, stagingWrites, publicationWrite };
}

export function partitionShootingProfileWritesV2<T>(
  writes: readonly T[],
  maximum = RULE_SAFE_BATCH_MUTATIONS_V2,
): T[][] {
  if (!Number.isInteger(maximum) || maximum !== RULE_SAFE_BATCH_MUTATIONS_V2) {
    throw new Error("V2 Firestore rule-safe batches must contain exactly one mutation");
  }
  const batches: T[][] = [];
  for (let index = 0; index < writes.length; index += maximum) {
    batches.push(writes.slice(index, index + maximum));
  }
  return batches;
}

function strictSerializableEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Bytes || right instanceof Bytes) {
    return left instanceof Bytes && right instanceof Bytes && left.isEqual(right);
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((entry, index) => strictSerializableEqual(entry, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && strictSerializableEqual(left[key], right[key]));
}

export function matchesPlannedStagingWriteV2(observedValue: unknown, plannedValue: unknown): boolean {
  const observed = requireRecord(observedValue, "observed staging document");
  const planned = requireRecord(plannedValue, "planned staging document");
  if (
    !("createdAt" in observed)
    || !("updatedAt" in observed)
    || !("createdAt" in planned)
    || !("updatedAt" in planned)
  ) {
    return false;
  }
  try {
    requireTimestamp(observed.createdAt, "observed staging document.createdAt");
    requireTimestamp(observed.updatedAt, "observed staging document.updatedAt");
  } catch {
    return false;
  }
  const withoutServerTimestamps = (value: UnknownRecord): UnknownRecord => Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "createdAt" && key !== "updatedAt"),
  );
  return strictSerializableEqual(withoutServerTimestamps(observed), withoutServerTimestamps(planned));
}

export type KnownPathCleanupResultV2 = {
  attemptedPaths: string[];
  failures: Array<{ path: string; error: unknown }>;
};

export async function attemptKnownSinglePathCleanupV2(
  paths: readonly string[],
  deletePath: (path: string) => Promise<void>,
): Promise<KnownPathCleanupResultV2> {
  const uniquePaths = [...new Set(paths)];
  const failures: KnownPathCleanupResultV2["failures"] = [];
  for (const path of uniquePaths) {
    try {
      await deletePath(path);
    } catch (error) {
      failures.push({ path, error });
    }
  }
  return { attemptedPaths: uniquePaths, failures };
}

export async function deleteSubordinateWithAmbiguityCheckV2(args: {
  commitDelete: () => Promise<void>;
  readExistsFromServer: () => Promise<boolean>;
}): Promise<void> {
  try {
    await args.commitDelete();
  } catch (error) {
    try {
      if (!(await args.readExistsFromServer())) return;
    } catch {
      // The subordinate state remains unknown, so preserve the commit error.
    }
    throw error;
  }
}

export async function deleteHeadWithPostconditionV2(args: {
  commitDelete: () => Promise<void>;
  readExistsFromServer: () => Promise<boolean>;
}): Promise<void> {
  try {
    await args.commitDelete();
  } catch (error) {
    try {
      if (!(await args.readExistsFromServer())) return;
    } catch {
      // The server state remains unknown, so preserve the original commit error.
    }
    throw error;
  }
  if (await args.readExistsFromServer()) {
    throw new Error("motion profile deletion postcondition did not remove the owner head");
  }
}

function validateMode(value: unknown, name: string): CaptureProtocolV2 {
  if (value !== "basic_1_plus_1" && value !== "high_accuracy_3_plus_3") {
    throw new Error(`${name} mode is invalid`);
  }
  return value;
}

function validateHand(value: unknown, name: string): ShootingHandV2 {
  if (value !== "left" && value !== "right") throw new Error(`${name} shooting hand is invalid`);
  return value;
}

function requireBoundedInteger(value: unknown, minimum: number, maximum: number, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a bounded integer`);
  }
  return value;
}

function expectedAttemptIdentity(attemptId: string): {
  view: "front" | "shooting_side";
  takeIndex: 0 | 1 | 2;
} {
  const match = /^(front|shooting_side)-([0-2])$/.exec(attemptId);
  if (!match) throw new Error("attempt ID must encode its canonical view and take");
  return {
    view: match[1] as "front" | "shooting_side",
    takeIndex: Number(match[2]) as 0 | 1 | 2,
  };
}

export type ObservationDocumentContextV2 = {
  uid: string;
  captureSessionId: string;
  profileId: string;
  revisionId: string;
  attemptId: string;
  document: PersistedDocumentV2;
};

function validateObservationDocumentContext(
  data: UnknownRecord,
  args: ObservationDocumentContextV2,
  name: string,
): { view: "front" | "shooting_side"; takeIndex: 0 | 1 | 2 } {
  const uid = requirePathSegment(args.uid, "owner UID");
  const captureSessionId = requireOpaqueId(args.captureSessionId, "capture session ID");
  const profileId = requireOpaqueId(args.profileId, "profile ID");
  const revisionId = requireOpaqueId(args.revisionId, "revision ID");
  const attemptId = requireOpaqueId(args.attemptId, "attempt ID");
  const identity = expectedAttemptIdentity(attemptId);
  if (
    data.ownerUid !== uid
    || data.captureSessionId !== captureSessionId
    || data.profileId !== profileId
    || data.revisionId !== revisionId
    || data.attemptId !== attemptId
    || data.view !== identity.view
    || data.takeIndex !== identity.takeIndex
  ) {
    throw new Error(`${name} path context is invalid`);
  }
  validateHand(data.shootingHand, name);
  return identity;
}

export function validateObservationHeadDocumentV2(args: ObservationDocumentContextV2): void {
  const document = requireDocument(args.document, "observation head document");
  if (document.id !== args.attemptId) throw new Error("observation attempt document ID must equal attemptId");
  const data = requireRecord(document.data, "observation head");
  assertExactKeys(data, OBSERVATION_HEAD_KEYS_V2, "observation head");
  validateCommonMetadata(data, args.uid, "normalized_observation_v2", "observation head");
  validateObservationDocumentContext(data, args, "observation head");
  if (data.status !== "complete") throw new Error("observation head must be complete");
  requireInteger(data.frameCount, PHASE_SAMPLE_COUNT_V2, "observation frame count");
  requireInteger(data.frameChunkCount, FRAME_CHUNK_COUNT_V2, "observation chunk count");
}

export function validateObservationChunkDocumentV2(args: ObservationDocumentContextV2): void {
  const document = requireDocument(args.document, "observation chunk document");
  const data = requireRecord(document.data, "observation chunk");
  assertExactKeys(data, OBSERVATION_CHUNK_KEYS_V2, "observation chunk");
  validateCommonMetadata(data, args.uid, "observation_frame_chunk_v2", "observation chunk");
  validateObservationDocumentContext(data, args, "observation chunk");
  if (
    data.payloadFormat !== BINARY_PAYLOAD_FORMAT_V2
    || data.payloadByteLength !== OBSERVATION_PAYLOAD_BYTE_LENGTH_V2
    || data.fixedPointScale !== FIXED_POINT_SCALE_V2
    || data.packingOrder !== OBSERVATION_PAYLOAD_PACKING_ORDER_V2
    || data.missingVisibilitySentinel !== MISSING_VISIBILITY_SENTINEL_V2
    || !(data.payload instanceof Bytes)
  ) {
    throw new Error("observation chunk Firestore Bytes payload metadata is invalid");
  }
  const frame = validatePersistedObservationFrameV2({
    phaseIndex: data.phaseIndex,
    payload: data.payload.toUint8Array(),
  });
  if (document.id !== String(frame.phaseIndex)) {
    throw new Error("observation chunk document ID must equal its canonical nonpadded phase index");
  }
}

function validateModeConfidence(mode: CaptureProtocolV2, value: unknown, name: string): number {
  const confidence = requireQuantizedUnit(value, `${name} confidence`);
  if (mode === "basic_1_plus_1" && confidence > 0.65) {
    throw new Error(`${name} Basic confidence must not exceed 0.65`);
  }
  return confidence;
}

function validateAttemptIds(value: unknown, mode: CaptureProtocolV2, name: string): string[] {
  const expected = mode === "basic_1_plus_1"
    ? ["front-0", "shooting_side-0"]
    : ["front-0", "front-1", "front-2", "shooting_side-0", "shooting_side-1", "shooting_side-2"];
  if (!Array.isArray(value) || value.length !== expected.length) throw new Error(`${name} attempt IDs are incomplete`);
  const ids = value.map((id, index) => requireOpaqueId(id, `${name} attempt ID ${index}`));
  if (ids.some((id, index) => id !== expected[index])) {
    throw new Error(`${name} must contain the canonical attempt IDs in order`);
  }
  return ids;
}

function validateProfileHead(
  value: unknown,
  uid: string,
  profileId: string,
  requiredState?: "active" | "in_progress",
): UnknownRecord {
  const head = requireRecord(value, "motion profile head");
  assertExactKeys(head, PROFILE_HEAD_KEYS_V2, "motion profile head");
  validateCommonMetadata(head, uid, "motion_profile_v2", "motion profile head");
  if (
    head.profileId !== profileId
    || head.captureSessionId !== requireOpaqueId(head.captureSessionId, "capture session ID")
    || head.revisionId !== requireOpaqueId(head.revisionId, "revision ID")
    || head.status !== "complete"
    || head.units !== "template_shoulder_breadths"
  ) {
    throw new Error("motion profile head path IDs or immutable fields are invalid");
  }
  if (head.deletionState !== "active" && head.deletionState !== "in_progress") {
    throw new Error("motion profile head deletion state is invalid");
  }
  if (requiredState !== undefined && head.deletionState !== requiredState) {
    throw new Error(`motion profile head must be ${requiredState}`);
  }
  const mode = validateMode(head.mode, "motion profile head");
  validateHand(head.shootingHand, "motion profile head");
  validateModeConfidence(mode, head.confidence, "motion profile head");
  const attemptIds = validateAttemptIds(head.attemptIds, mode, "motion profile head");
  requireInteger(head.attemptCount, attemptIds.length, "motion profile head attempt count");
  requireInteger(head.frameCount, PHASE_SAMPLE_COUNT_V2, "motion profile head frame count");
  requireInteger(
    head.sequenceChunkCount,
    REPRESENTATIVE_SEQUENCE_CHUNK_COUNT_V2,
    "motion profile head sequence chunk count",
  );
  requireInteger(head.phaseSummaryCount, CANONICAL_PHASE_SUMMARIES_V2.length, "motion profile head phase summary count");
  return head;
}

function validateProfileHeadDocument(
  value: unknown,
  uid: string,
  profileId: string,
  requiredState?: "active" | "in_progress",
): UnknownRecord {
  const document = requireDocument(value, "motion profile document");
  if (document.id !== profileId) throw new Error("motion profile document ID must equal profileId");
  return validateProfileHead(document.data, uid, profileId, requiredState);
}

export function validateShootingProfilePublicationIdentityV2(
  persistedValue: unknown,
  plannedValue: unknown,
): void {
  const persisted = requireRecord(persistedValue, "persisted publication head");
  const planned = requireRecord(plannedValue, "planned publication head");
  if (PUBLICATION_IDENTITY_KEYS_V2.some((key) => persisted[key] !== planned[key])) {
    throw new Error("persisted publication identity does not match this write plan");
  }
  if (
    !Array.isArray(persisted.attemptIds)
    || !Array.isArray(planned.attemptIds)
    || persisted.attemptIds.length !== planned.attemptIds.length
    || persisted.attemptIds.some((attemptId, index) => attemptId !== planned.attemptIds[index])
  ) {
    throw new Error("persisted publication identity does not match this write plan");
  }
}

function validateQuality(value: unknown): ReconstructionQualityV2 {
  const quality = requireRecord(value, "revision quality");
  assertExactKeys(quality, ["passed", "reasons"], "revision quality");
  if (quality.passed !== true || !Array.isArray(quality.reasons) || quality.reasons.length !== 0) {
    throw new Error("completed revision quality must be passed with empty reasons");
  }
  return { passed: true, reasons: [] };
}

function validateRevisionHead(value: unknown, uid: string, profileHead: UnknownRecord): UnknownRecord {
  const document = requireDocument(value, "representative revision document");
  if (document.id !== profileHead.revisionId) {
    throw new Error("representative revision document ID must equal revisionId");
  }
  const revision = requireRecord(document.data, "representative revision");
  assertExactKeys(revision, REVISION_HEAD_KEYS_V2, "representative revision");
  validateCommonMetadata(revision, uid, "representative_revision_v2", "representative revision");
  const mode = validateMode(revision.mode, "representative revision");
  validateHand(revision.shootingHand, "representative revision");
  validateModeConfidence(mode, revision.confidence, "representative revision");
  if (
    revision.profileId !== profileHead.profileId
    || revision.captureSessionId !== profileHead.captureSessionId
    || revision.revisionId !== profileHead.revisionId
    || revision.status !== "complete"
    || revision.mode !== profileHead.mode
    || revision.shootingHand !== profileHead.shootingHand
    || revision.confidence !== profileHead.confidence
    || revision.units !== "template_shoulder_breadths"
  ) {
    throw new Error("representative revision does not match its profile head");
  }
  requireInteger(revision.attemptCount, profileHead.attemptCount as number, "revision attempt count");
  requireInteger(revision.frameCount, PHASE_SAMPLE_COUNT_V2, "revision frame count");
  requireInteger(
    revision.sequenceChunkCount,
    REPRESENTATIVE_SEQUENCE_CHUNK_COUNT_V2,
    "revision sequence chunk count",
  );
  requireInteger(revision.phaseSummaryCount, CANONICAL_PHASE_SUMMARIES_V2.length, "revision phase summary count");
  validateQuality(revision.quality);
  return revision;
}

function validateSequenceChunks(
  values: readonly unknown[],
  uid: string,
  profileHead: UnknownRecord,
): RepresentativePose4DV2["frames"] {
  if (values.length !== REPRESENTATIVE_SEQUENCE_CHUNK_COUNT_V2) {
    throw new Error("representative sequence chunk count is incomplete or extra");
  }
  const frames = new Map<number, RepresentativePose4DV2["frames"][number]>();
  values.forEach((value) => {
    const document = requireDocument(value, "representative sequence chunk document");
    const chunk = requireRecord(document.data, "representative sequence chunk");
    assertExactKeys(chunk, SEQUENCE_CHUNK_KEYS_V2, "representative sequence chunk");
    validateCommonMetadata(
      chunk,
      uid,
      "representative_phase_chunk_v2",
      "representative sequence chunk",
    );
    if (
      chunk.profileId !== profileHead.profileId
      || chunk.captureSessionId !== profileHead.captureSessionId
      || chunk.revisionId !== profileHead.revisionId
      || chunk.units !== "template_shoulder_breadths"
      || chunk.payloadFormat !== BINARY_PAYLOAD_FORMAT_V2
      || chunk.payloadByteLength !== REPRESENTATIVE_PAYLOAD_BYTE_LENGTH_V2
      || chunk.fixedPointScale !== FIXED_POINT_SCALE_V2
      || chunk.packingOrder !== REPRESENTATIVE_PAYLOAD_PACKING_ORDER_V2
      || chunk.uncertaintyModel !== "heuristic_v1"
      || !(chunk.payload instanceof Bytes)
    ) {
      throw new Error("representative sequence Firestore Bytes payload metadata or path IDs are invalid");
    }
    const phaseIndex = requireBoundedInteger(chunk.phaseIndex, 0, 100, "representative phase index");
    if (document.id !== String(phaseIndex)) {
      throw new Error("representative chunk document ID is not canonical");
    }
    const packedFrame = validatePersistedRepresentativeFrameV2({
      phaseIndex,
      uncertaintyModel: chunk.uncertaintyModel,
      payload: chunk.payload.toUint8Array(),
    });
    if (frames.has(phaseIndex)) throw new Error("representative sequence contains a duplicate phase chunk");
    frames.set(phaseIndex, reconstructRepresentativeFrameFromPayloadV2(packedFrame));
  });
  return Array.from({ length: PHASE_SAMPLE_COUNT_V2 }, (_, phaseIndex) => {
    const frame = frames.get(phaseIndex);
    if (!frame) throw new Error("representative sequence phase chunk is missing");
    return frame;
  });
}

function validatePhaseSummaries(values: readonly unknown[], uid: string, profileHead: UnknownRecord) {
  if (values.length !== CANONICAL_PHASE_SUMMARIES_V2.length) {
    throw new Error("representative phase summaries are incomplete or extra");
  }
  const summaries = values.map((value) => {
    const document = requireDocument(value, "representative phase summary document");
    const summary = requireRecord(document.data, "representative phase summary");
    assertExactKeys(summary, PHASE_SUMMARY_KEYS_V2, "representative phase summary");
    validateCommonMetadata(summary, uid, "representative_phase_summary_v2", "representative phase summary");
    if (
      summary.profileId !== profileHead.profileId
      || summary.captureSessionId !== profileHead.captureSessionId
      || summary.revisionId !== profileHead.revisionId
    ) {
      throw new Error("representative phase summary path IDs are invalid");
    }
    const canonical = CANONICAL_PHASE_SUMMARIES_V2.find((entry) => entry.id === summary.phaseId);
    if (document.id !== summary.phaseId) {
      throw new Error("representative summary document ID must equal phaseId");
    }
    if (!canonical || summary.phaseIndex !== canonical.phaseIndex) {
      throw new Error("representative phase summary is not canonical");
    }
    return canonical;
  });
  if (new Set(summaries.map((summary) => summary.id)).size !== CANONICAL_PHASE_SUMMARIES_V2.length) {
    throw new Error("representative phase summaries contain duplicates");
  }
  return CANONICAL_PHASE_SUMMARIES_V2.map((canonical) => {
    if (!summaries.some((summary) => summary.id === canonical.id)) {
      throw new Error("representative phase summary is missing");
    }
    return { id: canonical.id, phase: canonical.phase };
  });
}

export function reconstructShootingProfileViewerRecordV2(args: {
  uid: string;
  profileId: string;
  head: PersistedDocumentV2;
  revision: PersistedDocumentV2;
  sequenceChunks: readonly PersistedDocumentV2[];
  phaseSummaries: readonly PersistedDocumentV2[];
}): ShootingProfileViewerRecordV2 {
  const uid = requirePathSegment(args.uid, "owner UID");
  const profileId = requireOpaqueId(args.profileId, "profile ID");
  const head = validateProfileHeadDocument(args.head, uid, profileId, "active");
  const revision = validateRevisionHead(args.revision, uid, head);
  const frames = validateSequenceChunks(args.sequenceChunks, uid, head);
  if (frames.length !== PHASE_SAMPLE_COUNT_V2) throw new Error("representative sequence must contain exactly 101 frames");
  const phaseAnchors = validatePhaseSummaries(args.phaseSummaries, uid, head);
  const profile = parseRepresentativePose4D({
    schemaVersion: SHOOTING_PROFILE_SCHEMA_VERSION_V2,
    boundary: SHOOTING_PROFILE_BOUNDARY_V2,
    mode: head.mode,
    timeBasis: SHOOTING_PROFILE_TIME_BASIS_V2,
    units: "template_shoulder_breadths",
    frames: frames.map((frame) => ({
      phase: frame.phase,
      joints: frame.joints,
      uncertainty: frame.uncertainty,
    })),
    phaseAnchors,
    quality: validateQuality(revision.quality),
  });
  serializeRepresentativeProfileForCloud(profile);
  return {
    profile,
    shootingHand: validateHand(head.shootingHand, "motion profile head"),
    confidence: validateModeConfidence(
      validateMode(head.mode, "motion profile head"),
      head.confidence,
      "motion profile head",
    ),
  };
}

export function buildShootingProfileDeletePlanV2(args: {
  deletionState: "active" | "in_progress";
  headPath: string;
  subordinatePaths: readonly string[];
}): ShootingProfileDeletePlanV2 {
  if (args.deletionState !== "active" && args.deletionState !== "in_progress") {
    throw new Error("deletion state must be active or in_progress");
  }
  if (!args.headPath || args.headPath.startsWith("/") || args.headPath.endsWith("/")) {
    throw new Error("profile head path is invalid");
  }
  const seen = new Set<string>();
  const subordinatePaths = args.subordinatePaths.map((path) => {
    if (!path || path === args.headPath || path.startsWith("/") || path.endsWith("/") || seen.has(path)) {
      throw new Error("subordinate deletion paths must be unique and exclude the head");
    }
    seen.add(path);
    return path;
  });
  const subordinateBatches = partitionShootingProfileWritesV2(subordinatePaths);
  return {
    transitionRequired: args.deletionState === "active",
    deletePaths: [...subordinatePaths, args.headPath],
    deleteBatches: [...subordinateBatches, [args.headPath]],
  };
}

export function selectPendingDeletionProfileIdsV2(
  uid: string,
  entries: readonly { id: string; data: unknown }[],
): string[] {
  const ownerUid = requirePathSegment(uid, "owner UID");
  const ids: string[] = [];
  for (const entry of entries) {
    if (!isRecord(entry.data) || entry.data.deletionState !== "in_progress") continue;
    const profileId = requireOpaqueId(entry.id, "profile ID");
    validateProfileHeadDocument(entry, ownerUid, profileId, "in_progress");
    ids.push(profileId);
  }
  if (new Set(ids).size !== ids.length) throw new Error("pending deletion profile IDs contain duplicates");
  return ids.sort();
}

function requireFirestore(): Firestore {
  if (!firestore) throw new Error("Firebase Firestore 연결 설정이 아직 완료되지 않았습니다.");
  return firestore;
}

async function commitSetBatches(db: Firestore, batches: readonly PlannedFirestoreWriteV2[][]): Promise<void> {
  for (const writes of batches) {
    const batch = writeBatch(db);
    writes.forEach((write) => batch.set(doc(db, write.path), write.data));
    await batch.commit();
  }
}

async function bestEffortDeleteKnownPaths(db: Firestore, paths: readonly string[]): Promise<void> {
  await attemptKnownSinglePathCleanupV2([...new Set(paths)].reverse(), async (path) => {
    const batch = writeBatch(db);
    batch.delete(doc(db, path));
    await batch.commit();
  });
}

export async function saveShootingProfileV2(user: User, input: SaveShootingProfileInputV2): Promise<string> {
  const db = requireFirestore();
  const uid = requirePathSegment(user.uid, "owner UID");
  const captureSessionId = doc(collection(db, "users", uid, "captureSessions")).id;
  const profileId = doc(collection(db, "users", uid, "motionProfiles")).id;
  const revisionId = doc(collection(db, "users", uid, "motionProfiles", profileId, "revisions")).id;
  requireOpaqueId(captureSessionId, "generated capture session ID");
  requireOpaqueId(profileId, "generated profile ID");
  requireOpaqueId(revisionId, "generated revision ID");

  const plan = buildShootingProfileWritePlanV2({
    uid,
    captureSessionId,
    profileId,
    revisionId,
    input,
    timestamp: serverTimestamp(),
  });
  const stagingBatches = partitionShootingProfileWritesV2(plan.stagingWrites);
  const acknowledgedStagingPaths: string[] = [];
  for (const batchWrites of stagingBatches) {
    const write = batchWrites[0];
    if (!write) {
      throw new Error("V2 staging batch must contain exactly one write");
    }
    try {
      await commitSetBatches(db, [batchWrites]);
      acknowledgedStagingPaths.push(write.path);
    } catch (error) {
      try {
        const observed = await getDocFromServer(doc(db, write.path));
        if (observed.exists() && matchesPlannedStagingWriteV2(observed.data(), write.data)) {
          acknowledgedStagingPaths.push(write.path);
        }
      } catch {
        // Only acknowledged or server-observed staging paths are cleanup candidates.
      }
      await bestEffortDeleteKnownPaths(db, acknowledgedStagingPaths);
      throw error;
    }
  }

  try {
    await commitSetBatches(db, [[plan.publicationWrite]]);
  } catch (error) {
    try {
      const published = await getDocFromServer(doc(db, plan.publicationWrite.path));
      if (published.exists()) {
        const publishedHead = validateProfileHeadDocument(
          { id: published.id, data: published.data() },
          uid,
          profileId,
          "active",
        );
        validateShootingProfilePublicationIdentityV2(publishedHead, plan.publicationWrite.data);
        return profileId;
      }
      await bestEffortDeleteKnownPaths(db, plan.stagingWrites.map((write) => write.path));
    } catch {
      // Publication state is unknown. Do not delete subordinate evidence that
      // a possibly-published owner head may reference.
    }
    throw error;
  }
  return profileId;
}

function timestampMillis(value: unknown): number {
  return isRecord(value) && typeof value.toMillis === "function" ? Number(value.toMillis()) : 0;
}

export async function listShootingProfilesV2(user: User): Promise<ShootingProfileSummaryV2[]> {
  const db = requireFirestore();
  const uid = requirePathSegment(user.uid, "owner UID");
  const result = await getDocs(collection(db, "users", uid, "motionProfiles"));
  const summaries: ShootingProfileSummaryV2[] = [];
  for (const snapshot of result.docs) {
    const raw = snapshot.data();
    if (raw.status !== "complete" || raw.deletionState !== "active") continue;
    try {
      const head = validateProfileHeadDocument({ id: snapshot.id, data: raw }, uid, snapshot.id, "active");
      summaries.push({
        id: snapshot.id,
        mode: validateMode(head.mode, "motion profile head"),
        shootingHand: validateHand(head.shootingHand, "motion profile head"),
        confidence: validateModeConfidence(
          validateMode(head.mode, "motion profile head"),
          head.confidence,
          "motion profile head",
        ),
        createdAt: head.createdAt as Timestamp,
      });
    } catch {
      // Fail closed: malformed owner documents are never exposed to the UI.
    }
  }
  return summaries.sort((left, right) => timestampMillis(right.createdAt) - timestampMillis(left.createdAt));
}

export async function getShootingProfileV2(
  user: User,
  profileId: string,
): Promise<ShootingProfileViewerRecordV2 | null> {
  const db = requireFirestore();
  const uid = requirePathSegment(user.uid, "owner UID");
  requireOpaqueId(profileId, "profile ID");
  const profilePath = profileBasePath(uid, profileId);
  const headSnapshot = await getDoc(doc(db, profilePath));
  if (!headSnapshot.exists()) return null;
  const headDocument = { id: headSnapshot.id, data: headSnapshot.data() };
  const head = validateProfileHeadDocument(headDocument, uid, profileId, "active");
  const revisionId = head.revisionId as string;
  const revisionPath = revisionBasePath(uid, profileId, revisionId);
  const [revisionSnapshot, sequenceResult, phaseResult] = await Promise.all([
    getDoc(doc(db, revisionPath)),
    getDocs(collection(db, revisionPath, "sequenceChunks")),
    getDocs(collection(db, revisionPath, "phaseSummaries")),
  ]);
  if (!revisionSnapshot.exists()) throw new Error("completed representative revision is missing");
  return reconstructShootingProfileViewerRecordV2({
    uid,
    profileId,
    head: headDocument,
    revision: { id: revisionSnapshot.id, data: revisionSnapshot.data() },
    sequenceChunks: sequenceResult.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() })),
    phaseSummaries: phaseResult.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() })),
  });
}

async function enumerateDeletionSubordinatePaths(
  db: Firestore,
  uid: string,
  profileId: string,
  head: UnknownRecord,
): Promise<string[]> {
  const revisionId = head.revisionId as string;
  const captureSessionId = head.captureSessionId as string;
  const revisionPath = revisionBasePath(uid, profileId, revisionId);
  const capturePath = captureBasePath(uid, captureSessionId);
  const [sequenceResult, phaseResult] = await Promise.all([
    getDocsFromServer(collection(db, revisionPath, "sequenceChunks")),
    getDocsFromServer(collection(db, revisionPath, "phaseSummaries")),
  ]);
  const paths = [
    ...sequenceResult.docs.map((snapshot) => `${revisionPath}/sequenceChunks/${snapshot.id}`),
    ...phaseResult.docs.map((snapshot) => `${revisionPath}/phaseSummaries/${snapshot.id}`),
    revisionPath,
  ];
  const attemptIds = validateAttemptIds(head.attemptIds, validateMode(head.mode, "motion profile head"), "motion profile head");
  for (const attemptId of attemptIds) {
    const observationPath = `${capturePath}/observations/${attemptId}`;
    const frameChunks = await getDocsFromServer(collection(db, observationPath, "frameChunks"));
    paths.push(...frameChunks.docs.map((snapshot) => `${observationPath}/frameChunks/${snapshot.id}`));
    paths.push(observationPath);
  }
  paths.push(capturePath);
  return paths;
}

async function commitDeleteBatch(db: Firestore, paths: readonly string[]): Promise<void> {
  const batch = writeBatch(db);
  paths.forEach((path) => batch.delete(doc(db, path)));
  await batch.commit();
}

export async function deleteShootingProfileV2(user: User, profileId: string): Promise<void> {
  const db = requireFirestore();
  const uid = requirePathSegment(user.uid, "owner UID");
  requireOpaqueId(profileId, "profile ID");
  const headPath = profileBasePath(uid, profileId);
  const headReference = doc(db, headPath);
  const initialSnapshot = await getDocFromServer(headReference);
  if (!initialSnapshot.exists()) return;
  const initialHead = validateProfileHeadDocument(
    { id: initialSnapshot.id, data: initialSnapshot.data() },
    uid,
    profileId,
  );
  const deletionState = initialHead.deletionState as "active" | "in_progress";
  if (deletionState === "active") {
    await updateDoc(headReference, { deletionState: "in_progress", updatedAt: serverTimestamp() });
  }
  const subordinatePaths = await enumerateDeletionSubordinatePaths(db, uid, profileId, initialHead);
  const plan = buildShootingProfileDeletePlanV2({ deletionState, headPath, subordinatePaths });
  const subordinateResult = await attemptKnownSinglePathCleanupV2(
    plan.deletePaths.slice(0, -1),
    async (path) => deleteSubordinateWithAmbiguityCheckV2({
      commitDelete: async () => commitDeleteBatch(db, [path]),
      readExistsFromServer: async () => (await getDocFromServer(doc(db, path))).exists(),
    }),
  );
  if (subordinateResult.failures.length > 0) {
    throw subordinateResult.failures[0].error;
  }
  await deleteHeadWithPostconditionV2({
    commitDelete: async () => commitDeleteBatch(db, [headPath]),
    readExistsFromServer: async () => (await getDocFromServer(headReference)).exists(),
  });
}

export async function resumePendingShootingProfileDeletionsV2(user: User): Promise<void> {
  const db = requireFirestore();
  const uid = requirePathSegment(user.uid, "owner UID");
  const result = await getDocsFromServer(collection(db, "users", uid, "motionProfiles"));
  const profileIds = selectPendingDeletionProfileIdsV2(uid, result.docs.map((snapshot) => ({
    id: snapshot.id,
    data: snapshot.data(),
  })));
  for (const profileId of profileIds) {
    await deleteShootingProfileV2(user, profileId);
  }
}
