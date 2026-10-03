import type { LocalFilmViewV1 } from "@/lib/film-space/types";

/**
 * CLOUD FILM SHOT CONTRACT (v1). The owner's own footage, kept in their
 * private Firebase Storage prefix only when they opted in for that shot: one
 * object per clip, one Firestore clip document per clip, one head. This module
 * is the single source of the shapes `firestore.rules` and `storage.rules`
 * enforce. It is pure: no Firebase imports, no network, no file names.
 */

export const FILM_SHOT_SCHEMA_VERSION_V1 = 1 as const;
export const FILM_SHOT_HEAD_RECORD_TYPE_V1 = "film_shot_head_v1" as const;
export const FILM_SHOT_CLIP_RECORD_TYPE_V1 = "film_shot_clip_v1" as const;
export const FILM_SHOT_BOUNDARY_V1 = "owner_footage_only_no_pose_analysis_v1" as const;
export const FILM_SHOT_DATA_CLASS_V1 = "owner_private_raw_footage_v1" as const;
export const FILM_SHOT_RETENTION_CLASS_V1 = "owner_deleted_v1" as const;
export const FILM_SHOT_CONSENT_REFERENCE_V1 = "owner_cloud_footage_consent_v1" as const;
export const FILM_SHOT_MAX_CLIPS_V1 = 6 as const;
export const FILM_SHOT_MAX_CLIP_BYTES_V1 = 64 * 1024 * 1024;
export const FILM_SHOT_MIN_DURATION_MS_V1 = 200 as const;
export const FILM_SHOT_MAX_DURATION_MS_V1 = 60_000 as const;
export const FILM_SHOT_MIN_EDGE_PX_V1 = 16 as const;
export const FILM_SHOT_MAX_EDGE_PX_V1 = 8192 as const;
export const FILM_SHOT_CONTENT_TYPES_V1 = ["video/mp4", "video/quicktime", "video/webm"] as const;
/** A display name typed by the owner; never a file name (no dot). Shared with the device store. */
export const FILM_SHOT_TITLE_PATTERN_V1 = /^[A-Za-z0-9가-힣 ·]{1,24}$/;
export const FILM_SHOT_DEFAULT_TITLE_V1 = "내 슛폼";
export const FILM_SHOT_SLOT_ID_PATTERN_V1 = /^(front|shooting_side)-[0-2]$/;
export const FILM_SHOT_SLOT_IDS_V1 = Object.freeze(["front-0", "front-1", "front-2", "shooting_side-0", "shooting_side-1", "shooting_side-2"] as const);

const OPAQUE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type FilmShotContentTypeV1 = typeof FILM_SHOT_CONTENT_TYPES_V1[number];
export type FilmShotDeletionStateV1 = "active" | "in_progress";

export type FilmShotCloudClipInputV1 = Readonly<{
  slotId: string;
  view: LocalFilmViewV1;
  takeIndex: number;
  durationMs: number;
  width: number;
  height: number;
  byteLength: number;
  contentType: FilmShotContentTypeV1;
}>;

type FilmShotCommonV1 = Readonly<{
  ownerUid: string;
  schemaVersion: typeof FILM_SHOT_SCHEMA_VERSION_V1;
  boundary: typeof FILM_SHOT_BOUNDARY_V1;
  dataClass: typeof FILM_SHOT_DATA_CLASS_V1;
  retentionClass: typeof FILM_SHOT_RETENTION_CLASS_V1;
  consentReference: typeof FILM_SHOT_CONSENT_REFERENCE_V1;
  createdAt: unknown;
  updatedAt: unknown;
}>;

export type FilmShotHeadV1 = FilmShotCommonV1 & Readonly<{
  recordType: typeof FILM_SHOT_HEAD_RECORD_TYPE_V1;
  status: "complete";
  deletionState: FilmShotDeletionStateV1;
  shotId: string;
  title: string;
  clipIds: readonly string[];
  clipCount: number;
}>;

export type FilmShotClipDocumentV1 = FilmShotCommonV1 & Readonly<{
  recordType: typeof FILM_SHOT_CLIP_RECORD_TYPE_V1;
  shotId: string;
  slotId: string;
  view: LocalFilmViewV1;
  takeIndex: number;
  durationMs: number;
  width: number;
  height: number;
  byteLength: number;
  contentType: FilmShotContentTypeV1;
  storagePath: string;
}>;

export type PlannedFilmShotWriteV1 = Readonly<{ path: string; data: Record<string, unknown> }>;

