import { createPassthroughFilmShotMedia, type FilmShotMedia } from "@/lib/film-space/film-shot-media-memory";
import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";

export { createMemoryFilmShotMedia, createPassthroughFilmShotMedia } from "@/lib/film-space/film-shot-media-memory";
export type { FilmShotClipInputV1, FilmShotMedia, MemoryFilmShotMedia } from "@/lib/film-space/film-shot-media-memory";

const DB_NAME = "hoophub-film-shots";
const STORE = "clips";
const DB_VERSION = 1;

/**
 * Browser media: the picked `File` is kept in IndexedDB, in this origin only,
 * and a fresh object URL is minted when the shot is opened again. An object
 * URL from an earlier page session is never trusted.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("film shot media database unavailable"));
  });
}

function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDatabase().then((db) => new Promise<T | undefined>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    let result: T | undefined;
    const request = run(transaction.objectStore(STORE));
    if (request) request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("film shot media transaction failed")); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("film shot media transaction aborted")); };
  }));
}

const clipKey = (shotId: string, slotId: string) => `${shotId}/${slotId}`;

function createIndexedDbFilmShotMedia(): FilmShotMedia {
  const minted = new Map<string, string>();
  return {
    async persist(shotId, clips) {
      for (const clip of clips) {
        if (!clip.blob) continue;
        const blob = clip.blob;
        await transact("readwrite", (store) => store.put(blob, clipKey(shotId, clip.slotId)));
      }
    },
    async restore(shotId, clips) {
      const restored: LocalFilmClipRefV1[] = [];
      for (const clip of clips) {
        const key = clipKey(shotId, clip.slotId);
        const existing = minted.get(key);
        if (existing) {
          restored.push({ ...clip, uri: existing });
          continue;
        }
        let blob: Blob | undefined;
        try {
          blob = await transact<Blob>("readonly", (store) => store.get(key));
        } catch {
          blob = undefined;
        }
        if (!(blob instanceof Blob)) continue;
        const uri = URL.createObjectURL(blob);
        minted.set(key, uri);
        restored.push({ ...clip, uri });
      }
      return restored;
    },
    async remove(shotId) {
      for (const [key, uri] of [...minted.entries()]) {
        if (!key.startsWith(`${shotId}/`)) continue;
        URL.revokeObjectURL(uri);
        minted.delete(key);
      }
      await transact("readwrite", (store) => {
        const range = IDBKeyRange.bound(`${shotId}/`, `${shotId}/￿`);
        store.delete(range);
      });
    },
  };
}

let shared: FilmShotMedia | null = null;

/** Web: IndexedDB when the browser offers it; otherwise clips keep their session URIs and die with the page. */
export function defaultFilmShotMedia(): FilmShotMedia {
  if (shared) return shared;
  const supported = typeof indexedDB !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
  shared = supported ? createIndexedDbFilmShotMedia() : createPassthroughFilmShotMedia();
  return shared;
}
