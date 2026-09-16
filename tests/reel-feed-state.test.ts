import { describe, expect, it } from "vitest";

import {
  clampReelIndex,
  createReelFeedState,
  initialReelIndex,
  reelIndexFromOffset,
  reelMediaRole,
  reelSnapOffset,
  transitionReelFeedState,
  type ReelFeedEvent,
  type ReelFeedState,
} from "@/lib/reels/reel-feed-state";

function run(state: ReelFeedState, ...events: ReelFeedEvent[]): ReelFeedState {
  return events.reduce(transitionReelFeedState, state);
}

describe("reel feed state", () => {
  it("starts on the requested item, playing", () => {
    expect(createReelFeedState(3)).toEqual({ activeIndex: 0, count: 3, playback: "auto" });
    expect(createReelFeedState(3, 2)).toEqual({ activeIndex: 2, count: 3, playback: "auto" });
    expect(createReelFeedState(3, 9)).toEqual({ activeIndex: 2, count: 3, playback: "auto" });
    expect(createReelFeedState(0, 4)).toEqual({ activeIndex: 0, count: 0, playback: "auto" });
    expect(createReelFeedState(2, 0, "paused").playback).toBe("paused");
  });

  it("one tap pauses, the next tap resumes as an explicit play, and a third pauses again", () => {
    const start = createReelFeedState(2);
    const paused = run(start, { type: "toggle-playback", playing: true });
    expect(paused.playback).toBe("paused");
    const resumed = run(paused, { type: "toggle-playback", playing: false });
    expect(resumed.playback).toBe("explicit");
    expect(run(resumed, { type: "toggle-playback", playing: true }).playback).toBe("paused");
    expect(run(paused, { type: "pause" })).toBe(paused);
    expect(run(start, { type: "pause" }).playback).toBe("paused");
  });

  it("a tap while autoplay is held back (Reduce Motion) is the explicit request to play", () => {
    const held = createReelFeedState(2);
    expect(held.playback).toBe("auto");
    expect(run(held, { type: "toggle-playback", playing: false }).playback).toBe("explicit");
  });

  it("moves next and previous within bounds and the new item always starts playing", () => {
    const start = createReelFeedState(3);
    const paused = run(start, { type: "toggle-playback", playing: true });
    const next = run(paused, { type: "next" });
    expect(next).toEqual({ activeIndex: 1, count: 3, playback: "auto" });
    expect(run(next, { type: "next" }, { type: "next" }, { type: "next" }).activeIndex).toBe(2);
    expect(run(start, { type: "previous" })).toBe(start);
    expect(run(run(next, { type: "toggle-playback", playing: true }), { type: "previous" })).toEqual({ activeIndex: 0, count: 3, playback: "auto" });
  });

  it("settles from viewability like a gesture: the same index keeps the pause, a new index clears it", () => {
    const paused = run(createReelFeedState(3), { type: "toggle-playback", playing: true });
    expect(run(paused, { type: "settle", index: 0 })).toBe(paused);
    expect(run(paused, { type: "settle", index: 2 })).toEqual({ activeIndex: 2, count: 3, playback: "auto" });
    expect(run(paused, { type: "settle", index: 9 }).activeIndex).toBe(2);
    expect(run(paused, { type: "settle", index: Number.NaN }).activeIndex).toBe(0);
  });

  it("never toggles an empty feed and clamps when the list shrinks", () => {
    const empty = createReelFeedState(0);
    expect(run(empty, { type: "toggle-playback", playing: true })).toBe(empty);
    expect(run(empty, { type: "pause" })).toBe(empty);
    const onLast = run(createReelFeedState(3), { type: "next" }, { type: "next" }, { type: "pause" });
    expect(run(onLast, { type: "items", count: 2 })).toEqual({ activeIndex: 1, count: 2, playback: "auto" });
    expect(run(onLast, { type: "items", count: 5 })).toEqual({ activeIndex: 2, count: 5, playback: "paused" });
    expect(run(onLast, { type: "items", count: 0 })).toEqual({ activeIndex: 0, count: 0, playback: "auto" });
  });

  it("mounts media only for the active item and its two neighbours", () => {
    expect([0, 1, 2, 3, 4].map((index) => reelMediaRole(index, 2))).toEqual(["idle", "adjacent", "active", "adjacent", "idle"]);
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

  it("starts at the item Home selected, or the first one when the id is unknown", () => {
    const items = [{ id: "profile:a" }, { id: "reference:b" }, { id: "reference:c" }];
    expect(initialReelIndex(items, "reference:c")).toBe(2);
    expect(initialReelIndex(items, "profile:a")).toBe(0);
    expect(initialReelIndex(items, "reference:zzz")).toBe(0);
    expect(initialReelIndex(items, undefined)).toBe(0);
    expect(initialReelIndex([], "profile:a")).toBe(0);
  });
});
