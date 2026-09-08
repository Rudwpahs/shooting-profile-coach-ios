/**
 * Pure state of a vertical Reel feed: which item is active and whether the
 * viewer paused it. Navigation and viewability both settle through the same
 * transition so the gesture path and the VoiceOver path cannot diverge.
 */
export type ReelFeedState = {
  activeIndex: number;
  count: number;
  /** Pause is per active item; changing the item resets it. */
  paused: boolean;
};

export type ReelFeedEvent =
  | { type: "items"; count: number }
  | { type: "settle"; index: number }
  | { type: "next" }
  | { type: "previous" }
  | { type: "toggle-playback" }
  | { type: "pause" }
  | { type: "play" };

/** Which items may hold media: the active one plays, its neighbours hold a still, the rest hold nothing. */
export type ReelMediaRole = "active" | "adjacent" | "idle";

export const REEL_MEDIA_RADIUS = 1;

export function clampReelIndex(index: number, count: number): number {
  if (!Number.isFinite(index) || count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(index)));
}

export function createReelFeedState(count: number): ReelFeedState {
  return { activeIndex: 0, count: Math.max(0, Math.floor(count)), paused: false };
}

function settle(state: ReelFeedState, index: number): ReelFeedState {
  const next = clampReelIndex(index, state.count);
  if (next === state.activeIndex) return state;
  return { ...state, activeIndex: next, paused: false };
}

export function transitionReelFeedState(state: ReelFeedState, event: ReelFeedEvent): ReelFeedState {
  switch (event.type) {
    case "items": {
      const count = Math.max(0, Math.floor(event.count));
      const activeIndex = clampReelIndex(state.activeIndex, count);
      return {
        count,
        activeIndex,
        paused: activeIndex === state.activeIndex ? state.paused : false,
      };
    }
    case "settle":
      return settle(state, event.index);
    case "next":
      return settle(state, state.activeIndex + 1);
    case "previous":
      return settle(state, state.activeIndex - 1);
    case "toggle-playback":
      return state.count === 0 ? state : { ...state, paused: !state.paused };
    case "pause":
      return state.count === 0 || state.paused ? state : { ...state, paused: true };
    case "play":
      return state.paused ? { ...state, paused: false } : state;
    default:
      return state;
  }
}

export function reelMediaRole(index: number, activeIndex: number, radius: number = REEL_MEDIA_RADIUS): ReelMediaRole {
  if (index === activeIndex) return "active";
  return Math.abs(index - activeIndex) <= radius ? "adjacent" : "idle";
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
