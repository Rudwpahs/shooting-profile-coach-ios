import type {
  LocalFilmAssociationV1,
  LocalFilmClipRefV1,
  LocalFilmViewV1,
} from "@/lib/film-space/types";

/**
 * Web: the profile ↔ local-video association lives only in this page's
 * memory. A browser object URL is dead after a refresh anyway, and the raw
 * video must never be written to storage, so nothing is persisted. Object
 * URLs are revoked as soon as no association references them.
 */

const ASSOCIATION_VERSION = "local_film_association_v1" as const;
const OPAQUE_PROFILE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validView(value: unknown): value is LocalFilmViewV1 {
  return value === "front" || value === "shooting_side";
}

function validClip(value: unknown): value is LocalFilmClipRefV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const clip = value as Record<string, unknown>;
  return typeof clip.slotId === "string"
    && clip.slotId.length > 0
    && validView(clip.view)
    && Number.isInteger(clip.takeIndex)
    && (clip.takeIndex as number) >= 0
    && typeof clip.uri === "string"
    && clip.uri.length > 0
    && !/^https?:/i.test(clip.uri)
    && finiteNonNegative(clip.durationMs)
    && finiteNonNegative(clip.width)
    && finiteNonNegative(clip.height);
}

function sanitizeClips(clips: readonly LocalFilmClipRefV1[]): LocalFilmClipRefV1[] {
  const bySlot = new Map<string, LocalFilmClipRefV1>();
  for (const clip of clips) {
    if (!validClip(clip)) continue;
    bySlot.set(clip.slotId, {
      slotId: clip.slotId,
      view: clip.view,
      takeIndex: clip.takeIndex,
      uri: clip.uri,
      durationMs: clip.durationMs,
      width: clip.width,
      height: clip.height,
    });
  }
  return [...bySlot.values()];
}

export function retainAcceptedLocalFilmRef(
  refs: Map<string, LocalFilmClipRefV1>,
  clip: LocalFilmClipRefV1,
): void {
  if (!validClip(clip)) return;
  refs.set(clip.slotId, clip);
}

export function dropLocalFilmRef(refs: Map<string, LocalFilmClipRefV1>, slotId: string): void {
  refs.delete(slotId);
}

export function clearLocalFilmRefs(refs: Map<string, LocalFilmClipRefV1>): void {
  refs.clear();
}

export function createLocalFilmClipRef(input: {
  slotId: string;
  view: LocalFilmViewV1;
  takeIndex: number;
  uri: string;
  durationMs: number | null | undefined;
  width: number | null | undefined;
  height: number | null | undefined;
}): LocalFilmClipRefV1 | null {
  const clip: LocalFilmClipRefV1 = {
    slotId: input.slotId,
    view: input.view,
    takeIndex: input.takeIndex,
    uri: input.uri,
    durationMs: input.durationMs ?? Number.NaN,
    width: input.width ?? Number.NaN,
    height: input.height ?? Number.NaN,
  };
  return validClip(clip) ? clip : null;
}

export type WebLocalFilmAssociationStore = Readonly<{
  saveLocalFilmAssociation(profileId: string, clips: readonly LocalFilmClipRefV1[]): Promise<void>;
  loadLocalFilmAssociation(profileId: string): Promise<LocalFilmAssociationV1 | null>;
  deleteLocalFilmAssociation(profileId: string): Promise<void>;
  evictLocalFilmClipFromAssociation(profileId: string, slotId: string): Promise<LocalFilmAssociationV1 | null>;
  clearAllLocalFilmAssociations(): void;
}>;

export function createWebLocalFilmAssociationStore(
  revoke: (uri: string) => void,
): WebLocalFilmAssociationStore {
  const associations = new Map<string, LocalFilmClipRefV1[]>();

  const referenced = (uri: string): boolean => {
    for (const clips of associations.values()) {
      if (clips.some((clip) => clip.uri === uri)) return true;
    }
    return false;
  };

  /** Revokes the given URIs once nothing references them any more. */
  const release = (uris: readonly string[]) => {
    for (const uri of new Set(uris)) {
      if (referenced(uri) || !/^blob:/i.test(uri)) continue;
      try {
        revoke(uri);
      } catch {
        // A URL that is already gone needs no second release.
      }
    }
  };

  const snapshot = (profileId: string): LocalFilmAssociationV1 | null => {
    const clips = associations.get(profileId);
    if (!clips || clips.length === 0) return null;
    return { version: ASSOCIATION_VERSION, profileId, clips: [...clips] };
  };

  return {
    async saveLocalFilmAssociation(profileId, clips) {
      if (!OPAQUE_PROFILE_ID.test(profileId)) return;
      const previous = associations.get(profileId) ?? [];
      const sanitized = sanitizeClips(clips);
      if (sanitized.length === 0) associations.delete(profileId);
      else associations.set(profileId, sanitized);
      release(previous.map((clip) => clip.uri));
    },

    async loadLocalFilmAssociation(profileId) {
      if (!OPAQUE_PROFILE_ID.test(profileId)) return null;
      return snapshot(profileId);
    },

    async deleteLocalFilmAssociation(profileId) {
      const previous = associations.get(profileId) ?? [];
      associations.delete(profileId);
      release(previous.map((clip) => clip.uri));
    },

    async evictLocalFilmClipFromAssociation(profileId, slotId) {
      const current = associations.get(profileId);
      if (!current) return null;
      const evicted = current.filter((clip) => clip.slotId === slotId);
      if (evicted.length === 0) return snapshot(profileId);
      const remaining = current.filter((clip) => clip.slotId !== slotId);
      if (remaining.length === 0) associations.delete(profileId);
      else associations.set(profileId, remaining);
      release(evicted.map((clip) => clip.uri));
      return snapshot(profileId);
    },

    clearAllLocalFilmAssociations() {
      const uris = [...associations.values()].flat().map((clip) => clip.uri);
      associations.clear();
      release(uris);
    },
  };
}

const store = createWebLocalFilmAssociationStore((uri) => {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(uri);
});

export const saveLocalFilmAssociation = store.saveLocalFilmAssociation;
export const loadLocalFilmAssociation = store.loadLocalFilmAssociation;
export const deleteLocalFilmAssociation = store.deleteLocalFilmAssociation;
export const evictLocalFilmClipFromAssociation = store.evictLocalFilmClipFromAssociation;
export const clearAllLocalFilmAssociations = store.clearAllLocalFilmAssociations;