export type FilmShotObjectUploadV1 = Readonly<{ slotId: string; storagePath: string; contentType: FilmShotContentTypeV1 }>;

export type FilmShotWritePlanV1 = Readonly<{
  shotId: string;
  title: string;
  /** Objects first: the clip documents bind these paths and the head is published over the documents. */
  objectUploads: readonly FilmShotObjectUploadV1[];
  clipWrites: readonly PlannedFilmShotWriteV1[];
  headWrite: PlannedFilmShotWriteV1;
}>;

const COMMON_KEYS = ["ownerUid", "schemaVersion", "recordType", "boundary", "dataClass", "retentionClass", "consentReference", "createdAt", "updatedAt"] as const;
const HEAD_KEYS = [...COMMON_KEYS, "status", "deletionState", "shotId", "title", "clipIds", "clipCount"] as const;
const CLIP_KEYS = [...COMMON_KEYS, "shotId", "slotId", "view", "takeIndex", "durationMs", "width", "height", "byteLength", "contentType", "storagePath"] as const;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, name: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`${name} must be an object`);
  return value;
}

function assertExactKeys(value: UnknownRecord, keys: readonly string[], name: string): void {
  const allowed = new Set<string>(keys);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !allowed.has(key))) {
    throw new Error(`${name} contains an unknown or missing key`);
  }
}

function requireUid(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 128 || value.includes("/") || value === "." || value === "..") {
    throw new Error("owner UID must be a bounded path segment");
  }
  return value;
}

function requireShotId(value: unknown): string {
  if (typeof value !== "string" || !OPAQUE_ID.test(value)) throw new Error("film shot ID must be a valid opaque ID");
  return value;
}

function requireSlotId(value: unknown): string {
  if (typeof value !== "string" || !FILM_SHOT_SLOT_ID_PATTERN_V1.test(value)) throw new Error("film shot slot ID must be <view>-<take>");
  return value;
}

function slotIdentity(slotId: string): { view: LocalFilmViewV1; takeIndex: number } {
  const [view, take] = slotId.split("-") as [LocalFilmViewV1, string];
  return { view, takeIndex: Number(take) };
}

function requireBoundedInteger(value: unknown, minimum: number, maximum: number, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function requireContentType(value: unknown): FilmShotContentTypeV1 {
  if (typeof value !== "string" || !(FILM_SHOT_CONTENT_TYPES_V1 as readonly string[]).includes(value)) {
    throw new Error("film shot clip content type must be a supported video type");
  }
  return value as FilmShotContentTypeV1;
}

function requireTimestamp(value: unknown, name: string): void {
  if (!isRecord(value) || typeof value.toMillis !== "function" || typeof value.toDate !== "function") {
    throw new Error(`${name} must be a Firestore timestamp`);
  }
}

function requireTitle(value: unknown): string {
  if (typeof value !== "string" || !FILM_SHOT_TITLE_PATTERN_V1.test(value)) throw new Error("film shot title must be a short plain display name");
  return value;
}

function requireClipIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > FILM_SHOT_MAX_CLIPS_V1) throw new Error("film shot clip IDs must list 1 to 6 clips");
  const ids = value.map((id) => requireSlotId(id));
  if (new Set(ids).size !== ids.length) throw new Error("film shot clip IDs must be unique");
  return ids;
}

function validateCommon(data: UnknownRecord, uid: string, recordType: string, name: string): void {
  if (
    data.ownerUid !== uid
    || data.schemaVersion !== FILM_SHOT_SCHEMA_VERSION_V1
    || data.recordType !== recordType
    || data.boundary !== FILM_SHOT_BOUNDARY_V1
    || data.dataClass !== FILM_SHOT_DATA_CLASS_V1
    || data.retentionClass !== FILM_SHOT_RETENTION_CLASS_V1
    || data.consentReference !== FILM_SHOT_CONSENT_REFERENCE_V1
  ) {
    throw new Error(`${name} immutable owner metadata is invalid`);
  }
  requireTimestamp(data.createdAt, `${name}.createdAt`);
  requireTimestamp(data.updatedAt, `${name}.updatedAt`);
}

export function filmShotHeadPathV1(uid: string, shotId: string): string {
  return `users/${requireUid(uid)}/filmShots/${requireShotId(shotId)}`;
}

export function filmShotClipPathV1(uid: string, shotId: string, slotId: string): string {
  return `${filmShotHeadPathV1(uid, shotId)}/clips/${requireSlotId(slotId)}`;
}

