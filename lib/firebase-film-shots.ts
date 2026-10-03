import { collection, doc, getDocFromServer, getDocsFromServer, serverTimestamp, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
import { deleteObject as deleteStorageObject, getBytes, getStorage, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";

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

/**
 * CLOUD FILM SHOTS (v1): the owner's own footage, kept in their private
 * Firebase Storage prefix only when they opted in for that shot. This module
 * orchestrates one shot against injectable ports: objects first, then one
 * clip document per clip, then the head; every failure cleans up what it
 * knows it wrote; reads validate and fail closed; deletion mirrors creation
 * and is resumable. The Firebase adapter is at the bottom. Nothing here
 * carries a file name, EXIF or landmarks, and nothing runs in the preview
 * build (see lib/film-shot-cloud-source.ts).
 */

export type FilmShotCloudDocumentV1 = Readonly<{ id: string; data: unknown }>;

export type FilmShotCloudPortsV1 = Readonly<{
  serverTimestamp(): unknown;
  uploadObject(storagePath: string, data: Blob, contentType: string): Promise<void>;
  deleteObject(storagePath: string): Promise<void>;
  downloadObject(storagePath: string): Promise<Blob>;
  setDocument(path: string, data: Record<string, unknown>): Promise<void>;
  updateDocument(path: string, data: Record<string, unknown>): Promise<void>;
  deleteDocument(path: string): Promise<void>;
  readDocumentFromServer(path: string): Promise<FilmShotCloudDocumentV1 | null>;
  listDocuments(collectionPath: string): Promise<FilmShotCloudDocumentV1[]>;
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

function timestampMillis(value: unknown): number {
  return typeof value === "object" && value !== null && typeof (value as { toMillis?: unknown }).toMillis === "function"
    ? Number((value as { toMillis(): number }).toMillis())
    : 0;
}

async function cleanupKnownPaths(paths: readonly string[], remove: (path: string) => Promise<void>): Promise<void> {
  for (const path of [...new Set(paths)].reverse()) {
    try {
      await remove(path);
    } catch {
      // A cleanup failure must not mask the original error; the next deletion pass can retry.
    }
  }
}

/**
 * Uploads one film shot: every clip's file first, then the clip documents,
 * then the head. Refuses before the first call when a clip has no file or is
 * not device-local. A head write whose acknowledgement was lost is accepted
 * when the head reads back valid and active.
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

  const uploadedObjects: string[] = [];
  for (const upload of plan.objectUploads) {
    try {
      await ports.uploadObject(upload.storagePath, files[upload.slotId], upload.contentType);
      uploadedObjects.push(upload.storagePath);
    } catch (error) {
      await cleanupKnownPaths(uploadedObjects, ports.deleteObject);
      throw error;
    }
  }

  const writtenClips: string[] = [];
  for (const write of plan.clipWrites) {
    try {
      await ports.setDocument(write.path, write.data);
      writtenClips.push(write.path);
    } catch (error) {
      await cleanupKnownPaths(writtenClips, ports.deleteDocument);
      await cleanupKnownPaths(uploadedObjects, ports.deleteObject);
      throw error;
    }
  }

  try {
    await ports.setDocument(plan.headWrite.path, plan.headWrite.data);
  } catch (error) {
    let published = false;
    try {
      const persisted = await ports.readDocumentFromServer(plan.headWrite.path);
      if (persisted) {
        const head = validateFilmShotHeadV1(persisted.data, uid, plan.shotId);
        published = head.deletionState === "active";
      }
    } catch {
      published = false;
    }
    if (published) return;
    await cleanupKnownPaths(writtenClips, ports.deleteDocument);
    await cleanupKnownPaths(uploadedObjects, ports.deleteObject);
    throw error;
  }
}

/** Active heads, newest first. Malformed or in-progress documents are never exposed. */
export async function listCloudFilmShotsV1(args: { uid: string; ports: FilmShotCloudPortsV1 }): Promise<CloudFilmShotHeadSummaryV1[]> {
  const { uid, ports } = args;
  const documents = await ports.listDocuments(`users/${uid}/filmShots`);
  const summaries: CloudFilmShotHeadSummaryV1[] = [];
  for (const document of documents) {
    try {
      const head = validateFilmShotHeadV1(document.data, uid, document.id);
      if (head.deletionState !== "active") continue;
      summaries.push({ shotId: head.shotId, title: head.title, clipIds: head.clipIds, createdAtMs: timestampMillis(head.createdAt) });
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

/**
 * Deletes one shot: head active → in_progress, then each clip's object and
 * document, then the head. A missing head is already deleted. A failure stops
 * before the head so a later pass can resume.
 */
export async function deleteCloudFilmShotV1(args: { uid: string; shotId: string; ports: FilmShotCloudPortsV1 }): Promise<void> {
  const { uid, shotId, ports } = args;
  const headPath = filmShotHeadPathV1(uid, shotId);
  const headDocument = await ports.readDocumentFromServer(headPath);
  if (!headDocument) return;
  const head = validateFilmShotHeadV1(headDocument.data, uid, shotId);
  if (head.deletionState === "active") {
    await ports.updateDocument(headPath, { deletionState: "in_progress", updatedAt: ports.serverTimestamp() });
  }
  for (const slotId of head.clipIds) {
    const clipPath = filmShotClipPathV1(uid, shotId, slotId);
    const clipDocument = await ports.readDocumentFromServer(clipPath);
    if (clipDocument) {
      const clip = validateFilmShotClipV1(clipDocument.data, uid, shotId, slotId);
      await ports.deleteObject(clip.storagePath);
      await ports.deleteDocument(clipPath);
    }
  }
  await ports.deleteDocument(headPath);
}

/** Finishes every deletion a previous session left in progress. */
export async function resumePendingCloudFilmShotDeletionsV1(args: {
  uid: string;
  ports: FilmShotCloudPortsV1;
  onDeleted?: (shotId: string) => void;
}): Promise<void> {
  const { uid, ports } = args;
  const documents = await ports.listDocuments(`users/${uid}/filmShots`);
  const pending: string[] = [];
  for (const document of documents) {
    try {
      const head = validateFilmShotHeadV1(document.data, uid, document.id);
      if (head.deletionState === "in_progress") pending.push(head.shotId);
    } catch {
      // Not a shot of ours to finish.
    }
  }
  for (const shotId of pending.sort()) {
    await deleteCloudFilmShotV1({ uid, shotId, ports });
    args.onDeleted?.(shotId);
  }
}

// ---- Firebase adapter ----

function isObjectNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "storage/object-not-found";
}

/** Production ports over the configured Firebase app. Throws when Firebase is not configured. */
export function createFirebaseFilmShotCloudPortsV1(): FilmShotCloudPortsV1 {
  const db: Firestore | null = firestore;
  if (!firebaseApp || !db) throw new Error("Firebase Storage/Firestore 연결 설정이 아직 완료되지 않았습니다.");
  const storage: FirebaseStorage = getStorage(firebaseApp);
  return {
    serverTimestamp: () => serverTimestamp(),
    uploadObject: async (storagePath, data, contentType) => {
      await uploadBytes(ref(storage, storagePath), data, { contentType });
    },
    deleteObject: async (storagePath) => {
      try {
        await deleteStorageObject(ref(storage, storagePath));
      } catch (error) {
        if (!isObjectNotFound(error)) throw error;
      }
    },
    downloadObject: async (storagePath) => new Blob([await getBytes(ref(storage, storagePath))]),
    setDocument: async (path, data) => {
      const batch = writeBatch(db);
      batch.set(doc(db, path), data);
      await batch.commit();
    },
    updateDocument: async (path, data) => {
      await updateDoc(doc(db, path), data);
    },
    deleteDocument: async (path) => {
      const batch = writeBatch(db);
      batch.delete(doc(db, path));
      await batch.commit();
    },
    readDocumentFromServer: async (path) => {
      const snapshot = await getDocFromServer(doc(db, path));
      return snapshot.exists() ? { id: snapshot.id, data: snapshot.data() } : null;
    },
    listDocuments: async (collectionPath) => {
      const result = await getDocsFromServer(collection(db, collectionPath));
      return result.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() }));
    },
  };
}
