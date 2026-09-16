import { describe, expect, it, vi } from "vitest";

import { representativeReleaseFrameIndex } from "@/components/skeleton/representative-glyph";
import {
  REEL_FRAME_COUNT,
  REEL_LAST_FRAME,
  advanceReelFrameClock,
  createReelFrameClock,
  reelFrameIntervalMs,
  reelProgress,
  reelShouldPlay,
  reelStartFrame,
  type ReelPlaybackPolicy,
} from "@/lib/reels/reel-playback";
import { anonymousReferenceReel, syntheticProfileReel } from "@/tests/fixtures/reel-fixtures";

// The projection helpers live beside the analysis viewer, which pulls React Native in; node tests mock the runtime.
vi.mock("react-native", () => ({ StyleSheet: { create: <T>(styles: T) => styles }, AccessibilityInfo: {}, AppState: {} }));
vi.mock("react-native-svg", () => ({ default: () => null, Circle: () => null, Line: () => null }));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({ default: () => null }));
vi.mock("expo-haptics", () => ({ selectionAsync: async () => undefined }));

const playing: ReelPlaybackPolicy = { active: true, focused: true, appState: "active", playback: "auto", reducedMotion: false };

describe("reel frame clock", () => {
  it("advances one stored frame per interval and carries the remainder", () => {
    const start = createReelFrameClock(10);
    expect(advanceReelFrameClock(start, 39, 40)).toEqual({ frame: 10, carryMs: 39 });
    expect(advanceReelFrameClock(start, 40, 40)).toEqual({ frame: 11, carryMs: 0 });
    expect(advanceReelFrameClock(start, 100, 40)).toEqual({ frame: 12, carryMs: 20 });
    expect(advanceReelFrameClock({ frame: 10, carryMs: 30 }, 15, 40)).toEqual({ frame: 11, carryMs: 5 });
  });

  it("loops the last frame back to zero without touching the frame data", () => {
    expect(REEL_FRAME_COUNT).toBe(101);
    expect(REEL_LAST_FRAME).toBe(100);
    expect(advanceReelFrameClock(createReelFrameClock(REEL_LAST_FRAME), 40, 40).frame).toBe(0);
    expect(advanceReelFrameClock(createReelFrameClock(99), 120, 40).frame).toBe(1);
  });

  it("ignores time that did not pass", () => {
    const clock = createReelFrameClock(5);
    expect(advanceReelFrameClock(clock, -40, 40)).toBe(clock);
    expect(advanceReelFrameClock(clock, Number.NaN, 40)).toBe(clock);
    expect(advanceReelFrameClock(clock, 40, 0)).toBe(clock);
  });

  it("reports progress as a fraction of the loop", () => {
    expect(reelProgress(0)).toBe(0);
    expect(reelProgress(50)).toBe(0.5);
    expect(reelProgress(100)).toBe(1);
    expect(reelProgress(500)).toBe(1);
    expect(reelProgress(-3)).toBe(0);
  });
});

describe("reel playback policy", () => {
  it("plays only the active item on the focused screen in the foreground", () => {
    expect(reelShouldPlay(playing)).toBe(true);
    expect(reelShouldPlay({ ...playing, active: false })).toBe(false);
    expect(reelShouldPlay({ ...playing, focused: false })).toBe(false);
    expect(reelShouldPlay({ ...playing, appState: "background" })).toBe(false);
    expect(reelShouldPlay({ ...playing, appState: "inactive" })).toBe(false);
  });

  it("honours the viewer's pause and never forces autoplay under Reduce Motion", () => {
    expect(reelShouldPlay({ ...playing, playback: "paused" })).toBe(false);
    expect(reelShouldPlay({ ...playing, reducedMotion: true })).toBe(false);
    expect(reelShouldPlay({ ...playing, reducedMotion: null })).toBe(false);
    // A tap is an explicit request: it plays even under Reduce Motion.
    expect(reelShouldPlay({ ...playing, reducedMotion: true, playback: "explicit" })).toBe(true);
    expect(reelShouldPlay({ ...playing, reducedMotion: true, playback: "explicit", appState: "background" })).toBe(false);
  });

  it("times each kind by its own data: stored phases at 40 ms, the reference cycle at 1850 ms", () => {
    expect(reelFrameIntervalMs(syntheticProfileReel())).toBe(40);
    expect(reelFrameIntervalMs(anonymousReferenceReel())).toBeCloseTo(18.5, 6);
  });

  it("starts each Reel on the release still its neighbours show", () => {
    const profile = syntheticProfileReel();
    expect(reelStartFrame(profile)).toBe(representativeReleaseFrameIndex(profile.profile));
    expect(reelStartFrame(anonymousReferenceReel())).toBe(75);
  });
});