/** The Storage object path; identical segments to the clip document so one rule set binds both. */
export function filmShotStoragePathV1(uid: string, shotId: string, slotId: string): string {
  return `users/${requireUid(uid)}/filmShots/${requireShotId(shotId)}/${requireSlotId(slotId)}`;
}

function canonicalClipOrder(clips: readonly FilmShotCloudClipInputV1[]): FilmShotCloudClipInputV1[] {
  return [...clips].sort((left, right) => {
    const leftView = left.view === "front" ? 0 : 1;
    const rightView = right.view === "front" ? 0 : 1;
    return leftView - rightView || left.takeIndex - right.takeIndex;
  });
}

function validateClipInput(clip: FilmShotCloudClipInputV1, name: string): FilmShotCloudClipInputV1 {
  const slotId = requireSlotId(clip.slotId);
  const identity = slotIdentity(slotId);
  if (clip.view !== identity.view || clip.takeIndex !== identity.takeIndex) throw new Error(`${name} view and take must match the slot ID`);
  return {
    slotId,
    view: identity.view,
    takeIndex: identity.takeIndex,
    durationMs: requireBoundedInteger(clip.durationMs, FILM_SHOT_MIN_DURATION_MS_V1, FILM_SHOT_MAX_DURATION_MS_V1, `${name} durationMs`),
    width: requireBoundedInteger(clip.width, FILM_SHOT_MIN_EDGE_PX_V1, FILM_SHOT_MAX_EDGE_PX_V1, `${name} width`),
    height: requireBoundedInteger(clip.height, FILM_SHOT_MIN_EDGE_PX_V1, FILM_SHOT_MAX_EDGE_PX_V1, `${name} height`),
    byteLength: requireBoundedInteger(clip.byteLength, 1, FILM_SHOT_MAX_CLIP_BYTES_V1, `${name} byteLength`),
    contentType: requireContentType(clip.contentType),
  };
}

/**
 * Plans the writes for one cloud film shot: objects first (uploads), then one
 * clip document per clip, then the head. `timestamp` is the Firestore
 * serverTimestamp placeholder so no client clock is written.
 */
export function buildFilmShotWritePlanV1(args: {
  uid: string;
  shotId: string;
  title: string | undefined;
  clips: readonly FilmShotCloudClipInputV1[];
  timestamp: unknown;
}): FilmShotWritePlanV1 {
  const uid = requireUid(args.uid);
  const shotId = requireShotId(args.shotId);
  if (args.clips.length < 1 || args.clips.length > FILM_SHOT_MAX_CLIPS_V1) throw new Error("a film shot needs 1 to 6 clips");
  const clips = canonicalClipOrder(args.clips.map((clip, index) => validateClipInput(clip, `clip ${index}`)));
  const clipIds = clips.map((clip) => clip.slotId);
  if (new Set(clipIds).size !== clipIds.length) throw new Error("film shot clip slot IDs must be unique");
  const title = typeof args.title === "string" && FILM_SHOT_TITLE_PATTERN_V1.test(args.title) ? args.title : FILM_SHOT_DEFAULT_TITLE_V1;
  const common = (recordType: string): UnknownRecord => ({
    ownerUid: uid,
    schemaVersion: FILM_SHOT_SCHEMA_VERSION_V1,
    recordType,
    boundary: FILM_SHOT_BOUNDARY_V1,
    dataClass: FILM_SHOT_DATA_CLASS_V1,
    retentionClass: FILM_SHOT_RETENTION_CLASS_V1,
    consentReference: FILM_SHOT_CONSENT_REFERENCE_V1,
    createdAt: args.timestamp,
    updatedAt: args.timestamp,
  });
  return {
    shotId,
    title,
    objectUploads: clips.map((clip) => ({ slotId: clip.slotId, storagePath: filmShotStoragePathV1(uid, shotId, clip.slotId), contentType: clip.contentType })),
    clipWrites: clips.map((clip) => ({
      path: filmShotClipPathV1(uid, shotId, clip.slotId),
      data: {
        ...common(FILM_SHOT_CLIP_RECORD_TYPE_V1),
        shotId,
        slotId: clip.slotId,
        view: clip.view,
        takeIndex: clip.takeIndex,
        durationMs: clip.durationMs,
        width: clip.width,
        height: clip.height,
        byteLength: clip.byteLength,
        contentType: clip.contentType,
        storagePath: filmShotStoragePathV1(uid, shotId, clip.slotId),
      },
    })),
    headWrite: {
      path: filmShotHeadPathV1(uid, shotId),
      data: {
        ...common(FILM_SHOT_HEAD_RECORD_TYPE_V1),
        status: "complete",
        deletionState: "active",
        shotId,
        title,
        clipIds,
        clipCount: clipIds.length,
      },
    },
  };
}

