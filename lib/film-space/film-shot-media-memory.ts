import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";

/**
 * How a film shot's files are kept on this device, so a shot outlives the
 * page or process that picked them. The web keeps the picked `File` in
 * IndexedDB and mints a fresh object URL when a shot is opened; a native
 * device already holds a persistent file URI and needs no copy. Nothing in
 * this port ever uploads.
 */
export type FilmShotClipInputV1 = LocalFilmClipRefV1 & Readonly<{ blob?: Blob }>;

export type FilmShotMedia = Readonly<{
  /** Keeps whatever this platform needs so the clips can be re-opened later. */
  persist(shotId: string, clips: readonly FilmShotClipInputV1[]): Promise<void>;
  /** Returns the clips that can be opened now, with usable URIs; a clip whose file is gone is left out. */
  restore(shotId: string, clips: readonly LocalFilmClipRefV1[]): Promise<LocalFilmClipRefV1[]>;
  remove(shotId: string): Promise<void>;
  /** The files this device holds for these clips, by slot id; a clip whose file is not held here is left out. */
  readFiles(shotId: string, clips: readonly LocalFilmClipRefV1[]): Promise<Record<string, Blob>>;
}>;

/** A native device keeps the picked file URI itself; nothing to copy or mint. */
export function createPassthroughFilmShotMedia(): FilmShotMedia {
  return {
    persist: async () => undefined,
    restore: async (_shotId, clips) => [...clips],
    remove: async () => undefined,
    readFiles: async () => ({}),
  };
}

export type MemoryFilmShotMedia = FilmShotMedia & Readonly<{
  /** Slot ids whose file is stored for this shot, in storage order. */
  stored(shotId: string): string[];
  /** Simulates a new page session: every minted URL is forgotten. */
  forgetUrls(): void;
  /** Simulates a file that the browser evicted. */
  drop(shotId: string, slotId: string): void;
}>;

/** In-memory media for tests and for the preview's own unit tests: blobs by shot and slot, URLs minted on restore. */
export function createMemoryFilmShotMedia(): MemoryFilmShotMedia {
  const blobs = new Map<string, Map<string, Blob>>();
  const urls = new Map<string, string>();
  const mints = new Map<string, number>();
  const key = (shotId: string, slotId: string) => `${shotId}/${slotId}`;
  return {
    async persist(shotId, clips) {
      const forShot = blobs.get(shotId) ?? new Map<string, Blob>();
      for (const clip of clips) if (clip.blob) forShot.set(clip.slotId, clip.blob);
      blobs.set(shotId, forShot);
    },
    async restore(shotId, clips) {
      const forShot = blobs.get(shotId);
      const restored: LocalFilmClipRefV1[] = [];
      for (const clip of clips) {
        if (!forShot?.has(clip.slotId)) continue;
        const k = key(shotId, clip.slotId);
        let uri = urls.get(k);
        if (!uri) {
          const count = (mints.get(clip.slotId) ?? 0) + 1;
          mints.set(clip.slotId, count);
          uri = `memory://${clip.slotId}#${count}`;
          urls.set(k, uri);
        }
        restored.push({ ...clip, uri });
      }
      return restored;
    },
    async remove(shotId) {
      blobs.delete(shotId);
      for (const k of [...urls.keys()]) if (k.startsWith(`${shotId}/`)) urls.delete(k);
    },
    async readFiles(shotId, clips) {
      const forShot = blobs.get(shotId);
      const files: Record<string, Blob> = {};
      for (const clip of clips) {
        const file = forShot?.get(clip.slotId);
        if (file) files[clip.slotId] = file;
      }
      return files;
    },
    stored: (shotId) => [...(blobs.get(shotId)?.keys() ?? [])],
    forgetUrls: () => urls.clear(),
    drop: (shotId, slotId) => {
      blobs.get(shotId)?.delete(slotId);
      urls.delete(key(shotId, slotId));
    },
  };
}
