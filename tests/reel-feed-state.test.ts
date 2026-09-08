import { describe, expect, it } from "vitest";

import {
  clampReelIndex,
  createReelFeedState,
  reelIndexFromOffset,
  reelMediaRole,
  reelSnapOffset,
  transitionReelFeedState,
  type ReelFeedEvent,
  type ReelFeedState,
} from "@/lib/feed/reel-feed-state";

function run(state: ReelFeedState, ...events: ReelFeedEvent[]): ReelFeedState {
  return events.reduce(transitionReelFeedState, state);
}

describe("reel feed state", () => {
  it("starts on the first item, playing", () => {
    expect(createReelFeedState(3)).toEqual({ activeIndex: 0, count: 3, paused: false });
    expect(createReelFeedState(0)).toEqual({ activeIndex: 0, count: 0, paused: false });
  });

  it("moves next and previous within bounds and resets pause when the item changes", () => {
    const start = createReelFeedState(3);
    const paused = run(start, { type: "toggle-playback" });
    expect(paused.paused).toBe(true);
    const next = run(paused, { type: "next" });
    expect(next).toEqual({ activeIndex: 1, count: 3, paused: false });
    expect(run(next, { type: "next" }, { type: "next" }, { type: "next" }).activeIndex).toBe(2);
    expect(run(start, { type: "previous" })).toBe(start);
  });

  it("settles from viewability like a gesture: same index keeps the pause, a new index clears it", () => {
    const paused = run(createReelFeedState(3), { type: "toggle-playback" });
    expect(run(paused, { type: "settle", index: 0 })).toBe(paused);
    expect(run(paused, { type: "settle", index: 2 })).toEqual({ activeIndex: 2, count: 3, paused: false });
    expect(run(paused, { type: "settle", index: 9 }).activeIndex).toBe(2);
    expect(run(paused, { type: "settle", index: Number.NaN }).activeIndex).toBe(0);
  });

  it("toggles, pauses and plays only the active item, never an empty feed", () => {
    const empty = createReelFeedState(0);
    expect(run(empty, { type: "toggle-playback" })).toBe(empty);
    expect(run(empty, { type: "pause" })).toBe(empty);
    const feed = createReelFeedState(2);
    const paused = run(feed, { type: "pause" });
    expect(paused.paused).toBe(true);
    expect(run(paused, { type: "pause" })).toBe(paused);
    expect(run(paused, { type: "play" }).paused).toBe(false);
    expect(run(feed, { type: "play" })).toBe(feed);
  });

  it("clamps the active index when the item list shrinks and keeps it when it does not move", () => {
    const onLast = run(createReelFeedState(3), { type: "next" }, { type: "next" }, { type: "pause" });
    expect(run(onLast, { type: "items", count: 2 })).toEqual({ activeIndex: 1, count: 2, paused: false });
    expect(run(onLast, { type: "items", count: 5 })).toEqual({ activeIndex: 2, count: 5, paused: true });
    expect(run(onLast, { type: "items", count: 0 })).toEqual({ activeIndex: 0, count: 0, paused: false });
  });

  it("mounts media only for the active item and its neighbours", () => {
    expect([0, 1, 2, 3, 4].map((index) => reelMediaRole(index, 2))).toEqual(["idle", "adjacent", "active", "adjacent", "idle"]);
    expect(reelMediaRole(5, 2, 3)).toBe("adjacent");
    expect(reelMediaRole(6, 2, 3)).toBe("idle");
  });

  it("maps offsets to snapped items in a feed whose items are one viewport tall", () => {
    expect(reelSnapOffset(2, 700)).toBe(1400);
    expect(reelSnapOffset(-1, 700)).toBe(0);
    expect(reelIndexFromOffset(1400, 700, 3)).toBe(2);
    expect(reelIndexFromOffset(1049, 700, 3)).toBe(1);
    expect(reelIndexFromOffset(1051, 700, 3)).toBe(2);
    expect(reelIndexFromOffset(9000, 700, 3)).toBe(2);
    expect(reelIndexFromOffset(700, 0, 3)).toBe(0);
    expect(clampReelIndex(2.4, 3)).toBe(2);
    expect(clampReelIndex(-3, 3)).toBe(0);
    expect(clampReelIndex(1, 0)).toBe(0);
  });
});