/** Validates a head document read back from Firestore against its path. Throws on any drift. */
export function validateFilmShotHeadV1(value: unknown, uid: string, shotId: string): FilmShotHeadV1 {
  const head = requireRecord(value, "film shot head");
  assertExactKeys(head, HEAD_KEYS, "film shot head");
  const ownerUid = requireUid(uid);
  const expectedShotId = requireShotId(shotId);
  validateCommon(head, ownerUid, FILM_SHOT_HEAD_RECORD_TYPE_V1, "film shot head");
  if (head.shotId !== expectedShotId || head.status !== "complete") throw new Error("film shot head path identity is invalid");
  if (head.deletionState !== "active" && head.deletionState !== "in_progress") throw new Error("film shot head deletion state is invalid");
  const title = requireTitle(head.title);
  const clipIds = requireClipIds(head.clipIds);
  if (head.clipCount !== clipIds.length) throw new Error("film shot head clip count does not match its clip IDs");
  return {
    ownerUid,
    schemaVersion: FILM_SHOT_SCHEMA_VERSION_V1,
    recordType: FILM_SHOT_HEAD_RECORD_TYPE_V1,
    boundary: FILM_SHOT_BOUNDARY_V1,
    dataClass: FILM_SHOT_DATA_CLASS_V1,
    retentionClass: FILM_SHOT_RETENTION_CLASS_V1,
    consentReference: FILM_SHOT_CONSENT_REFERENCE_V1,
    createdAt: head.createdAt,
    updatedAt: head.updatedAt,
    status: "complete",
    deletionState: head.deletionState,
    shotId: expectedShotId,
    title,
    clipIds,
    clipCount: clipIds.length,
  };
}

/** Validates a clip document read back from Firestore against its path and the owner's storage path. */
export function validateFilmShotClipV1(value: unknown, uid: string, shotId: string, slotId: string): FilmShotClipDocumentV1 {
  const clip = requireRecord(value, "film shot clip");
  assertExactKeys(clip, CLIP_KEYS, "film shot clip");
  const ownerUid = requireUid(uid);
  const expectedShotId = requireShotId(shotId);
  const expectedSlotId = requireSlotId(slotId);
  validateCommon(clip, ownerUid, FILM_SHOT_CLIP_RECORD_TYPE_V1, "film shot clip");
  if (clip.shotId !== expectedShotId || clip.slotId !== expectedSlotId) throw new Error("film shot clip path identity is invalid");
  const identity = slotIdentity(expectedSlotId);
  if (clip.view !== identity.view || clip.takeIndex !== identity.takeIndex) throw new Error("film shot clip view and take must match the slot ID");
  const storagePath = filmShotStoragePathV1(ownerUid, expectedShotId, expectedSlotId);
  if (clip.storagePath !== storagePath) throw new Error("film shot clip storage path must be the owner's own object");
  return {
    ownerUid,
    schemaVersion: FILM_SHOT_SCHEMA_VERSION_V1,
    recordType: FILM_SHOT_CLIP_RECORD_TYPE_V1,
    boundary: FILM_SHOT_BOUNDARY_V1,
    dataClass: FILM_SHOT_DATA_CLASS_V1,
    retentionClass: FILM_SHOT_RETENTION_CLASS_V1,
    consentReference: FILM_SHOT_CONSENT_REFERENCE_V1,
    createdAt: clip.createdAt,
    updatedAt: clip.updatedAt,
    shotId: expectedShotId,
    slotId: expectedSlotId,
    view: identity.view,
    takeIndex: identity.takeIndex,
    durationMs: requireBoundedInteger(clip.durationMs, FILM_SHOT_MIN_DURATION_MS_V1, FILM_SHOT_MAX_DURATION_MS_V1, "film shot clip durationMs"),
    width: requireBoundedInteger(clip.width, FILM_SHOT_MIN_EDGE_PX_V1, FILM_SHOT_MAX_EDGE_PX_V1, "film shot clip width"),
    height: requireBoundedInteger(clip.height, FILM_SHOT_MIN_EDGE_PX_V1, FILM_SHOT_MAX_EDGE_PX_V1, "film shot clip height"),
    byteLength: requireBoundedInteger(clip.byteLength, 1, FILM_SHOT_MAX_CLIP_BYTES_V1, "film shot clip byteLength"),
    contentType: requireContentType(clip.contentType),
    storagePath,
  };
}
