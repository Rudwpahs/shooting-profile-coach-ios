import { describe, expect, it } from "vitest";

import {
  MOTION_LIFT,
  createMotionLiftState,
  motionLiftArmProgress,
  motionLiftEmergence,
  transitionMotionLift,
  type MotionLiftEffect,
  type MotionLiftEvent,
  type MotionLiftState,
} from "@/lib/feed/motion-lift-state";
import { normalizePoseYaw } from "@/lib/pose-motion";

const HOME = -45;

function run(state: MotionLiftState, ...events: MotionLiftEvent[]): { state: MotionLiftState; effects: MotionLiftEffect[] } {
  return events.reduce<{ state: MotionLiftState; effects: MotionLiftEffect[] }>((current, event) => {
    const next = transitionMotionLift(current.state, event);
    return { state: next.state, effects: [...current.effects, ...next.effects] };
  }, { state, effects: [] });
}

const press = (x: number, y: number, at = 0, paused = true): MotionLiftEvent => ({ type: "press", x, y, at, paused });
const move = (x: number, y: number, at = 0): MotionLiftEvent => ({ type: "move", x, y, at });
const hold = (at = MOTION_LIFT.holdMs): MotionLiftEvent => ({ type: "hold", at });
const release = (at = 0): MotionLiftEvent => ({ type: "release", at });

const grabbed = () => run(createMotionLiftState(HOME), press(180, 300), hold()).state;

