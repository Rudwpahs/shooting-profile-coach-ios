/**
 * Pure state of the vertical Reel feed: which item is active and how the
 * viewer wants it played. Gestures, viewability and the VoiceOver actions all
 * settle through the same transition so the paths cannot diverge. Ported in
 * concept from the earlier product-ui harness; the pause flag became a
 * playback mode so an explicit tap can play under Reduce Motion.
 */
export type ReelPlaybackMode = "auto" | "paused" | "explicit";

export type ReelFeedState = {
  activeIndex: number;
  count: number;
  /** Per active item; changing the item returns to `auto`. */
  playback: ReelPlaybackMode;
};

export type ReelFeedEvent =
  | { type: "items"; count: number }
  | { type: "settle"; index: number }
  | { type: "next" }
  | { type: "previous" }
  /** A tap on the stage; `playing` is whether the Reel was advancing at that moment. */
  | { type: "toggle-playback"; playing: boolean }
  | { type: "pause" };

/** Which items may hold media: the active one plays, its neighbours hold a still, the rest hold nothing. */
export type ReelMediaRole = "active" | "adjacent" | "idle";

const MEDIA_RADIUS = 1;

export function clampReelIndex(index: number, count: number): number {
  if (!Number.isFinite(index) || count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(index)));
}

export function createReelFeedState(count: number, initialIndex = 0, playback: ReelPlaybackMode = "auto"): ReelFeedState {
  const safeCount = Math.max(0, Math.floor(count));
  return { activeIndex: clampReelIndex(initialIndex, safeCount), count: safeCount, playback };
}

/** The index of the item Home selected; the first item when the id is unknown. */
export function initialReelIndex(items: readonly { id: string }[], startId: string | undefined): number {
  if (!startId) return 0;
  const index = items.findIndex((item) => item.id === startId);
  return index < 0 ? 0 : index;
}

function settle(state: ReelFeedState, index: number): ReelFeedState {
  const next = clampReelIndex(index, state.count);
  if (next === state.activeIndex) return state;
  return { ...state, activeIndex: next, playback: "auto" };
}

export function transitionReelFeedState(state: ReelFeedState, event: ReelFeedEvent): ReelFeedState {
  switch (event.type) {
    case "items": {
      const count = Math.max(0, Math.floor(event.count));
      const activeIndex = clampReelIndex(state.activeIndex, count);
      return {
        count,
        activeIndex,
        playback: activeIndex === state.activeIndex && count > 0 ? state.playback : "auto",
      };
    }
    case "settle":
      return settle(state, event.index);
    case "next":
      return settle(state, state.activeIndex + 1);
    case "previous":
      return settle(state, state.activeIndex - 1);
    case "toggle-playback":
      // A tap pauses what plays and plays what does not; when autoplay was
      // held back (Reduce Motion), the tap is the explicit request to play.
      if (state.count === 0) return state;
      return { ...state, playback: event.playing ? "paused" : "explicit" };
    case "pause":
      return state.count === 0 || state.playback === "paused" ? state : { ...state, playback: "paused" };
    default:
      return state;
  }
}

export function reelMediaRole(index: number, activeIndex: number): ReelMediaRole {
  if (index === activeIndex) return "active";
  return Math.abs(index - activeIndex) <= MEDIA_RADIUS ? "adjacent" : "idle";
}

/** Snap offset of an item in a feed whose items are exactly one viewport tall. */
export function reelSnapOffset(index: number, viewportHeight: number): number {
  return Math.max(0, index) * Math.max(0, viewportHeight);
}

/** The item a scroll offset has settled on; used when viewability does not fire. */
export function reelIndexFromOffset(offsetY: number, viewportHeight: number, count: number): number {
  if (!(viewportHeight > 0)) return 0;
  return clampReelIndex(offsetY / viewportHeight, count);
}
