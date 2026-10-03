import { describe, expect, it, vi } from "vitest";

import type { ExploreMotionV1 } from "@/lib/explore-source";
import { EXPLORE_FEED_AHEAD, createExploreFeedState, exploreFeedTarget, loadExploreFeed } from "@/lib/explore-feed";
import type { ReelItem } from "@/lib/reels/reel-model";
import { anonymousReferenceReel, syntheticProfileReel } from "@/tests/fixtures/reel-fixtures";

// The reel fixtures reach the projection helpers next to the native viewer; node has no runtime for those modules.
vi.mock("react-native", () => ({ StyleSheet: { create: <T>(styles: T) => styles }, AccessibilityInfo: {}, AppState: {} }));
vi.mock("react-native-svg", () => ({ default: () => null, Circle: () => null, Line: () => null }));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({ default: () => null }));
vi.mock("expo-haptics", () => ({ selectionAsync: async () => undefined }));

const reference = anonymousReferenceReel();
const profiles = [1, 2, 3, 4, 5].map((index) => syntheticProfileReel(`demo-profile-${index}`, new Date(2026, 8, index)));

function entry(id: string, reel: ReelItem | Error, calls: string[]): ExploreMotionV1 {
  return {
    id,
    shortLabel: id,
    caption: `${id} · 합성`,
    kind: "synthetic_preview",
    href: `/private-analysis/${id}`,
    load: async () => ({ stills: [] }),
    reel: async () => {
      calls.push(id);
      if (reel instanceof Error) throw reel;
      return reel;
    },
  };
}

describe("explore feed loading", () => {
  it("loads the active item and a small window ahead, never the whole library at once", () => {
    expect(EXPLORE_FEED_AHEAD).toBeGreaterThanOrEqual(1);
    expect(EXPLORE_FEED_AHEAD).toBeLessThanOrEqual(3);
    expect(exploreFeedTarget(0, 25)).toBe(1 + EXPLORE_FEED_AHEAD);
    expect(exploreFeedTarget(10, 25)).toBe(11 + EXPLORE_FEED_AHEAD);
    expect(exploreFeedTarget(24, 25)).toBe(25);
    expect(exploreFeedTarget(-3, 25)).toBe(1 + EXPLORE_FEED_AHEAD);
    expect(exploreFeedTarget(0, 0)).toBe(0);
  });

  it("builds reel items in source order, one entry at a time, and keeps what it already loaded", async () => {
    const calls: string[] = [];
    const motions = [entry("ref", reference, calls), ...profiles.map((item, index) => entry(`p${index + 1}`, item, calls))];
    const first = await loadExploreFeed(motions, createExploreFeedState(), exploreFeedTarget(0, motions.length));
    expect(first.items.map((item) => item.id)).toEqual([reference.id, profiles[0].id, profiles[1].id].slice(0, 1 + EXPLORE_FEED_AHEAD));
    expect(first.cursor).toBe(1 + EXPLORE_FEED_AHEAD);
    expect(calls).toEqual(motions.slice(0, 1 + EXPLORE_FEED_AHEAD).map((motion) => motion.id));
    const second = await loadExploreFeed(motions, first, exploreFeedTarget(2, motions.length));
    expect(second.items.slice(0, first.items.length)).toEqual(first.items);
    expect(second.cursor).toBe(Math.min(motions.length, 3 + EXPLORE_FEED_AHEAD));
    // A target behind the cursor is a no-op that returns the same state.
    expect(await loadExploreFeed(motions, second, 1)).toBe(second);
  });

  it("skips an entry whose reel cannot be built and still advances past it", async () => {
    const calls: string[] = [];
    const motions = [entry("ref", reference, calls), entry("broken", new Error("no reconstruction"), calls), entry("p1", profiles[0], calls)];
    const state = await loadExploreFeed(motions, createExploreFeedState(), 3);
    expect(state.items.map((item) => item.id)).toEqual([reference.id, profiles[0].id]);
    expect(state.cursor).toBe(3);
    expect(calls).toEqual(["ref", "broken", "p1"]);
  });

  it("never duplicates an item id even when two entries resolve to the same reel", async () => {
    const calls: string[] = [];
    const motions = [entry("a", profiles[0], calls), entry("b", profiles[0], calls), entry("c", profiles[1], calls)];
    const state = await loadExploreFeed(motions, createExploreFeedState(), 3);
    expect(state.items.map((item) => item.id)).toEqual([profiles[0].id, profiles[1].id]);
  });
});
