import type { ReelItem } from "@/lib/reels/reel-model";

/**
 * The in-memory handoff from Home to the Reels route: the items Home was
 * showing and the one that was tapped, so the route opens on the same item
 * without a second fetch. Taken once, never persisted, never sent anywhere.
 */
export type ReelHandoff = { items: readonly ReelItem[]; startId: string };

let pending: ReelHandoff | null = null;

export function setReelHandoff(handoff: ReelHandoff): void {
  pending = handoff;
}

export function takeReelHandoff(): ReelHandoff | null {
  const handoff = pending;
  pending = null;
  return handoff;
}

export function clearReelHandoff(): void {
  pending = null;
}
