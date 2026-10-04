import AsyncStorage from "@react-native-async-storage/async-storage";

import { isFilmShotId } from "@/lib/film-space/film-shots";

/**
 * What this device remembers about a film shot's cloud copy, so a surface can
 * say "클라우드에도 보관됨" without a network read. It is a note, not the
 * truth: the cloud documents are. Cleared when the cloud copy is deleted.
 */

export type FilmShotCloudStateV1 = Readonly<{ state: "uploaded"; uploadedAtMs: number }>;

const key = (shotId: string) => `hoophub:film-shots:v1:cloud:${shotId}`;

export async function readFilmShotCloudState(shotId: string): Promise<FilmShotCloudStateV1 | null> {
  if (!isFilmShotId(shotId)) return null;
  const raw = await AsyncStorage.getItem(key(shotId));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const value = parsed as Record<string, unknown>;
    if (value.state !== "uploaded" || typeof value.uploadedAtMs !== "number" || !Number.isFinite(value.uploadedAtMs)) return null;
    return { state: "uploaded", uploadedAtMs: value.uploadedAtMs };
  } catch {
    return null;
  }
}

export async function markFilmShotUploaded(shotId: string, now: () => number = Date.now): Promise<void> {
  if (!isFilmShotId(shotId)) throw new Error("only a device film shot can be marked as kept in the cloud");
  const state: FilmShotCloudStateV1 = { state: "uploaded", uploadedAtMs: Math.round(now()) };
  await AsyncStorage.setItem(key(shotId), JSON.stringify(state));
}

export async function clearFilmShotCloudState(shotId: string): Promise<void> {
  if (!isFilmShotId(shotId)) return;
  await AsyncStorage.removeItem(key(shotId));
}
