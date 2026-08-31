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
  MISSING_VISIBILITY_SENTINEL_V2,
  OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2,
  OBSERVATION_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2,
  OBSERVATION_SEQUENCE_PAYLOAD_PACKING_ORDER_V2,
  PHASE_SAMPLE_COUNT_V2,
  REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2,
  REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2,
  REPRESENTATIVE_SEQUENCE_PAYLOAD_PACKING_ORDER_V2,
  RULE_SAFE_BATCH_MUTATIONS_V2,
  SHOOTING_PROFILE_ALGORITHM_VERSION_V2,
  SHOOTING_PROFILE_BOUNDARY_V2,
  SHOOTING_PROFILE_CONSENT_REFERENCE_V2,
  SHOOTING_PROFILE_DATA_CLASS_V2,
  SHOOTING_PROFILE_MODEL_VERSION_V2,
  SHOOTING_PROFILE_RETENTION_CLASS_V2,
  SHOOTING_PROFILE_SCHEMA_VERSION_V2,
  SHOOTING_PROFILE_TIME_BASIS_V2,
  isOpaqueShootingProfileIdV2,
  quantizeShootingProfileNumberV2,
  reconstructRepresentativeProfileFromSequencePayloadV2,
  serializeObservationSequenceForCloud,
  serializeRepresentativeSequenceForCloud,
  validatePersistedObservationSequenceV2,
  validateShootingProfileWriteV2,
  type SaveShootingProfileInputV2,
  type ShootingProfileViewerRecordV2,
} from "@/lib/firebase-shooting-profile-contract";
import type {
  CaptureProtocolV2,
  ReconstructionQualityV2,
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

export type ShootingProfileWritePortV2 = {
  setWrite: (write: PlannedFirestoreWriteV2) => Promise<void>;
  readDocumentFromServer: (path: string) => Promise<PersistedDocumentV2 | null>;
  deletePath: (path: string) => Promise<void>;
};

export type ShootingProfileReaderPortV2 = {
  readDocument: (path: string) => Promise<PersistedDocumentV2 | null>;
};

type UnknownRecord = Record<string, unknown>;

type CommonMetadataInputV2 = {
  uid: string;
  recordType: string;
  timestamp: unknown;
};

export const SHOOTING_PROFILE_STORAGE_LAYOUT_V2 = "phase_sequence_payloads_v1" as const;

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
  "storageLayout",
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
  "representativePayloadByteLength",
  "phaseSummaryCount",
  "units",
] as const;

const REVISION_HEAD_KEYS_V2 = [
  ...COMMON_METADATA_KEYS_V2,
  "recordType",
  "storageLayout",
  "profileId",
  "captureSessionId",
  "revisionId",
  "status",
  "mode",
  "shootingHand",
  "confidence",
  "attemptCount",
  "frameCount",
  "phaseSummaryCount",
  "units",
  "framePayloadByteLength",
  "payloadByteLength",
  "payloadFormat",
  "fixedPointScale",
  "packingOrder",
  "uncertaintyModel",
  "payload",
  "quality",
] as const;

const OBSERVATION_KEYS_V2 = [
  ...COMMON_METADATA_KEYS_V2,
  "recordType",
  "storageLayout",
  "captureSessionId",
  "profileId",
  "revisionId",
  "attemptId",
  "status",
  "view",
  "shootingHand",
  "takeIndex",
  "frameCount",
  "framePayloadByteLength",
  "payloadByteLength",
  "payloadFormat",
  "fixedPointScale",
  "packingOrder",
  "missingVisibilitySentinel",
  "payload",
] as const;

