import { doc, writeBatch, type Firestore } from "firebase/firestore";
import { getBytes, getStorage, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";

import type { LocalFilmClipRefV1, LocalFilmViewV1 } from "@/lib/film-space/types";
import { firebaseApp, firestore } from "@/lib/firebase";
import {
  FILM_SHOT_CONTENT_TYPES_V1,
  buildFilmShotWritePlanV1,
  filmShotClipPathV1,
  filmShotHeadPathV1,
  validateFilmShotClipV1,
  validateFilmShotHeadV1,
  type FilmShotCloudClipInputV1,
  type FilmShotContentTypeV1,
} from "@/lib/firebase-film-shot-contract";
import {
  createFirebaseFilmShotDeletionPortsV1,
  deleteCloudFilmShotV1,
  filmShotTimestampMillisV1,
  type FilmShotCloudDeletionPortsV1,
  type FilmShotCloudDocumentV1,
} from "@/lib/firebase-film-shot-deletion";

export {
  deleteCloudFilmShotV1,
  resumePendingCloudFilmShotDeletionsV1,
  type FilmShotCloudDocumentV1,
} from "@/lib/firebase-film-shot-deletion";

/**
 * CLOUD FILM SHOTS (v1): the owner's own footage, kept in their private
 * Firebase Storage prefix only when they opted in for that shot. This module
 * sends and fetches one shot against injectable ports: the head first, as
 * `uploading`, so a document names every object before it exists; then the
 * objects, one clip document per clip, and the completion. Every failure runs
 * the deletion (lib/firebase-film-shot-deletion.ts); reads validate and fail
 * closed. The Firebase adapter is at the bottom. Nothing here carries a file
 * name, EXIF or landmarks, and this module is only loaded by a build that
 * opted in (see lib/film-shot-cloud-source.ts).
 */

export type FilmShotCloudPortsV1 = FilmShotCloudDeletionPortsV1 & Readonly<{
  uploadObject(storagePath: string, data: Blob, contentType: string): Promise<void>;
  downloadObject(storagePath: string): Promise<Blob>;
  setDocument(path: string, data: Record<string, unknown>): Promise<void>;
}>;

export type CloudFilmShotInputV1 = Readonly<{ id: string; title: string; clips: readonly LocalFilmClipRefV1[] }>;

export type CloudFilmShotHeadSummaryV1 = Readonly<{ shotId: string; title: string; clipIds: readonly string[]; createdAtMs: number }>;

export type CloudFilmShotDownloadedClipV1 = Readonly<{
  slotId: string;
  view: LocalFilmViewV1;
  takeIndex: number;
  durationMs: number;
  width: number;
  height: number;
  blob: Blob;
}>;

export type CloudFilmShotDownloadV1 = Readonly<{ shotId: string; title: string; clips: readonly CloudFilmShotDownloadedClipV1[] }>;

const REMOTE_URI = /^https?:/i;

function contentTypeOf(blob: Blob): FilmShotContentTypeV1 {
  return (FILM_SHOT_CONTENT_TYPES_V1 as readonly string[]).includes(blob.type) ? (blob.type as FilmShotContentTypeV1) : "video/mp4";
}

/**
 * Keeps one film shot in the cloud. Refuses before the first call when a clip
 * has no file or is not device-local. A shot that is already kept is left as
 * it is; a head left by an earlier attempt is erased first. Any failure erases
 * what this attempt wrote; if that erasure fails too, the head stays behind
 * as the journal and a later pass finishes it. A completion whose
 * acknowledgement was lost is accepted when the head reads back kept.
 */
export async function uploadFilmShotV1(args: {
  uid: string;
  shot: CloudFilmShotInputV1;
  files: Readonly<Record<string, Blob>>;
  ports: FilmShotCloudPortsV1;
}): Promise<void> {
  const { uid, shot, files, ports } = args;
  const inputs: FilmShotCloudClipInputV1[] = shot.clips.map((clip) => {
    const file = files[clip.slotId];
    if (!(file instanceof Blob)) throw new Error("every film shot clip needs its file to be kept in the cloud");
    if (typeof clip.uri !== "string" || REMOTE_URI.test(clip.uri)) throw new Error("film shot clips must be device-local before they are kept in the cloud");
    return {
      slotId: clip.slotId,
      view: clip.view,
      takeIndex: clip.takeIndex,
      durationMs: Math.round(clip.durationMs),
      width: Math.round(clip.width),
      height: Math.round(clip.height),
      byteLength: file.size,
      contentType: contentTypeOf(file),
    };
  });
  const plan = buildFilmShotWritePlanV1({ uid, shotId: shot.id, title: shot.title, clips: inputs, timestamp: ports.serverTimestamp() });
  const headPath = plan.headCreate.path;

  const isKept = (document: FilmShotCloudDocumentV1): boolean => {
    const head = validateFilmShotHeadV1(document.data, uid, plan.shotId);
    return head.status === "complete" && head.deletionState === "active";
  };
  const abandon = async (): Promise<void> => {
    try {
      await deleteCloudFilmShotV1({ uid, shotId: plan.shotId, ports });
    } catch {
      // The head stays behind as the journal; the next deletion pass finishes it. The original error is what matters.
    }
  };

  const earlier = await ports.readDocumentFromServer(headPath);
  if (earlier) {
    if (isKept(earlier)) return;
    // An unfinished or half-deleted earlier attempt: erase it, then start clean.
    await deleteCloudFilmShotV1({ uid, shotId: plan.shotId, ports });
  }

  try {
    await ports.setDocument(headPath, plan.headCreate.data);
    for (const upload of plan.objectUploads) {
      await ports.uploadObject(upload.storagePath, files[upload.slotId], upload.contentType);
    }
    for (const write of plan.clipWrites) {
      await ports.setDocument(write.path, write.data);
    }
  } catch (error) {
    await abandon();
    throw error;
  }

  try {
    await ports.updateDocument(plan.headComplete.path, plan.headComplete.data);
  } catch (error) {
    let kept = false;
    try {
      const persisted = await ports.readDocumentFromServer(headPath);
      kept = persisted !== null && isKept(persisted);
    } catch {
      kept = false;
    }
    if (kept) return;
    await abandon();
    throw error;
  }
}

/** Kept shots, newest first. Malformed, unfinished or in-progress documents are never exposed. */
export async function listCloudFilmShotsV1(args: { uid: string; ports: FilmShotCloudPortsV1 }): Promise<CloudFilmShotHeadSummaryV1[]> {
  const { uid, ports } = args;
  const documents = await ports.listDocuments(`users/${uid}/filmShots`);
  const summaries: CloudFilmShotHeadSummaryV1[] = [];
  for (const document of documents) {
    try {
      const head = validateFilmShotHeadV1(document.data, uid, document.id);
      if (head.status !== "complete" || head.deletionState !== "active") continue;
      summaries.push({ shotId: head.shotId, title: head.title, clipIds: head.clipIds, createdAtMs: filmShotTimestampMillisV1(head.createdAt) });
    } catch {
      // Fail closed: a document that does not match the contract is not a shot.
    }
  }
  return summaries.sort((left, right) => right.createdAtMs - left.createdAtMs);
}

/** The shot's clips with their files, each validated against its document before the bytes are read. */
export async function downloadCloudFilmShotV1(args: { uid: string; shotId: string; ports: FilmShotCloudPortsV1 }): Promise<CloudFilmShotDownloadV1> {
  const { uid, shotId, ports } = args;
  const headPath = filmShotHeadPathV1(uid, shotId);
  const headDocument = await ports.readDocumentFromServer(headPath);
  if (!headDocument) throw new Error("cloud film shot not found");
  const head = validateFilmShotHeadV1(headDocument.data, uid, shotId);
  if (head.status !== "complete") throw new Error("cloud film shot upload is not finished");
  if (head.deletionState !== "active") throw new Error("cloud film shot is being deleted");
  const clips: CloudFilmShotDownloadedClipV1[] = [];
  for (const slotId of head.clipIds) {
    const clipDocument = await ports.readDocumentFromServer(filmShotClipPathV1(uid, shotId, slotId));
    if (!clipDocument) throw new Error("cloud film shot clip document is missing");
    const clip = validateFilmShotClipV1(clipDocument.data, uid, shotId, slotId);
    const raw = await ports.downloadObject(clip.storagePath);
    if (raw.size !== clip.byteLength) throw new Error("cloud film shot clip size does not match its document");
    const blob = raw.type === clip.contentType ? raw : new Blob([await raw.arrayBuffer()], { type: clip.contentType });
    clips.push({ slotId, view: clip.view, takeIndex: clip.takeIndex, durationMs: clip.durationMs, width: clip.width, height: clip.height, blob });
  }
  return { shotId, title: head.title, clips };
}

// ---- Firebase adapter ----

/** Production ports over the configured Firebase app: the delete-only ports plus sending and fetching. */
export function createFirebaseFilmShotCloudPortsV1(): FilmShotCloudPortsV1 {
  const db: Firestore | null = firestore;
  if (!firebaseApp || !db) throw new Error("Firebase Storage/Firestore 연결 설정이 아직 완료되지 않았습니다.");
  const storage: FirebaseStorage = getStorage(firebaseApp);
  return {
    ...createFirebaseFilmShotDeletionPortsV1(),
    uploadObject: async (storagePath, data, contentType) => {
      await uploadBytes(ref(storage, storagePath), data, { contentType });
    },
    downloadObject: async (storagePath) => new Blob([await getBytes(ref(storage, storagePath))]),
    setDocument: async (path, data) => {
      const batch = writeBatch(db);
      batch.set(doc(db, path), data);
      await batch.commit();
    },
  };
}
