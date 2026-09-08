import { normalizePoseYaw } from "@/lib/pose-motion";

/**
 * Motion Lift as a pure state machine. Hold = grab, horizontal = explore,
 * up = keep. Everything the gesture layer does is a transition here, so the
 * rules (pause-only activation, jitter tolerance, one haptic per snap, save
 * only while armed) are testable without a pointer or a native runtime.
 */
export type MotionLiftPhase = "idle" | "pending" | "grabbed" | "save_armed" | "settling";

export type MotionLiftPoint = { x: number; y: number };

export type MotionLiftState = {
  phase: MotionLiftPhase;
  /** Yaw shown now, degrees, normalized to (-180, 180]. */
  yaw: number;
  /** Yaw when the current hold began; horizontal travel applies to it. */
  baseYaw: number;
  /** The yaw the Reel plays in; a reset returns here. */
  homeYaw: number;
  start: MotionLiftPoint | null;
  pointer: MotionLiftPoint | null;
  pressedAt: number | null;
  scrollLocked: boolean;
};

export type MotionLiftEvent =
  | { type: "press"; x: number; y: number; at: number; paused: boolean }
  | { type: "move"; x: number; y: number; at: number }
  | { type: "hold"; at: number }
  | { type: "release"; at: number }
  | { type: "settled" }
  | { type: "cancel" }
  | { type: "reset" };

export type MotionLiftEffect =
  | { type: "haptic"; kind: "grab" | "arm" | "save" }
  | { type: "save"; yaw: number }
  | { type: "tap" }
  | { type: "lock-scroll"; locked: boolean };

export type MotionLiftTransition = { state: MotionLiftState; effects: MotionLiftEffect[] };

export const MOTION_LIFT = Object.freeze({
  /** How long a still finger waits before the grab. */
  holdMs: 320,
  /** Movement before the hold beyond this is a scroll, not a hold. Below the iOS scroll slop. */
  jitterTolerance: 10,
  /** Same factor as the pose viewer drag. */
  yawDegreesPerPoint: 0.32,
  /** Upward travel (negative dy) past this arms Save. */
  saveArmDy: -56,
  /** Hysteresis so the affordance does not flicker at the threshold. */
  saveDisarmDy: -40,
  /** Length of the release settle; zero under Reduce Motion. */
  settleMs: 260,
  /** How long the tiny saved confirmation stays. */
  savedNoticeMs: 1200,
});

export function createMotionLiftState(homeYaw: number): MotionLiftState {
  const yaw = normalizePoseYaw(homeYaw);
  return { phase: "idle", yaw, baseYaw: yaw, homeYaw: yaw, start: null, pointer: null, pressedAt: null, scrollLocked: false };
}

function distance(a: MotionLiftPoint, b: MotionLiftPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function idle(state: MotionLiftState): MotionLiftState {
  return { ...state, phase: "idle", start: null, pointer: null, pressedAt: null, scrollLocked: false };
}

const none: MotionLiftEffect[] = [];

export function transitionMotionLift(state: MotionLiftState, event: MotionLiftEvent): MotionLiftTransition {
  switch (event.type) {
    case "press": {
      // Motion Lift starts only from a paused Reel, and only one pointer holds.
      if (!event.paused) return { state, effects: none };
      if (state.phase === "pending" || state.phase === "grabbed" || state.phase === "save_armed") return { state, effects: none };
      const point = { x: event.x, y: event.y };
      // A settle may be interrupted; the new hold starts from the settled yaw.
      return { state: { ...state, phase: "pending", start: point, pointer: point, pressedAt: event.at, baseYaw: state.yaw }, effects: none };
    }
    case "move": {
      const point = { x: event.x, y: event.y };
      if (state.phase === "pending") {
        if (!state.start || distance(state.start, point) > MOTION_LIFT.jitterTolerance) return { state: idle(state), effects: none };
        return { state: { ...state, pointer: point }, effects: none };
      }
      if ((state.phase !== "grabbed" && state.phase !== "save_armed") || !state.start) return { state, effects: none };
      const dx = point.x - state.start.x;
      const dy = point.y - state.start.y;
      const yaw = normalizePoseYaw(state.baseYaw + dx * MOTION_LIFT.yawDegreesPerPoint);
      const effects: MotionLiftEffect[] = [];
      let phase = state.phase;
      if (phase === "grabbed" && dy <= MOTION_LIFT.saveArmDy) {
        phase = "save_armed";
        effects.push({ type: "haptic", kind: "arm" });
      } else if (phase === "save_armed" && dy > MOTION_LIFT.saveDisarmDy) {
        phase = "grabbed";
      }
      return { state: { ...state, phase, yaw, pointer: point }, effects };
    }
    case "hold": {
      if (state.phase !== "pending") return { state, effects: none };
      return {
        state: { ...state, phase: "grabbed", scrollLocked: true },
        effects: [{ type: "lock-scroll", locked: true }, { type: "haptic", kind: "grab" }],
      };
    }
    case "release": {
      if (state.phase === "pending") return { state: idle(state), effects: [{ type: "tap" }] };
      if (state.phase !== "grabbed" && state.phase !== "save_armed") return { state, effects: none };
      const effects: MotionLiftEffect[] = [];
      if (state.phase === "save_armed") effects.push({ type: "save", yaw: state.yaw }, { type: "haptic", kind: "save" });
      if (state.scrollLocked) effects.push({ type: "lock-scroll", locked: false });
      return { state: { ...state, phase: "settling", start: null, pointer: null, pressedAt: null, scrollLocked: false }, effects };
    }
    case "settled":
      return state.phase === "settling" ? { state: { ...state, phase: "idle" }, effects: none } : { state, effects: none };
    case "cancel": {
      if (state.phase === "idle") return { state, effects: none };
      const effects: MotionLiftEffect[] = state.scrollLocked ? [{ type: "lock-scroll", locked: false }] : [];
      return { state: idle(state), effects };
    }
    case "reset": {
      const effects: MotionLiftEffect[] = state.scrollLocked ? [{ type: "lock-scroll", locked: false }] : [];
      return { state: createMotionLiftState(state.homeYaw), effects };
    }
    default:
      return { state, effects: none };
  }
}

/** How far the skeleton has emerged, 0..1. Reduce Motion has no in-between. */
export function motionLiftEmergence(state: MotionLiftState, now: number, reducedMotion: boolean): number {
  if (state.phase === "grabbed" || state.phase === "save_armed") return 1;
  if (state.phase !== "pending" || reducedMotion || state.pressedAt === null) return 0;
  return Math.max(0, Math.min(1, (now - state.pressedAt) / MOTION_LIFT.holdMs)) * 0.6;
}

/** How much of the way to arming Save the held pointer has travelled, 0..1. */
export function motionLiftArmProgress(state: MotionLiftState): number {
  if (state.phase === "save_armed") return 1;
  if (state.phase !== "grabbed" || !state.start || !state.pointer) return 0;
  const dy = state.pointer.y - state.start.y;
  return Math.max(0, Math.min(1, dy / MOTION_LIFT.saveArmDy));
}
