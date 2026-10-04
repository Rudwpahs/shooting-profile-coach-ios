import AsyncStorage from "@react-native-async-storage/async-storage";

import { defaultFilmShotMedia, type FilmShotClipInputV1, type FilmShotMedia } from "@/lib/film-space/film-shot-media";
import { createLocalFilmClipRef, deleteLocalFilmAssociation, saveLocalFilmAssociation } from "@/lib/film-space/local-association";
import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";

/**
 * FILM SHOTS: a capture session kept as footage only, on this device. No
 * pose was analysed, so there is no representative profile and nothing to
 * recommend from; what exists is the user's own clips, which never leave the
 * device. The store is AsyncStorage (an index of ids plus one record per
 * shot) and the same local film association the Film viewer already reads.
 */

export const FILM_SHOT_ID_PREFIX = "film-shot-";
const INDEX_KEY = "hoophub:film-shots:v1:index";
const RECORD_PREFIX = "hoophub:film-shots:v1:shot:";
const VERSION = "film_shot_v1" as const;
const OPAQUE_ID = /^[A-Za-z0-9_-]{1,128}$/;
/** A short plain name typed by the user; a file name is never accepted as a title. */
const DISPLAY_TITLE = /^[A-Za-z0-9가-힣 ·]{1,24}$/;

export type FilmShotV1 = Readonly<{
  version: typeof VERSION;
  id: string;
  title: string;
  createdAtMs: number;
  clips: readonly LocalFilmClipRefV1[];
}>;

export type FilmShotOptions = Readonly<{
  media?: FilmShotMedia;
  now?: () => number;
}>;

export function isFilmShotId(id: string): boolean {
  return typeof id === "string" && id.startsWith(FILM_SHOT_ID_PREFIX) && OPAQUE_ID.test(id);
}

const listeners = new Set<() => void>();

/** Fires after a shot is saved or deleted on this device, so an open surface can re-list without a focus hook. */
export function subscribeFilmShots(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notifyFilmShotsChanged(): void {
  for (const listener of [...listeners]) listener();
}

const recordKey = (id: string) => `${RECORD_PREFIX}${id}`;

async function readIndex(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string" && isFilmShotId(entry)) : [];
  } catch {
    return [];
  }
}

async function writeIndex(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) {
    await AsyncStorage.removeItem(INDEX_KEY);
    return;
  }
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

function sanitizeClips(clips: readonly FilmShotClipInputV1[]): LocalFilmClipRefV1[] {
  const sanitized: LocalFilmClipRefV1[] = [];
  for (const clip of clips) {
    const ref = createLocalFilmClipRef({
      slotId: clip.slotId,
      view: clip.view,
      takeIndex: clip.takeIndex,
      uri: clip.uri,
      durationMs: clip.durationMs,
      width: clip.width,
      height: clip.height,
    });
    if (!ref) throw new Error("film shot clips must be device-local clip references");
    sanitized.push(ref);
  }
  return sanitized;
}

function parseRecord(id: string, raw: string | null): FilmShotV1 | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  if (value.version !== VERSION || value.id !== id || typeof value.title !== "string" || typeof value.createdAtMs !== "number" || !Array.isArray(value.clips)) return null;
  try {
    const clips = sanitizeClips(value.clips as FilmShotClipInputV1[]);
    return { version: VERSION, id, title: value.title, createdAtMs: value.createdAtMs, clips };
  } catch {
    return null;
  }
}

/** Every film shot on this device, newest first. A corrupt record is skipped, never thrown. */
export async function listFilmShots(options: FilmShotOptions = {}): Promise<FilmShotV1[]> {
  void options;
  const ids = await readIndex();
  const shots: FilmShotV1[] = [];
  for (const id of ids) {
    const shot = parseRecord(id, await AsyncStorage.getItem(recordKey(id)));
    if (shot) shots.push(shot);
  }
  return shots.sort((left, right) => right.createdAtMs - left.createdAtMs);
}

/**
 * Keeps the clips as a new film shot: the platform media first (so a reload
 * can re-open them), then the association the Film viewer reads, then the
 * record and the index. Returns the shot with the clip references as stored.
 */
export async function saveFilmShot(
  input: Readonly<{
    clips: readonly FilmShotClipInputV1[];
    title?: string;
    /** Recreate a shot under its existing id (a download of the owner's cloud copy); replaces a record with that id. */
    id?: string;
    createdAtMs?: number;
  }>,
  options: FilmShotOptions = {},
): Promise<FilmShotV1> {
  const clips = sanitizeClips(input.clips);
  if (clips.length === 0) throw new Error("a film shot needs at least one clip");
  if (input.id !== undefined && !isFilmShotId(input.id)) throw new Error("a film shot can only be recreated under a device film shot id");
  const media = options.media ?? defaultFilmShotMedia();
  const now = options.now ?? Date.now;
  const existing = await readIndex();
  const createdAtMs = Math.round(input.createdAtMs ?? now());
  const id = input.id ?? `${FILM_SHOT_ID_PREFIX}${createdAtMs.toString(36)}-${(existing.length + 1).toString(36)}`;
  const others = existing.filter((entry) => entry !== id);
  const title = input.title && DISPLAY_TITLE.test(input.title) ? input.title : `내 슛폼 ${others.length + 1}`;
  await media.persist(id, input.clips);
  await saveLocalFilmAssociation(id, clips);
  const shot: FilmShotV1 = { version: VERSION, id, title, createdAtMs, clips };
  await AsyncStorage.setItem(recordKey(id), JSON.stringify(shot));
  await writeIndex([id, ...others]);
  notifyFilmShotsChanged();
  return shot;
}

/**
 * Re-opens a shot's clips for this session: the platform media mints usable
 * URIs (fresh object URLs on the web) and drops clips whose file is gone, and
 * the association is rewritten so the Film viewer reads the same URIs.
 */
export async function restoreFilmShot(shot: FilmShotV1, options: FilmShotOptions = {}): Promise<FilmShotV1> {
  const media = options.media ?? defaultFilmShotMedia();
  const clips = await media.restore(shot.id, shot.clips);
  const changed = clips.length !== shot.clips.length || clips.some((clip, index) => clip.uri !== shot.clips[index]?.uri);
  if (changed) await saveLocalFilmAssociation(shot.id, clips);
  return { ...shot, clips };
}

export async function deleteFilmShot(id: string, options: FilmShotOptions = {}): Promise<void> {
  if (!isFilmShotId(id)) return;
  const media = options.media ?? defaultFilmShotMedia();
  await media.remove(id);
  await deleteLocalFilmAssociation(id);
  await AsyncStorage.removeItem(recordKey(id));
  await writeIndex((await readIndex()).filter((entry) => entry !== id));
  notifyFilmShotsChanged();
}
