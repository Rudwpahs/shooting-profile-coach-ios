import type { User } from "firebase/auth";

import { filmShotCloudSource, type FilmShotCloudSource } from "@/lib/film-shot-cloud-source";
import { clearFilmShotCloudState, markFilmShotUploaded } from "@/lib/film-space/film-shot-cloud-state";
import { defaultFilmShotMedia, type FilmShotClipInputV1, type FilmShotMedia } from "@/lib/film-space/film-shot-media";
import { deleteFilmShot, saveFilmShot, type FilmShotV1 } from "@/lib/film-space/film-shots";
import type { CloudFilmShotHeadSummaryV1 } from "@/lib/firebase-film-shots";

/**
 * What the Profile does with a film shot and the owner's cloud space. Every
 * call goes through the cloud source, which refuses in a build that did not
 * opt in, so none of this can send footage from an ordinary build.
 */

export type FilmShotCloudActionDeps = Readonly<{
  source?: FilmShotCloudSource;
  media?: FilmShotMedia;
  /** Null on a device that cannot hold downloaded files. */
  createObjectUrl?: ((data: Blob) => string) | null;
}>;

export type FilmShotTile = Readonly<{
  id: string;
  title: string;
  createdAtMs: number;
  clipCount: number;
  onDevice: boolean;
  inCloud: boolean;
  /** The device shot, when this device holds the footage. */
  shot: FilmShotV1 | null;
}>;

/** A browser can keep downloaded files (IndexedDB); a native build has nowhere to put them yet. */
function defaultCreateObjectUrl(): ((data: Blob) => string) | null {
  const supported = typeof document !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
  return supported ? (data) => URL.createObjectURL(data) : null;
}

export function canDownloadCloudFilmShots(): boolean {
  return defaultCreateObjectUrl() !== null;
}

/** Device and cloud shots as one list of tiles, newest first. A null cloud list claims nothing about the cloud. */
export function mergeFilmShotTiles(local: readonly FilmShotV1[], cloud: readonly CloudFilmShotHeadSummaryV1[] | null): FilmShotTile[] {
  const cloudIds = new Set((cloud ?? []).map((entry) => entry.shotId));
  const localIds = new Set(local.map((shot) => shot.id));
  const tiles: FilmShotTile[] = local.map((shot) => ({
    id: shot.id,
    title: shot.title,
    createdAtMs: shot.createdAtMs,
    clipCount: shot.clips.length,
    onDevice: true,
    inCloud: cloudIds.has(shot.id),
    shot,
  }));
  for (const entry of cloud ?? []) {
    if (localIds.has(entry.shotId)) continue;
    tiles.push({ id: entry.shotId, title: entry.title, createdAtMs: entry.createdAtMs, clipCount: entry.clipIds.length, onDevice: false, inCloud: true, shot: null });
  }
  return tiles.sort((left, right) => right.createdAtMs - left.createdAtMs);
}

/** The owner's kept shots. Finishing earlier deletions comes first but never blocks the list. */
export async function listCloudFilmShotsForOwner(user: User, deps: FilmShotCloudActionDeps = {}): Promise<CloudFilmShotHeadSummaryV1[]> {
  const source = deps.source ?? filmShotCloudSource;
  try {
    await source.resumePendingDeletions(user);
  } catch {
    // The next visit tries again; what is kept can still be shown.
  }
  return source.list(user);
}

/** Keeps a device shot in the owner's cloud space, from the files this device holds. */
export async function keepFilmShotInCloud(user: User, shot: FilmShotV1, deps: FilmShotCloudActionDeps = {}): Promise<void> {
  const source = deps.source ?? filmShotCloudSource;
  const media = deps.media ?? defaultFilmShotMedia();
  const files = await media.readFiles(shot.id, shot.clips);
  if (shot.clips.some((clip) => !(files[clip.slotId] instanceof Blob))) {
    throw new Error("이 기기에 영상 파일이 남아 있지 않아 클라우드에 올릴 수 없습니다.");
  }
  await source.upload(user, { id: shot.id, title: shot.title, clips: shot.clips }, files);
  await markFilmShotUploaded(shot.id);
}

/** Recreates a cloud shot on this device under its own id, time and name. */
export async function downloadCloudFilmShotToDevice(
  user: User,
  target: Readonly<{ shotId: string; createdAtMs: number }>,
  deps: FilmShotCloudActionDeps = {},
): Promise<void> {
  const source = deps.source ?? filmShotCloudSource;
  const createObjectUrl = deps.createObjectUrl === undefined ? defaultCreateObjectUrl() : deps.createObjectUrl;
  if (!createObjectUrl) throw new Error("이 기기에서는 내려받을 수 없습니다.");
  const downloaded = await source.download(user, target.shotId);
  const clips: FilmShotClipInputV1[] = downloaded.clips.map((clip) => ({
    slotId: clip.slotId,
    view: clip.view,
    takeIndex: clip.takeIndex,
    uri: createObjectUrl(clip.blob),
    durationMs: clip.durationMs,
    width: clip.width,
    height: clip.height,
    blob: clip.blob,
  }));
  await saveFilmShot(
    { id: downloaded.shotId, createdAtMs: target.createdAtMs, title: downloaded.title, clips },
    deps.media ? { media: deps.media } : {},
  );
  await markFilmShotUploaded(downloaded.shotId);
}

/**
 * Deletes a shot wherever it is. The cloud copy goes first: if that fails the
 * device copy stays, so the owner still sees the shot and can try again,
 * instead of footage staying in the cloud with nothing on screen to show it.
 */
export async function deleteFilmShotEverywhere(
  user: User | null,
  target: Readonly<{ shotId: string; onDevice: boolean; inCloud: boolean }>,
  deps: FilmShotCloudActionDeps = {},
): Promise<void> {
  if (target.inCloud) {
    if (!user) throw new Error("signed-in owner is required");
    await deleteFilmShotFromCloudOnly(user, target.shotId, deps);
  }
  if (target.onDevice) await deleteFilmShot(target.shotId, deps.media ? { media: deps.media } : {});
}

export async function deleteFilmShotFromCloudOnly(user: User, shotId: string, deps: FilmShotCloudActionDeps = {}): Promise<void> {
  const source = deps.source ?? filmShotCloudSource;
  await source.remove(user, shotId);
  await clearFilmShotCloudState(shotId);
}
