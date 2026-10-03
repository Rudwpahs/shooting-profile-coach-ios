import type { ExploreMotionV1 } from "@/lib/explore-source";
import type { ReelItem } from "@/lib/reels/reel-model";

/**
 * Progressive loading for the Explore feed. A representative record is built
 * through the real pipeline on first use, so the feed never builds the whole
 * library up front: it holds the entries up to the active one plus a small
 * window ahead, in source order, and keeps everything it already built.
 * Pure data: the screen owns the React state and the scheduling.
 */

/** Entries built beyond the active one, so a swipe lands on a finished reel. */
export const EXPLORE_FEED_AHEAD = 2;

export type ExploreFeedState = Readonly<{
  items: readonly ReelItem[];
  /** How many source entries have been attempted (built or skipped). */
  cursor: number;
}>;

export function createExploreFeedState(): ExploreFeedState {
  return Object.freeze({ items: Object.freeze([]), cursor: 0 });
}

/** How many source entries should be built for the given active index. */
export function exploreFeedTarget(activeIndex: number, total: number): number {
  const safeTotal = Math.max(0, Math.floor(total));
  const active = Number.isFinite(activeIndex) ? Math.max(0, Math.floor(activeIndex)) : 0;
  return Math.min(safeTotal, active + 1 + EXPLORE_FEED_AHEAD);
}

/**
 * Builds the entries from the cursor up to `target`, one at a time. An entry
 * whose reel cannot be built is skipped and the feed goes on; an id that is
 * already in the feed is not added twice. A target at or behind the cursor
 * returns the same state.
 */
export async function loadExploreFeed(
  motions: readonly ExploreMotionV1[],
  state: ExploreFeedState,
  target: number,
): Promise<ExploreFeedState> {
  const end = Math.min(motions.length, Math.max(0, Math.floor(target)));
  if (end <= state.cursor) return state;
  const items = [...state.items];
  const seen = new Set(items.map((item) => item.id));
  let cursor = state.cursor;
  while (cursor < end) {
    const motion = motions[cursor];
    cursor += 1;
    try {
      const reel = await motion.reel();
      if (!seen.has(reel.id)) {
        seen.add(reel.id);
        items.push(reel);
      }
    } catch {
      // The entry stays out of the feed; nothing else depends on it.
    }
  }
  return Object.freeze({ items: Object.freeze(items), cursor });
}