describe("motion lift state", () => {
  it("starts idle at the home yaw", () => {
    expect(createMotionLiftState(HOME)).toEqual({
      phase: "idle", yaw: HOME, baseYaw: HOME, homeYaw: HOME, start: null, pointer: null, pressedAt: null, scrollLocked: false,
    });
    expect(createMotionLiftState(200).yaw).toBe(-160);
  });

  it("only a paused Reel can be held; a playing one ignores the press", () => {
    const start = createMotionLiftState(HOME);
    expect(transitionMotionLift(start, press(180, 300, 0, false))).toEqual({ state: start, effects: [] });
    const { state, effects } = run(start, press(180, 300, 10));
    expect(state.phase).toBe("pending");
    expect(state.start).toEqual({ x: 180, y: 300 });
    expect(state.pressedAt).toBe(10);
    expect(effects).toEqual([]);
  });

  it("tolerates thumb jitter before the hold and fails on a real move so the scroll wins", () => {
    const pending = run(createMotionLiftState(HOME), press(180, 300)).state;
    const jitter = transitionMotionLift(pending, move(186, 306));
    expect(jitter.state.phase).toBe("pending");
    expect(jitter.state.pointer).toEqual({ x: 186, y: 306 });
    const scroll = transitionMotionLift(pending, move(180, 330));
    expect(scroll.state.phase).toBe("idle");
    expect(scroll.state.start).toBeNull();
    expect(scroll.effects).toEqual([]);
    // A late hold after the scroll took over changes nothing.
    expect(transitionMotionLift(scroll.state, hold())).toEqual({ state: scroll.state, effects: [] });
  });

  it("a release before the hold is a tap", () => {
    const { state, effects } = run(createMotionLiftState(HOME), press(180, 300), release());
    expect(state.phase).toBe("idle");
    expect(effects).toEqual([{ type: "tap" }]);
  });

  it("the hold grabs: one haptic, scroll locked, yaw unchanged", () => {
    const { state, effects } = run(createMotionLiftState(HOME), press(180, 300), hold());
    expect(state.phase).toBe("grabbed");
    expect(state.scrollLocked).toBe(true);
    expect(state.yaw).toBe(HOME);
    expect(effects).toEqual([{ type: "lock-scroll", locked: true }, { type: "haptic", kind: "grab" }]);
    expect(transitionMotionLift(state, press(10, 10)).state).toBe(state);
    expect(transitionMotionLift(state, hold()).state).toBe(state);
  });

  it("horizontal travel while held turns the skeleton continuously and wraps", () => {
    const state = grabbed();
    expect(transitionMotionLift(state, move(280, 300)).state.yaw).toBeCloseTo(HOME + 100 * MOTION_LIFT.yawDegreesPerPoint, 9);
    expect(transitionMotionLift(state, move(80, 300)).state.yaw).toBeCloseTo(HOME - 100 * MOTION_LIFT.yawDegreesPerPoint, 9);
    const far = transitionMotionLift(state, move(180 + 900, 300)).state;
    expect(far.yaw).toBeCloseTo(normalizePoseYaw(HOME + 900 * MOTION_LIFT.yawDegreesPerPoint), 9);
    expect(far.yaw).toBeGreaterThan(-180);
    expect(far.yaw).toBeLessThanOrEqual(180);
    expect(far.phase).toBe("grabbed");
    expect(transitionMotionLift(state, move(280, 300)).effects).toEqual([]);
  });

  it("upward travel arms Save once, with hysteresis, and downward travel never does", () => {
    const state = grabbed();
    const almost = transitionMotionLift(state, move(180, 300 + MOTION_LIFT.saveArmDy + 1));
    expect(almost.state.phase).toBe("grabbed");
    expect(motionLiftArmProgress(almost.state)).toBeCloseTo(55 / 56, 6);
    const armed = transitionMotionLift(state, move(180, 300 + MOTION_LIFT.saveArmDy));
    expect(armed.state.phase).toBe("save_armed");
    expect(armed.effects).toEqual([{ type: "haptic", kind: "arm" }]);
    expect(motionLiftArmProgress(armed.state)).toBe(1);
    const still = transitionMotionLift(armed.state, move(200, 230));
    expect(still.state.phase).toBe("save_armed");
    expect(still.effects).toEqual([]);
    const back = transitionMotionLift(armed.state, move(200, 300 + MOTION_LIFT.saveDisarmDy + 1));
    expect(back.state.phase).toBe("grabbed");
    expect(back.effects).toEqual([]);
    const down = transitionMotionLift(state, move(180, 400));
    expect(down.state.phase).toBe("grabbed");
    expect(motionLiftArmProgress(down.state)).toBe(0);
  });

  it("release without Save settles, unlocks the scroll and keeps the inspected yaw", () => {
    const turned = transitionMotionLift(grabbed(), move(240, 300)).state;
    const { state, effects } = transitionMotionLift(turned, release());
    expect(state.phase).toBe("settling");
    expect(state.scrollLocked).toBe(false);
    expect(state.yaw).toBe(turned.yaw);
    expect(effects).toEqual([{ type: "lock-scroll", locked: false }]);
    const settled = transitionMotionLift(state, { type: "settled" }).state;
    expect(settled.phase).toBe("idle");
    expect(settled.yaw).toBe(turned.yaw);
    expect(transitionMotionLift(settled, { type: "settled" }).state).toBe(settled);
  });

  it("release while armed saves the inspected yaw with its own haptic", () => {
    const armed = run(grabbed(), move(240, 300), move(240, 200)).state;
    const { state, effects } = transitionMotionLift(armed, release());
    expect(state.phase).toBe("settling");
    expect(effects).toEqual([
      { type: "save", yaw: armed.yaw },
      { type: "haptic", kind: "save" },
      { type: "lock-scroll", locked: false },
    ]);
  });

  it("a settle can be interrupted by a new hold that starts from the settled yaw", () => {
    const settling = run(grabbed(), move(240, 300), release()).state;
    const again = transitionMotionLift(settling, press(100, 100, 50)).state;
    expect(again.phase).toBe("pending");
    expect(again.baseYaw).toBe(settling.yaw);
  });

  it("cancel drops any held state and unlocks; reset returns to the home yaw", () => {
    const idle = createMotionLiftState(HOME);
    expect(transitionMotionLift(idle, { type: "cancel" })).toEqual({ state: idle, effects: [] });
    const cancelled = transitionMotionLift(grabbed(), { type: "cancel" });
    expect(cancelled.state.phase).toBe("idle");
    expect(cancelled.state.scrollLocked).toBe(false);
    expect(cancelled.effects).toEqual([{ type: "lock-scroll", locked: false }]);
    const turned = transitionMotionLift(grabbed(), move(240, 300)).state;
    const reset = transitionMotionLift(turned, { type: "reset" });
    expect(reset.state).toEqual(createMotionLiftState(HOME));
    expect(reset.effects).toEqual([{ type: "lock-scroll", locked: false }]);
    expect(transitionMotionLift(createMotionLiftState(HOME), { type: "reset" }).effects).toEqual([]);
  });

  it("emergence grows during the hold, is complete when grabbed and has no in-between under Reduce Motion", () => {
    const pending = run(createMotionLiftState(HOME), press(180, 300, 1000)).state;
    expect(motionLiftEmergence(pending, 1000, false)).toBe(0);
    expect(motionLiftEmergence(pending, 1000 + MOTION_LIFT.holdMs / 2, false)).toBeCloseTo(0.3, 9);
    expect(motionLiftEmergence(pending, 1000 + MOTION_LIFT.holdMs * 2, false)).toBeCloseTo(0.6, 9);
    expect(motionLiftEmergence(pending, 1000 + MOTION_LIFT.holdMs, true)).toBe(0);
    expect(motionLiftEmergence(grabbed(), 0, true)).toBe(1);
    expect(motionLiftEmergence(createMotionLiftState(HOME), 0, false)).toBe(0);
  });
});