const CAPTURE_SESSION_KEYS_V2 = [
  ...COMMON_METADATA_KEYS_V2,
  "recordType",
  "storageLayout",
  "captureSessionId",
  "profileId",
  "revisionId",
  "status",
  "mode",
  "shootingHand",
  "attemptIds",
  "attemptCount",
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
  "storageLayout",
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
  "representativePayloadByteLength",
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

function requireCanonicalChainId(
  captureSessionId: string,
  profileId: string,
  revisionId: string,
): string {
  if (captureSessionId !== profileId || revisionId !== profileId) {
    throw new Error("profile, capture, and revision must use one canonical chain ID");
  }
  return profileId;
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

function validatePlannedCommonMetadata(value: UnknownRecord, uid: string, recordType: string, name: string): void {
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
  const serverTimestampValue = serverTimestamp();
  const expectedPrototype = Object.getPrototypeOf(serverTimestampValue);
  for (const [key, timestamp] of [["createdAt", value.createdAt], ["updatedAt", value.updatedAt]] as const) {
    if (
      !isRecord(timestamp)
      || Object.getPrototypeOf(timestamp) !== expectedPrototype
      || Object.keys(timestamp).length !== 1
      || timestamp._methodName !== "serverTimestamp"
      || typeof timestamp.isEqual !== "function"
      || timestamp.isEqual(serverTimestampValue) !== true
    ) {
      throw new Error(`${name}.${key} must be a Firestore serverTimestamp FieldValue`);
    }
  }
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
  requireCanonicalChainId(captureSessionId, profileId, revisionId);
  const input = validateShootingProfileWriteV2(args.input);
  const timestamp = args.timestamp;
  const representative = serializeRepresentativeSequenceForCloud(input.profile);
  const attempts = canonicalAttemptOrder(input).map(serializeObservationSequenceForCloud);
  const attemptIds = attempts.map((attempt) => attempt.attemptId);
  const confidence = quantizeShootingProfileNumberV2(input.confidence, 0, 1, "confidence");
  const capturePath = captureBasePath(uid, captureSessionId);
  const profilePath = profileBasePath(uid, profileId);
  const revisionPath = revisionBasePath(uid, profileId, revisionId);
  const stagingWrites: PlannedFirestoreWriteV2[] = [];

  for (const attempt of attempts) {
    const observationPath = `${capturePath}/observations/${attempt.attemptId}`;
    stagingWrites.push({
      path: observationPath,
      data: {
        ...commonMetadata({ uid, recordType: "normalized_observation_v2", timestamp }),
        storageLayout: SHOOTING_PROFILE_STORAGE_LAYOUT_V2,
        captureSessionId,
        profileId,
        revisionId,
        attemptId: attempt.attemptId,
        status: "complete",
        view: attempt.view,
        shootingHand: attempt.shootingHand,
        takeIndex: attempt.takeIndex,
        frameCount: attempt.frameCount,
        framePayloadByteLength: attempt.framePayloadByteLength,
        payloadByteLength: attempt.payloadByteLength,
        payloadFormat: attempt.payloadFormat,
        fixedPointScale: attempt.fixedPointScale,
        packingOrder: attempt.packingOrder,
        missingVisibilitySentinel: attempt.missingVisibilitySentinel,
        payload: Bytes.fromUint8Array(attempt.payload),
      },
    });
  }

  stagingWrites.push({
    path: capturePath,
    data: {
      ...commonMetadata({ uid, recordType: "capture_session_v2", timestamp }),
      storageLayout: SHOOTING_PROFILE_STORAGE_LAYOUT_V2,
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

  stagingWrites.push({
    path: revisionPath,
    data: {
      ...commonMetadata({ uid, recordType: "representative_revision_v2", timestamp }),
      storageLayout: SHOOTING_PROFILE_STORAGE_LAYOUT_V2,
      profileId,
      captureSessionId,
      revisionId,
      status: "complete",
      mode: input.profile.mode,
      shootingHand: input.shootingHand,
      confidence,
      attemptCount: attemptIds.length,
      frameCount: representative.frameCount,
      phaseSummaryCount: CANONICAL_PHASE_SUMMARIES_V2.length,
      units: "template_shoulder_breadths",
      framePayloadByteLength: representative.framePayloadByteLength,
      payloadByteLength: representative.payloadByteLength,
      payloadFormat: representative.payloadFormat,
      fixedPointScale: representative.fixedPointScale,
      packingOrder: representative.packingOrder,
      uncertaintyModel: representative.uncertaintyModel,
      payload: Bytes.fromUint8Array(representative.payload),
      quality: { passed: true, reasons: [] },
    },
  });

  const publicationWrite: PlannedFirestoreWriteV2 = {
    path: profilePath,
    data: {
      ...commonMetadata({ uid, recordType: "motion_profile_v2", timestamp }),
      storageLayout: SHOOTING_PROFILE_STORAGE_LAYOUT_V2,
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
      representativePayloadByteLength: REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2,
      phaseSummaryCount: CANONICAL_PHASE_SUMMARIES_V2.length,
      units: "template_shoulder_breadths",
    },
  };

  return { captureSessionId, profileId, revisionId, stagingWrites, publicationWrite };
}

export function partitionShootingProfileWritesV2<T>(
  writes: readonly T[],
  maximum: number = RULE_SAFE_BATCH_MUTATIONS_V2,
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
  failures: { path: string; error: unknown }[];
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

export function buildFailedStagingCleanupPathsV2(paths: readonly string[]): string[] {
  return [...new Set(paths)].reverse();
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
  requireCanonicalChainId(captureSessionId, profileId, revisionId);
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

export function validateObservationDocumentV2(args: ObservationDocumentContextV2): void {
  const document = requireDocument(args.document, "observation document");
  if (document.id !== args.attemptId) throw new Error("observation attempt document ID must equal attemptId");
  const data = requireRecord(document.data, "observation");
  assertExactKeys(data, OBSERVATION_KEYS_V2, "observation");
  validateCommonMetadata(data, args.uid, "normalized_observation_v2", "observation");
  validateObservationDocumentContext(data, args, "observation");
  if (data.status !== "complete") throw new Error("observation must be complete");
  requireInteger(data.frameCount, PHASE_SAMPLE_COUNT_V2, "observation frame count");
  if (
    data.storageLayout !== SHOOTING_PROFILE_STORAGE_LAYOUT_V2
    || data.framePayloadByteLength !== OBSERVATION_FRAME_PAYLOAD_BYTE_LENGTH_V2
    || data.payloadByteLength !== OBSERVATION_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2
    || data.payloadFormat !== BINARY_PAYLOAD_FORMAT_V2
    || data.fixedPointScale !== FIXED_POINT_SCALE_V2
    || data.packingOrder !== OBSERVATION_SEQUENCE_PAYLOAD_PACKING_ORDER_V2
    || data.missingVisibilitySentinel !== MISSING_VISIBILITY_SENTINEL_V2
    || !(data.payload instanceof Bytes)
  ) {
    throw new Error("observation compact layout or Firestore Bytes payload metadata is invalid");
  }
  validatePersistedObservationSequenceV2({
    attemptId: data.attemptId,
    view: data.view,
    shootingHand: data.shootingHand,
    takeIndex: data.takeIndex,
    frameCount: data.frameCount,
    framePayloadByteLength: data.framePayloadByteLength,
    payloadByteLength: data.payloadByteLength,
    payloadFormat: data.payloadFormat,
    fixedPointScale: data.fixedPointScale,
    packingOrder: data.packingOrder,
    missingVisibilitySentinel: data.missingVisibilitySentinel,
    payload: data.payload.toUint8Array(),
  });
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
  const captureSessionId = requireOpaqueId(head.captureSessionId, "capture session ID");
  const revisionId = requireOpaqueId(head.revisionId, "revision ID");
  requireCanonicalChainId(captureSessionId, profileId, revisionId);
  if (
    head.profileId !== profileId
    || head.captureSessionId !== captureSessionId
    || head.revisionId !== revisionId
    || head.status !== "complete"
    || head.storageLayout !== SHOOTING_PROFILE_STORAGE_LAYOUT_V2
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
    head.representativePayloadByteLength,
    REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2,
    "motion profile head representative payload byte length",
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
  const persistedAttemptIds = persisted.attemptIds;
  const plannedAttemptIds = planned.attemptIds;
  if (
    !Array.isArray(persistedAttemptIds)
    || !Array.isArray(plannedAttemptIds)
    || persistedAttemptIds.length !== plannedAttemptIds.length
    || persistedAttemptIds.some((attemptId, index) => attemptId !== plannedAttemptIds[index])
  ) {
    throw new Error("persisted publication identity does not match this write plan");
  }
}

export type FailedPublicationResolutionV2 = "published" | "not_published" | "unknown";

export async function resolveFailedShootingProfilePublicationV2(args: {
  readHeadFromServer: () => Promise<PersistedDocumentV2 | null>;
  validateMatchingHead: (document: PersistedDocumentV2) => void;
  cleanupStaging: () => Promise<void>;
}): Promise<FailedPublicationResolutionV2> {
  let document: PersistedDocumentV2 | null;
  try {
    document = await args.readHeadFromServer();
  } catch {
    return "unknown";
  }
  if (document !== null) {
    try {
      args.validateMatchingHead(document);
    } catch {
      return "unknown";
    }
    return "published";
  }
  try {
    await args.cleanupStaging();
  } catch {
    return "unknown";
  }
  return "not_published";
}

function requirePlannedFirestoreWrite(value: unknown, name: string): PlannedFirestoreWriteV2 {
  const write = requireRecord(value, name);
  assertExactKeys(write, ["path", "data"], name);
  if (typeof write.path !== "string") throw new Error(`${name} path is invalid`);
  requireRecord(write.data, `${name} data`);
  return write as PlannedFirestoreWriteV2;
}

function requireMatchingAttemptIds(
  value: unknown,
  expected: readonly string[],
  mode: CaptureProtocolV2,
  name: string,
): void {
  const attemptIds = validateAttemptIds(value, mode, name);
  if (attemptIds.some((attemptId, index) => attemptId !== expected[index])) {
    throw new Error(`${name} attempt IDs do not match the publication`);
  }
}

function validateCanonicalShootingProfileWritePlanV2(args: {
  uid: string;
  plan: ShootingProfileWritePlanV2;
}): {
  uid: string;
  profileId: string;
  stagingWrites: PlannedFirestoreWriteV2[];
  publicationWrite: PlannedFirestoreWriteV2;
} {
  const uid = requirePathSegment(args.uid, "owner UID");
  const plan = requireRecord(args.plan, "shooting profile write plan");
  assertExactKeys(
    plan,
    ["captureSessionId", "profileId", "revisionId", "stagingWrites", "publicationWrite"],
    "shooting profile write plan",
  );
  const captureSessionId = requireOpaqueId(plan.captureSessionId, "capture session ID");
  const profileId = requireOpaqueId(plan.profileId, "profile ID");
  const revisionId = requireOpaqueId(plan.revisionId, "revision ID");
  requireCanonicalChainId(captureSessionId, profileId, revisionId);
  if (!Array.isArray(plan.stagingWrites)) throw new Error("shooting profile write plan staging writes are invalid");
  const stagingWrites = plan.stagingWrites.map((write, index) =>
    requirePlannedFirestoreWrite(write, `staging write ${index}`));
  const publicationWrite = requirePlannedFirestoreWrite(plan.publicationWrite, "publication write");

  if (publicationWrite.path !== profileBasePath(uid, profileId)) {
    throw new Error("publication write path does not match the owner profile identity");
  }
  const publication = publicationWrite.data;
  assertExactKeys(publication, PROFILE_HEAD_KEYS_V2, "publication write");
  validatePlannedCommonMetadata(publication, uid, "motion_profile_v2", "publication write");
  if (
    publication.storageLayout !== SHOOTING_PROFILE_STORAGE_LAYOUT_V2
    || publication.profileId !== profileId
    || publication.captureSessionId !== captureSessionId
    || publication.revisionId !== revisionId
    || publication.status !== "complete"
    || publication.deletionState !== "active"
    || publication.units !== "template_shoulder_breadths"
  ) {
    throw new Error("publication write immutable identity is invalid");
  }
  const mode = validateMode(publication.mode, "publication write");
  const shootingHand = validateHand(publication.shootingHand, "publication write");
  validateModeConfidence(mode, publication.confidence, "publication write");
  const attemptIds = validateAttemptIds(publication.attemptIds, mode, "publication write");
  requireInteger(publication.attemptCount, attemptIds.length, "publication write attempt count");
  requireInteger(publication.frameCount, PHASE_SAMPLE_COUNT_V2, "publication write frame count");
  requireInteger(
    publication.representativePayloadByteLength,
    REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2,
    "publication write representative payload byte length",
  );
  requireInteger(
    publication.phaseSummaryCount,
    CANONICAL_PHASE_SUMMARIES_V2.length,
    "publication write phase summary count",
  );

  const capturePath = captureBasePath(uid, captureSessionId);
  const expectedStagingPaths = [
    ...attemptIds.map((attemptId) => `${capturePath}/observations/${attemptId}`),
    capturePath,
    revisionBasePath(uid, profileId, revisionId),
  ];
  if (
    stagingWrites.length !== expectedStagingPaths.length
    || stagingWrites.some((write, index) => write.path !== expectedStagingPaths[index])
  ) {
    throw new Error("staging write paths must be canonical and ordered");
  }

  attemptIds.forEach((attemptId, index) => {
    const observation = stagingWrites[index].data;
    assertExactKeys(observation, OBSERVATION_KEYS_V2, `observation staging write ${index}`);
    validatePlannedCommonMetadata(
      observation,
      uid,
      "normalized_observation_v2",
      `observation staging write ${index}`,
    );
    const identity = expectedAttemptIdentity(attemptId);
    if (
      observation.storageLayout !== SHOOTING_PROFILE_STORAGE_LAYOUT_V2
      || observation.captureSessionId !== captureSessionId
      || observation.profileId !== profileId
      || observation.revisionId !== revisionId
      || observation.attemptId !== attemptId
      || observation.status !== "complete"
      || observation.view !== identity.view
      || observation.takeIndex !== identity.takeIndex
      || observation.shootingHand !== shootingHand
    ) {
      throw new Error(`observation staging write ${index} immutable identity is invalid`);
    }
    if (!(observation.payload instanceof Bytes)) {
      throw new Error(`observation staging write ${index} payload must be Firestore Bytes`);
    }
    validatePersistedObservationSequenceV2({
      attemptId: observation.attemptId,
      view: observation.view,
      shootingHand: observation.shootingHand,
      takeIndex: observation.takeIndex,
      frameCount: observation.frameCount,
      framePayloadByteLength: observation.framePayloadByteLength,
      payloadByteLength: observation.payloadByteLength,
      payloadFormat: observation.payloadFormat,
      fixedPointScale: observation.fixedPointScale,
      packingOrder: observation.packingOrder,
      missingVisibilitySentinel: observation.missingVisibilitySentinel,
      payload: observation.payload.toUint8Array(),
    });
  });

  const capture = stagingWrites[attemptIds.length].data;
  assertExactKeys(capture, CAPTURE_SESSION_KEYS_V2, "capture staging write");
  validatePlannedCommonMetadata(capture, uid, "capture_session_v2", "capture staging write");
  if (
    capture.storageLayout !== SHOOTING_PROFILE_STORAGE_LAYOUT_V2
    || capture.captureSessionId !== captureSessionId
    || capture.profileId !== profileId
    || capture.revisionId !== revisionId
    || capture.status !== "complete"
    || capture.mode !== mode
    || capture.shootingHand !== shootingHand
  ) {
    throw new Error("capture staging write immutable identity is invalid");
  }
  requireMatchingAttemptIds(capture.attemptIds, attemptIds, mode, "capture staging write");
  requireInteger(capture.attemptCount, attemptIds.length, "capture staging write attempt count");

  const revision = stagingWrites.at(-1)!.data;
  assertExactKeys(revision, REVISION_HEAD_KEYS_V2, "revision staging write");
  validatePlannedCommonMetadata(revision, uid, "representative_revision_v2", "revision staging write");
  if (
    revision.storageLayout !== SHOOTING_PROFILE_STORAGE_LAYOUT_V2
    || revision.profileId !== profileId
    || revision.captureSessionId !== captureSessionId
    || revision.revisionId !== revisionId
    || revision.status !== "complete"
    || revision.mode !== mode
    || revision.shootingHand !== shootingHand
  ) {
    throw new Error("revision staging write immutable identity is invalid");
  }
  validateModeConfidence(mode, revision.confidence, "revision staging write");
  if (
    revision.confidence !== publication.confidence
    || revision.units !== "template_shoulder_breadths"
  ) {
    throw new Error("revision staging write does not match the publication");
  }
  requireInteger(revision.attemptCount, attemptIds.length, "revision staging write attempt count");
  requireInteger(revision.frameCount, PHASE_SAMPLE_COUNT_V2, "revision staging write frame count");
  requireInteger(
    revision.phaseSummaryCount,
    CANONICAL_PHASE_SUMMARIES_V2.length,
    "revision staging write phase summary count",
  );
  if (
    revision.framePayloadByteLength !== REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2
    || revision.payloadByteLength !== REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2
    || revision.payloadFormat !== BINARY_PAYLOAD_FORMAT_V2
    || revision.fixedPointScale !== FIXED_POINT_SCALE_V2
    || revision.packingOrder !== REPRESENTATIVE_SEQUENCE_PAYLOAD_PACKING_ORDER_V2
    || revision.uncertaintyModel !== "heuristic_v1"
    || !(revision.payload instanceof Bytes)
  ) {
    throw new Error("revision staging write compact layout or Firestore Bytes payload metadata is invalid");
  }
  validateQuality(revision.quality);
  reconstructRepresentativeProfileFromSequencePayloadV2({
    frameCount: revision.frameCount,
    framePayloadByteLength: revision.framePayloadByteLength,
    payloadByteLength: revision.payloadByteLength,
    payloadFormat: revision.payloadFormat,
    fixedPointScale: revision.fixedPointScale,
    packingOrder: revision.packingOrder,
    uncertaintyModel: revision.uncertaintyModel,
    payload: revision.payload.toUint8Array(),
  }, mode);

  return { uid, profileId, stagingWrites, publicationWrite };
}

export async function executeShootingProfileWritePlanV2(args: {
  uid: string;
  plan: ShootingProfileWritePlanV2;
  port: ShootingProfileWritePortV2;
}): Promise<void> {
  const { uid, profileId, stagingWrites, publicationWrite } = validateCanonicalShootingProfileWritePlanV2(args);

  const acknowledgedStagingPaths: string[] = [];
  for (const write of stagingWrites) {
    try {
      await args.port.setWrite(write);
      acknowledgedStagingPaths.push(write.path);
    } catch (error) {
      try {
        const observed = await args.port.readDocumentFromServer(write.path);
        if (
          observed !== null
          && observed.id === write.path.split("/").at(-1)
          && matchesPlannedStagingWriteV2(observed.data, write.data)
        ) {
          acknowledgedStagingPaths.push(write.path);
        }
      } catch {
        // The failed write remains unknown and is deliberately not a cleanup candidate.
      }
      await attemptKnownSinglePathCleanupV2(
        buildFailedStagingCleanupPathsV2(acknowledgedStagingPaths),
        args.port.deletePath,
      );
      throw error;
    }
  }

  try {
    await args.port.setWrite(publicationWrite);
  } catch (error) {
    const resolution = await resolveFailedShootingProfilePublicationV2({
      readHeadFromServer: () => args.port.readDocumentFromServer(publicationWrite.path),
      validateMatchingHead: (document) => {
        const persistedHead = validateProfileHeadDocument(document, uid, profileId, "active");
        validateShootingProfilePublicationIdentityV2(
          persistedHead,
          publicationWrite.data,
        );
      },
      cleanupStaging: async () => {
        const cleanup = await attemptKnownSinglePathCleanupV2(
          buildFailedStagingCleanupPathsV2(stagingWrites.map((write) => write.path)),
          args.port.deletePath,
        );
        if (cleanup.failures.length > 0) throw cleanup.failures[0].error;
      },
    });
    if (resolution === "published") return;
    throw error;
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

function validateRevisionDocument(value: unknown, uid: string, profileHead: UnknownRecord): UnknownRecord {
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
    revision.framePayloadByteLength,
    REPRESENTATIVE_FRAME_PAYLOAD_BYTE_LENGTH_V2,
    "revision frame payload byte length",
  );
  requireInteger(
    revision.payloadByteLength,
    REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2,
    "revision payload byte length",
  );
  requireInteger(revision.phaseSummaryCount, CANONICAL_PHASE_SUMMARIES_V2.length, "revision phase summary count");
  if (
    revision.storageLayout !== SHOOTING_PROFILE_STORAGE_LAYOUT_V2
    || revision.payloadByteLength !== profileHead.representativePayloadByteLength
    || revision.payloadFormat !== BINARY_PAYLOAD_FORMAT_V2
    || revision.fixedPointScale !== FIXED_POINT_SCALE_V2
    || revision.packingOrder !== REPRESENTATIVE_SEQUENCE_PAYLOAD_PACKING_ORDER_V2
    || revision.uncertaintyModel !== "heuristic_v1"
    || !(revision.payload instanceof Bytes)
  ) {
    throw new Error("representative revision compact layout or Firestore Bytes payload metadata is invalid");
  }
  validateQuality(revision.quality);
  return revision;
}

export function reconstructShootingProfileViewerRecordV2(args: {
  uid: string;
  profileId: string;
  head: PersistedDocumentV2;
  revision: PersistedDocumentV2;
}): ShootingProfileViewerRecordV2 {
  const uid = requirePathSegment(args.uid, "owner UID");
  const profileId = requireOpaqueId(args.profileId, "profile ID");
  const head = validateProfileHeadDocument(args.head, uid, profileId, "active");
  const revision = validateRevisionDocument(args.revision, uid, head);
  const mode = validateMode(head.mode, "motion profile head");
  const profile = reconstructRepresentativeProfileFromSequencePayloadV2({
    frameCount: revision.frameCount,
    framePayloadByteLength: revision.framePayloadByteLength,
    payloadByteLength: revision.payloadByteLength,
    payloadFormat: revision.payloadFormat,
    fixedPointScale: revision.fixedPointScale,
    packingOrder: revision.packingOrder,
    uncertaintyModel: revision.uncertaintyModel,
    payload: (revision.payload as Bytes).toUint8Array(),
  }, mode);
  return {
    profile,
    shootingHand: validateHand(head.shootingHand, "motion profile head"),
    confidence: validateModeConfidence(
      mode,
      head.confidence,
      "motion profile head",
    ),
  };
}

export async function loadShootingProfileViewerRecordV2(args: {
  uid: string;
  profileId: string;
  reader: ShootingProfileReaderPortV2;
}): Promise<ShootingProfileViewerRecordV2 | null> {
  const uid = requirePathSegment(args.uid, "owner UID");
  const profileId = requireOpaqueId(args.profileId, "profile ID");
  const headPath = profileBasePath(uid, profileId);
  const headDocument = await args.reader.readDocument(headPath);
  if (headDocument === null) return null;

  const head = validateProfileHeadDocument(headDocument, uid, profileId, "active");
  const revisionId = requireOpaqueId(head.revisionId, "revision ID");
  const revisionPath = revisionBasePath(uid, profileId, revisionId);
  const revisionDocument = await args.reader.readDocument(revisionPath);
  if (revisionDocument === null) throw new Error("completed representative revision is missing");

  return reconstructShootingProfileViewerRecordV2({
    uid,
    profileId,
    head: headDocument,
    revision: revisionDocument,
  });
}

export function buildShootingProfileDeletePlanV2(args: {
  uid: string;
  profileId: string;
  captureSessionId: string;
  revisionId: string;
  attemptIds: readonly string[];
  deletionState: "active" | "in_progress";
}): ShootingProfileDeletePlanV2 {
  if (args.deletionState !== "active" && args.deletionState !== "in_progress") {
    throw new Error("deletion state must be active or in_progress");
  }
  const uid = requirePathSegment(args.uid, "owner UID");
  const profileId = requireOpaqueId(args.profileId, "profile ID");
  const captureSessionId = requireOpaqueId(args.captureSessionId, "capture session ID");
  const revisionId = requireOpaqueId(args.revisionId, "revision ID");
  requireCanonicalChainId(captureSessionId, profileId, revisionId);
  const mode = args.attemptIds.length === 2 ? "basic_1_plus_1" : "high_accuracy_3_plus_3";
  const attemptIds = validateAttemptIds([...args.attemptIds], mode, "deletion plan");
  const headPath = profileBasePath(uid, profileId);
  const capturePath = captureBasePath(uid, captureSessionId);
  const subordinatePaths = [
    revisionBasePath(uid, profileId, revisionId),
    capturePath,
    ...attemptIds.map((attemptId) => `${capturePath}/observations/${attemptId}`),
  ];
  const subordinateBatches = partitionShootingProfileWritesV2(subordinatePaths);
  return {
    transitionRequired: args.deletionState === "active",
    deletePaths: [...subordinatePaths, headPath],
    deleteBatches: [...subordinateBatches, [headPath]],
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

function firestoreWritePort(db: Firestore): ShootingProfileWritePortV2 {
  return {
    setWrite: async (write) => {
      const batch = writeBatch(db);
      batch.set(doc(db, write.path), write.data);
      await batch.commit();
    },
    readDocumentFromServer: async (path) => {
      const published = await getDocFromServer(doc(db, path));
      return published.exists() ? { id: published.id, data: published.data() } : null;
    },
    deletePath: async (path) => {
      const batch = writeBatch(db);
      batch.delete(doc(db, path));
      await batch.commit();
    },
  };
}

export async function saveShootingProfileV2(user: User, input: SaveShootingProfileInputV2): Promise<string> {
  const db = requireFirestore();
  const uid = requirePathSegment(user.uid, "owner UID");
  const profileId = doc(collection(db, "users", uid, "motionProfiles")).id;
  requireOpaqueId(profileId, "generated profile ID");
  const captureSessionId = profileId;
  const revisionId = profileId;

  const plan = buildShootingProfileWritePlanV2({
    uid,
    captureSessionId,
    profileId,
    revisionId,
    input,
    timestamp: serverTimestamp(),
  });
  await executeShootingProfileWritePlanV2({ uid, plan, port: firestoreWritePort(db) });
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
  return loadShootingProfileViewerRecordV2({
    uid,
    profileId,
    reader: {
      readDocument: async (path) => {
        const snapshot = await getDoc(doc(db, path));
        return snapshot.exists() ? { id: snapshot.id, data: snapshot.data() } : null;
      },
    },
  });
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
  const plan = buildShootingProfileDeletePlanV2({
    uid,
    profileId,
    captureSessionId: initialHead.captureSessionId as string,
    revisionId: initialHead.revisionId as string,
    attemptIds: initialHead.attemptIds as string[],
    deletionState,
  });
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
