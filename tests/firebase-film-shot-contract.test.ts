import { serverTimestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import {
  FILM_SHOT_BOUNDARY_V1,
  FILM_SHOT_CLIP_RECORD_TYPE_V1,
  FILM_SHOT_CONSENT_REFERENCE_V1,
  FILM_SHOT_DATA_CLASS_V1,
  FILM_SHOT_HEAD_RECORD_TYPE_V1,
  FILM_SHOT_MAX_CLIP_BYTES_V1,
  FILM_SHOT_RETENTION_CLASS_V1,
  FILM_SHOT_SCHEMA_VERSION_V1,
  FILM_SHOT_TITLE_PATTERN_V1,
  buildFilmShotWritePlanV1,
  filmShotClipPathV1,
  filmShotHeadPathV1,
  filmShotStoragePathV1,
  validateFilmShotClipV1,
  validateFilmShotHeadV1,
  type FilmShotCloudClipInputV1,
} from "@/lib/firebase-film-shot-contract";

/**
 * Cloud film shots: the owner's own footage, kept in their private Storage
 * path with one Firestore document per clip and one head, only when they
 * opted in for that shot. The contract is the single source of the shapes the
 * rules enforce; nothing here names a file or carries landmarks.
 */

const UID = "owner-uid-0001";
const SHOT = "film-shot-abc123-1";
const clip = (slotId: string, overrides: Partial<FilmShotCloudClipInputV1> = {}): FilmShotCloudClipInputV1 => {
  const [view, take] = slotId.split("-") as ["front" | "shooting_side", string];
  return { slotId, view, takeIndex: Number(take), durationMs: 4433, width: 1080, height: 1920, byteLength: 2_824_524, contentType: "video/mp4", ...overrides };
};
const timestamp = { toMillis: () => 1_700_000_000_000, toDate: () => new Date(1_700_000_000_000) };
const common = (recordType: string) => ({
  ownerUid: UID,
  schemaVersion: FILM_SHOT_SCHEMA_VERSION_V1,
  recordType,
  boundary: FILM_SHOT_BOUNDARY_V1,
  dataClass: FILM_SHOT_DATA_CLASS_V1,
  retentionClass: FILM_SHOT_RETENTION_CLASS_V1,
  consentReference: FILM_SHOT_CONSENT_REFERENCE_V1,
  createdAt: timestamp,
  updatedAt: timestamp,
});
const head = (overrides: Record<string, unknown> = {}) => ({
  ...common(FILM_SHOT_HEAD_RECORD_TYPE_V1),
  status: "complete",
  deletionState: "active",
  shotId: SHOT,
  title: "내 슛폼 1",
  clipIds: ["front-0", "shooting_side-0"],
  clipCount: 2,
  ...overrides,
});
const clipDocument = (slotId: string, overrides: Record<string, unknown> = {}) => ({
  ...common(FILM_SHOT_CLIP_RECORD_TYPE_V1),
  shotId: SHOT,
  slotId,
  view: slotId.startsWith("front") ? "front" : "shooting_side",
  takeIndex: Number(slotId.split("-")[1]),
  durationMs: 4433,
  width: 1080,
  height: 1920,
  byteLength: 2_824_524,
  contentType: "video/mp4",
  storagePath: `users/${UID}/filmShots/${SHOT}/${slotId}`,
  ...overrides,
});

describe("film shot cloud contract", () => {
  it("names the owner-only paths and the constants the rules pin", () => {
    expect(filmShotStoragePathV1(UID, SHOT, "front-0")).toBe(`users/${UID}/filmShots/${SHOT}/front-0`);
    expect(filmShotHeadPathV1(UID, SHOT)).toBe(`users/${UID}/filmShots/${SHOT}`);
    expect(filmShotClipPathV1(UID, SHOT, "shooting_side-0")).toBe(`users/${UID}/filmShots/${SHOT}/clips/shooting_side-0`);
    expect(FILM_SHOT_SCHEMA_VERSION_V1).toBe(1);
    expect(FILM_SHOT_MAX_CLIP_BYTES_V1).toBe(64 * 1024 * 1024);
    expect(FILM_SHOT_BOUNDARY_V1).toBe("owner_footage_only_no_pose_analysis_v1");
    expect(FILM_SHOT_DATA_CLASS_V1).toBe("owner_private_raw_footage_v1");
    expect(FILM_SHOT_CONSENT_REFERENCE_V1).toBe("owner_cloud_footage_consent_v1");
    expect(FILM_SHOT_TITLE_PATTERN_V1.test("내 슛폼 1")).toBe(true);
    expect(FILM_SHOT_TITLE_PATTERN_V1.test("IMG_8680.mp4")).toBe(false);
    for (const bad of ["a/b", "..", "", "x".repeat(129)]) {
      expect(() => filmShotStoragePathV1(UID, bad, "front-0"), bad).toThrow();
    }
    expect(() => filmShotStoragePathV1(UID, SHOT, "sideways-0")).toThrow();
  });

  it("plans uploads first, then one clip document per clip, then the head, with exact keys and server timestamps", () => {
    const plan = buildFilmShotWritePlanV1({
      uid: UID,
      shotId: SHOT,
      title: "내 슛폼 1",
      clips: [clip("shooting_side-0", { durationMs: 3433, byteLength: 2_300_000 }), clip("front-0")],
      timestamp: serverTimestamp(),
    });
    expect(plan.shotId).toBe(SHOT);
    expect(plan.title).toBe("내 슛폼 1");
    // Canonical order: front before side, takes ascending.
    expect(plan.objectUploads.map((upload) => upload.slotId)).toEqual(["front-0", "shooting_side-0"]);
    expect(plan.objectUploads[0]).toEqual({ slotId: "front-0", storagePath: `users/${UID}/filmShots/${SHOT}/front-0`, contentType: "video/mp4" });
    expect(plan.clipWrites.map((write) => write.path)).toEqual([
      `users/${UID}/filmShots/${SHOT}/clips/front-0`,
      `users/${UID}/filmShots/${SHOT}/clips/shooting_side-0`,
    ]);
    const side = plan.clipWrites[1].data;
    expect(Object.keys(side).sort()).toEqual([
      "boundary", "byteLength", "consentReference", "contentType", "createdAt", "dataClass", "durationMs", "height",
      "ownerUid", "recordType", "retentionClass", "schemaVersion", "shotId", "slotId", "storagePath", "takeIndex", "updatedAt", "view", "width",
    ]);
    expect(side).toMatchObject({ ownerUid: UID, schemaVersion: 1, recordType: FILM_SHOT_CLIP_RECORD_TYPE_V1, shotId: SHOT, slotId: "shooting_side-0", view: "shooting_side", takeIndex: 0, durationMs: 3433, byteLength: 2_300_000, contentType: "video/mp4", storagePath: `users/${UID}/filmShots/${SHOT}/shooting_side-0` });
    expect(plan.headWrite.path).toBe(`users/${UID}/filmShots/${SHOT}`);
    expect(Object.keys(plan.headWrite.data).sort()).toEqual([
      "boundary", "clipCount", "clipIds", "consentReference", "createdAt", "dataClass", "deletionState", "ownerUid",
      "recordType", "retentionClass", "schemaVersion", "shotId", "status", "title", "updatedAt",
    ]);
    expect(plan.headWrite.data).toMatchObject({ recordType: FILM_SHOT_HEAD_RECORD_TYPE_V1, status: "complete", deletionState: "active", clipIds: ["front-0", "shooting_side-0"], clipCount: 2, title: "내 슛폼 1" });
    // Server timestamps, never a client clock.
    const stamp = serverTimestamp();
    for (const write of [...plan.clipWrites, plan.headWrite]) {
      expect((write.data.createdAt as { isEqual(other: unknown): boolean }).isEqual(stamp)).toBe(true);
      expect((write.data.updatedAt as { isEqual(other: unknown): boolean }).isEqual(stamp)).toBe(true);
    }
    expect(JSON.stringify(plan)).not.toMatch(/\.mp4|IMG_|blob:|file:/);
  });

  it("falls back to a plain title and refuses malformed clips", () => {
    const named = buildFilmShotWritePlanV1({ uid: UID, shotId: SHOT, title: "IMG_8680.mp4", clips: [clip("front-0")], timestamp: serverTimestamp() });
    expect(named.title).toBe("내 슛폼");
    const base = { uid: UID, shotId: SHOT, title: "내 슛폼 1", timestamp: serverTimestamp() };
    expect(() => buildFilmShotWritePlanV1({ ...base, clips: [] })).toThrow();
    expect(() => buildFilmShotWritePlanV1({ ...base, clips: [clip("front-0"), clip("front-0")] })).toThrow();
    expect(() => buildFilmShotWritePlanV1({ ...base, clips: ["front-0", "front-1", "front-2", "shooting_side-0", "shooting_side-1", "shooting_side-2", "front-0"].map((id) => clip(id)) })).toThrow();
    expect(() => buildFilmShotWritePlanV1({ ...base, clips: [clip("front-0", { view: "shooting_side" })] })).toThrow();
    expect(() => buildFilmShotWritePlanV1({ ...base, clips: [clip("front-0", { takeIndex: 1 })] })).toThrow();
    expect(() => buildFilmShotWritePlanV1({ ...base, clips: [clip("front-0", { durationMs: 100 })] })).toThrow();
    expect(() => buildFilmShotWritePlanV1({ ...base, clips: [clip("front-0", { durationMs: 60_001 })] })).toThrow();
    expect(() => buildFilmShotWritePlanV1({ ...base, clips: [clip("front-0", { byteLength: 0 })] })).toThrow();
    expect(() => buildFilmShotWritePlanV1({ ...base, clips: [clip("front-0", { byteLength: FILM_SHOT_MAX_CLIP_BYTES_V1 + 1 })] })).toThrow();
    expect(() => buildFilmShotWritePlanV1({ ...base, clips: [clip("front-0", { width: 8 })] })).toThrow();
    expect(() => buildFilmShotWritePlanV1({ ...base, clips: [clip("front-0", { contentType: "image/png" as never })] })).toThrow();
    expect(() => buildFilmShotWritePlanV1({ ...base, shotId: "bad/id", clips: [clip("front-0")] })).toThrow();
    expect(() => buildFilmShotWritePlanV1({ ...base, uid: "", clips: [clip("front-0")] })).toThrow();
  });

  it("validates a head document and refuses every drift", () => {
    const valid = validateFilmShotHeadV1(head(), UID, SHOT);
    expect(valid.clipIds).toEqual(["front-0", "shooting_side-0"]);
    expect(valid.deletionState).toBe("active");
    for (const [label, bad] of Object.entries({
      otherOwner: head({ ownerUid: "someone-else" }),
      otherShot: head({ shotId: "other" }),
      wrongType: head({ recordType: FILM_SHOT_CLIP_RECORD_TYPE_V1 }),
      extraKey: head({ fileName: "a.mp4" }),
      missingKey: (() => { const { title: _t, ...rest } = head(); return rest; })(),
      badTitle: head({ title: "shot.mp4" }),
      longTitle: head({ title: "x".repeat(25) }),
      duplicateClips: head({ clipIds: ["front-0", "front-0"], clipCount: 2 }),
      countMismatch: head({ clipCount: 1 }),
      badSlot: head({ clipIds: ["front-9"], clipCount: 1 }),
      tooMany: head({ clipIds: ["front-0", "front-1", "front-2", "shooting_side-0", "shooting_side-1", "shooting_side-2", "front-0"], clipCount: 7 }),
      badState: head({ deletionState: "deleted" }),
      badStatus: head({ status: "pending" }),
      badVersion: head({ schemaVersion: 2 }),
      badTimestamp: head({ createdAt: "2026-10-04" }),
    })) {
      expect(() => validateFilmShotHeadV1(bad, UID, SHOT), label).toThrow();
    }
    expect(validateFilmShotHeadV1(head({ deletionState: "in_progress" }), UID, SHOT).deletionState).toBe("in_progress");
  });

  it("validates a clip document against its path and refuses every drift", () => {
    const valid = validateFilmShotClipV1(clipDocument("front-0"), UID, SHOT, "front-0");
    expect(valid.storagePath).toBe(`users/${UID}/filmShots/${SHOT}/front-0`);
    for (const [label, bad] of Object.entries({
      otherOwner: clipDocument("front-0", { ownerUid: "someone-else" }),
      pathMismatch: clipDocument("front-0", { slotId: "front-1" }),
      viewMismatch: clipDocument("front-0", { view: "shooting_side" }),
      takeMismatch: clipDocument("front-0", { takeIndex: 1 }),
      storagePath: clipDocument("front-0", { storagePath: `users/${UID}/filmShots/${SHOT}/front-1` }),
      foreignPath: clipDocument("front-0", { storagePath: `users/other/filmShots/${SHOT}/front-0` }),
      extraKey: clipDocument("front-0", { fileName: "a.mp4" }),
      shortClip: clipDocument("front-0", { durationMs: 100 }),
      tooBig: clipDocument("front-0", { byteLength: FILM_SHOT_MAX_CLIP_BYTES_V1 + 1 }),
      badType: clipDocument("front-0", { contentType: "image/png" }),
      wrongRecord: clipDocument("front-0", { recordType: FILM_SHOT_HEAD_RECORD_TYPE_V1 }),
    })) {
      expect(() => validateFilmShotClipV1(bad, UID, SHOT, "front-0"), label).toThrow();
    }
  });
});
