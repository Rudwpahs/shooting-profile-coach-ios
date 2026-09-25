import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  LocalFilmAssociationV1,
  LocalFilmClipRefV1,
  LocalFilmViewV1,
} from "@/lib/film-space/types";

const ASSOCIATION_VERSION = "local_film_association_v1" as const;
const STORAGE_PREFIX = "hoophub:film-space:v1:";
const OPAQUE_PROFILE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function storageKey(profileId: string): string | null {
  if (!OPAQUE_PROFILE_ID.test(profileId)) return null;
  return `${STORAGE_PREFIX}${profileId}`;
}

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

export function dropLocalFilmRef(
  refs: Map<string, LocalFilmClipRefV1>,
  slotId: string,
): void {
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

export async function saveLocalFilmAssociation(
  profileId: string,
  clips: readonly LocalFilmClipRefV1[],
): Promise<void> {
  const key = storageKey(profileId);
  if (!key) return;
  const sanitized = sanitizeClips(clips);
  if (sanitized.length === 0) {
    await AsyncStorage.removeItem(key);
    return;
  }
  const association: LocalFilmAssociationV1 = {
    version: ASSOCIATION_VERSION,
    profileId,
    clips: sanitized,
  };
  await AsyncStorage.setItem(key, JSON.stringify(association));
}

export async function loadLocalFilmAssociation(
  profileId: string,
): Promise<LocalFilmAssociationV1 | null> {
  const key = storageKey(profileId);
  if (!key) return null;
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  if (value.version !== ASSOCIATION_VERSION || value.profileId !== profileId || !Array.isArray(value.clips)) {
    return null;
  }
  const clips = value.clips.filter(validClip);
  if (clips.length === 0 || clips.length !== value.clips.length) return null;
  return {
    version: ASSOCIATION_VERSION,
    profileId,
    clips,
  };
}

export async function deleteLocalFilmAssociation(profileId: string): Promise<void> {
  const key = storageKey(profileId);
  if (!key) return;
  await AsyncStorage.removeItem(key);
}