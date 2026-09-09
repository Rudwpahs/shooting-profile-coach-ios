import type { ReelItem } from "@/lib/feed/reel-model";

/**
 * Save for Later, persisted. The held-up release keeps the moment in session
 * state first (the reel and Motion Lift never wait on the network); for a
 * public post the same moment is then written to `users/{uid}/savedReels/
 * {postId}`, one document per post, so saving again never duplicates. The
 * persisted moment is the canonical release phase mapped into the post's
 * time; the yaw stays UI state. Failures are reported, never thrown.
 */
export type SavedReelStore = {
  saveReelMoment(input: { postId: string; timeMs: number }): Promise<void>;
  unsaveReel(postId: string): Promise<void>;
};

/** Motion Lift holds the release-proxy still; that is the moment a save means. */
export const RELEASE_PHASE = 0.75;

export function releaseMomentTimeMs(durationMs: number): number {
  return Math.max(0, Math.min(durationMs, Math.round(durationMs * RELEASE_PHASE)));
}

export type SavedSyncResult =
  | { persisted: true; postId: string; timeMs: number }
  | { persisted: false; reason: "not_a_post" | "not_configured" | "persistence_failed" };

export type UnsavedSyncResult =
  | { persisted: true; postId: string }
  | { persisted: false; reason: "not_a_post" | "not_configured" | "persistence_failed" };

export async function syncSavedMoment(store: SavedReelStore | null, item: ReelItem, _moment: { itemId: string; yaw: number }): Promise<SavedSyncResult> {
  if (item.motion.source !== "public") return { persisted: false, reason: "not_a_post" };
  if (!store) return { persisted: false, reason: "not_configured" };
  const timeMs = releaseMomentTimeMs(item.motion.durationMs);
  try {
    await store.saveReelMoment({ postId: item.motion.postId, timeMs });
    return { persisted: true, postId: item.motion.postId, timeMs };
  } catch {
    return { persisted: false, reason: "persistence_failed" };
  }
}

export async function syncUnsavedMoment(store: SavedReelStore | null, item: ReelItem): Promise<UnsavedSyncResult> {
  if (item.motion.source !== "public") return { persisted: false, reason: "not_a_post" };
  if (!store) return { persisted: false, reason: "not_configured" };
  try {
    await store.unsaveReel(item.motion.postId);
    return { persisted: true, postId: item.motion.postId };
  } catch {
    return { persisted: false, reason: "persistence_failed" };
  }
}
