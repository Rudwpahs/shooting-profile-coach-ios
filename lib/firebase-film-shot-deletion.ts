import { collection, doc, getDocFromServer, getDocsFromServer, serverTimestamp, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
import { deleteObject as deleteStorageObject, getStorage, ref } from "firebase/storage";

import { firebaseApp, firestore } from "@/lib/firebase";
import { filmShotClipPathV1, filmShotHeadPathV1, filmShotStoragePathV1, validateFilmShotHeadV1 } from "@/lib/firebase-film-shot-contract";

/**
 * CLOUD FILM SHOTS, DELETE-ONLY. Everything a client needs to erase the
 * owner's cloud footage and nothing that could send or fetch it. It ships in
 * every build, whatever the cloud flag says, because account deletion must
 * erase footage that another build of the app kept. The head is the journal:
 * it names every clip an upload may have written, so the object paths are
 * known without trusting, or even having, the clip documents.
 */

export type FilmShotCloudDocumentV1 = Readonly<{ id: string; data: unknown }>;

export type FilmShotCloudDeletionPortsV1 = Readonly<{
  serverTimestamp(): unknown;
  /** Removing an object that is already gone is a success. */
  deleteObject(storagePath: string): Promise<void>;
  updateDocument(path: string, data: Record<string, unknown>): Promise<void>;
  /** Removing a document that is already gone is a success. */
  deleteDocument(path: string): Promise<void>;
  readDocumentFromServer(path: string): Promise<FilmShotCloudDocumentV1 | null>;
  /** Throws FilmShotCloudNotDeployedError when the backend refuses the owner's own listing. */
  listDocuments(collectionPath: string): Promise<FilmShotCloudDocumentV1[]>;
}>;

/** An upload whose head has not changed for this long is abandoned: its tab or app is gone. */
export const FILM_SHOT_STALE_UPLOAD_MS_V1 = 2 * 60 * 60 * 1000;

const NOT_DEPLOYED_CODE = "film-shot-cloud/not-deployed";

/**
 * The owner may always list their own film shots where the feature's rules
 * are deployed. A refusal therefore means they are not, and no client could
 * ever have written footage for this account.
 */
export class FilmShotCloudNotDeployedError extends Error {
  readonly code = NOT_DEPLOYED_CODE;

  constructor() {
    super("cloud film shots are not deployed for this backend");
    this.name = "FilmShotCloudNotDeployedError";
  }
}

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
}

export function isFilmShotCloudNotDeployedError(error: unknown): boolean {
  return errorCode(error) === NOT_DEPLOYED_CODE;
}

/** Firestore refused the owner's own listing: the film-shot rules are not deployed. */
export function isFilmShotListingNotDeployedV1(error: unknown): boolean {
  return errorCode(error) === "permission-denied";
}

/** The object, or the whole bucket, is not there: nothing is left to erase at that path. */
export function isFilmShotObjectAlreadyAbsentV1(error: unknown): boolean {
  const code = errorCode(error);
  return code === "storage/object-not-found" || code === "storage/bucket-not-found" || code === "storage/project-not-found";
}

export function filmShotTimestampMillisV1(value: unknown): number {
  return typeof value === "object" && value !== null && typeof (value as { toMillis?: unknown }).toMillis === "function"
    ? Number((value as { toMillis(): number }).toMillis())
    : 0;
}

/**
 * Deletes one shot, kept or unfinished: head active → in_progress, then each
 * named clip's object and document, then the head. A missing head is already
 * deleted. A failure stops before the head so a later pass can resume.
 */
export async function deleteCloudFilmShotV1(args: { uid: string; shotId: string; ports: FilmShotCloudDeletionPortsV1 }): Promise<void> {
  const { uid, shotId, ports } = args;
  const headPath = filmShotHeadPathV1(uid, shotId);
  const headDocument = await ports.readDocumentFromServer(headPath);
  if (!headDocument) return;
  const head = validateFilmShotHeadV1(headDocument.data, uid, shotId);
  if (head.deletionState === "active") {
    await ports.updateDocument(headPath, { deletionState: "in_progress", updatedAt: ports.serverTimestamp() });
  }
  // The paths come from the head, not from the clip documents: an interrupted upload may have left an
  // object whose clip document was never written.
  for (const slotId of head.clipIds) {
    await ports.deleteObject(filmShotStoragePathV1(uid, shotId, slotId));
    await ports.deleteDocument(filmShotClipPathV1(uid, shotId, slotId));
  }
  await ports.deleteDocument(headPath);
}

/**
 * Finishes every deletion a previous session left in progress, and removes
 * uploads that went stale. A recent upload is left alone: it may still be
 * running in another tab or on another device.
 */
export async function resumePendingCloudFilmShotDeletionsV1(args: {
  uid: string;
  ports: FilmShotCloudDeletionPortsV1;
  onDeleted?: (shotId: string) => void;
  now?: () => number;
}): Promise<void> {
  const { uid, ports } = args;
  const cutoff = (args.now ?? Date.now)() - FILM_SHOT_STALE_UPLOAD_MS_V1;
  const documents = await ports.listDocuments(`users/${uid}/filmShots`);
  const pending: string[] = [];
  for (const document of documents) {
    try {
      const head = validateFilmShotHeadV1(document.data, uid, document.id);
      const staleUpload = head.status === "uploading" && filmShotTimestampMillisV1(head.updatedAt) < cutoff;
      if (head.deletionState === "in_progress" || staleUpload) pending.push(head.shotId);
    } catch {
      // Not a shot of ours to finish.
    }
  }
  for (const shotId of pending.sort()) {
    await deleteCloudFilmShotV1({ uid, shotId, ports });
    args.onDeleted?.(shotId);
  }
}

/**
 * Account deletion's cascade: every film shot the owner has in the cloud,
 * whatever its state or age. Any failure aborts, so the account is never
 * removed with footage left behind; a backend where the feature was never
 * deployed has nothing to erase.
 */
export async function eraseEveryCloudFilmShotV1(args: { uid: string; ports: FilmShotCloudDeletionPortsV1 }): Promise<void> {
  const { uid, ports } = args;
  let documents: FilmShotCloudDocumentV1[];
  try {
    documents = await ports.listDocuments(`users/${uid}/filmShots`);
  } catch (error) {
    if (isFilmShotCloudNotDeployedError(error)) return;
    throw error;
  }
  for (const shotId of documents.map((document) => document.id).sort()) {
    await deleteCloudFilmShotV1({ uid, shotId, ports });
  }
}

// ---- Firebase adapter (delete-only) ----

/** Production deletion ports over the configured Firebase app. Storage is only reached when a head names an object. */
export function createFirebaseFilmShotDeletionPortsV1(): FilmShotCloudDeletionPortsV1 {
  const app = firebaseApp;
  const db: Firestore | null = firestore;
  if (!app || !db) throw new Error("Firebase Storage/Firestore 연결 설정이 아직 완료되지 않았습니다.");
  return {
    serverTimestamp: () => serverTimestamp(),
    deleteObject: async (storagePath) => {
      try {
        await deleteStorageObject(ref(getStorage(app), storagePath));
      } catch (error) {
        if (!isFilmShotObjectAlreadyAbsentV1(error)) throw error;
      }
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
      try {
        const result = await getDocsFromServer(collection(db, collectionPath));
        return result.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() }));
      } catch (error) {
        if (isFilmShotListingNotDeployedV1(error)) throw new FilmShotCloudNotDeployedError();
        throw error;
      }
    },
  };
}
