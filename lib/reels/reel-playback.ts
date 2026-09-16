import type { AppStateStatus } from "react-native";

import { advanceRepresentativeFrameIndex, resolveRepresentativePlayback } from "@/components/shooting-profile/sequence-viewer";
import { representativeReleaseFrameIndex } from "@/components/skeleton/representative-glyph";
import type { ReelPlaybackMode } from "@/lib/reels/reel-feed-state";
import type { ReelItem } from "@/lib/reels/reel-model";

/** The stored representative sequence is 101 phases; the reference loop is sampled on the same grid. */
export const REEL_FRAME_COUNT = 101;
export const REEL_LAST_FRAME = REEL_FRAME_COUNT - 1;

const PROFILE_FRAME_INTERVAL_MS = 40;
const REFERENCE_LOOP_MS = 1850;
const REFERENCE_RELEASE_FRAME = 75;

/** A frame counter that advances by elapsed time and wraps 100 → 0. */
export type ReelFrameClock = { frame: number; carryMs: number };

export function createReelFrameClock(frame = 0): ReelFrameClock {
  return { frame: Math.max(0, Math.min(REEL_LAST_FRAME, Math.round(frame))), carryMs: 0 };
}

export function advanceReelFrameClock(clock: ReelFrameClock, elapsedMs: number, frameIntervalMs: number): ReelFrameClock {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || !(frameIntervalMs > 0)) return clock;
  const total = clock.carryMs + elapsedMs;
  const steps = Math.floor(total / frameIntervalMs);
  if (steps === 0) return { frame: clock.frame, carryMs: total };
  let frame = clock.frame;
  for (let step = 0; step < steps % REEL_FRAME_COUNT; step += 1) frame = advanceRepresentativeFrameIndex(frame);
  return { frame, carryMs: total - steps * frameIntervalMs };
}

/** Progress of the loop as a fraction, for the thin line at the bottom. */
export function reelProgress(frame: number): number {
  if (!Number.isFinite(frame)) return 0;
  return Math.max(0, Math.min(1, frame / REEL_LAST_FRAME));
}

export type ReelPlaybackPolicy = {
  /** Only the active item of the feed may play. */
  active: boolean;
  /** Only while the Reels screen is focused (not under Analysis). */
  focused: boolean;
  appState: AppStateStatus;
  playback: ReelPlaybackMode;
  /** `null` until the system setting resolves; treated as reduced so autoplay never starts early. */
  reducedMotion: boolean | null;
};

/**
 * Whether a Reel advances right now. Composes the analysis viewer's own
 * policy (background pause, Reduce Motion, explicit play) with the feed's
 * active-item and focus rules, so every loop in the app answers the same way.
 */
export function reelShouldPlay(policy: ReelPlaybackPolicy): boolean {
  if (!policy.active || !policy.focused) return false;
  return resolveRepresentativePlayback({
    appState: policy.appState,
    intent: policy.playback === "paused" ? "paused" : policy.playback === "explicit" ? "explicit" : "autoplay",
    reducedMotion: policy.reducedMotion ?? true,
  });
}

/** Stored phases play at 40 ms; the reference keeps its 1850 ms cycle across the same 101 steps. */
export function reelFrameIntervalMs(item: ReelItem): number {
  return item.kind === "profile" ? PROFILE_FRAME_INTERVAL_MS : REFERENCE_LOOP_MS / REEL_LAST_FRAME;
}

/** The release still every neighbour shows, so becoming active never jumps. */
export function reelStartFrame(item: ReelItem): number {
  return item.kind === "profile" ? representativeReleaseFrameIndex(item.profile) : REFERENCE_RELEASE_FRAME;
}
