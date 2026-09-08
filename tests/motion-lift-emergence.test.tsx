import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TouchHandler = (event: { allTouches: { x: number; y: number }[] }, manager: GestureManager) => void;
type GestureManager = { begin: () => void; activate: () => void; fail: () => void; end: () => void };

// The gesture builder records the touch handlers so a test can drive them like a pointer.
const gesture = vi.hoisted(() => ({ handlers: {} as Record<string, TouchHandler> }));

vi.mock("react-native-svg", () => ({ default: () => <svg data-testid="skeleton-svg" />, Circle: () => <circle />, Line: () => <line /> }));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({ default: ({ name }: { name: string }) => <span data-icon={name} /> }));
vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(async () => undefined),
  impactAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: { Medium: "medium" },
  NotificationFeedbackType: { Success: "success" },
}));
vi.mock("react-native-gesture-handler", () => {
  const builder: Record<string, (arg?: unknown) => unknown> = {};
  for (const name of ["manualActivation", "maxPointers", "shouldCancelWhenOutside", "runOnJS", "onTouchesDown", "onTouchesMove", "onTouchesUp", "onTouchesCancelled"]) {
    builder[name] = (arg?: unknown) => {
      if (typeof arg === "function") gesture.handlers[name] = arg as TouchHandler;
      return builder;
    };
  }
  return { Gesture: { Pan: () => builder }, GestureDetector: ({ children }: { children?: React.ReactNode }) => <>{children}</> };
});

const { ReelItem } = await import("@/components/feed/reel-item");
const { MOTION_LIFT } = await import("@/lib/feed/motion-lift-state");
const { reelLabFixtures } = await import("@/lib/feed/reel-fixtures");

// Tells React 19 this is a test environment so act() does not warn on every update.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const items = reelLabFixtures();
const noop = () => {};
const manager: GestureManager = { begin: vi.fn(), activate: vi.fn(), fail: vi.fn(), end: vi.fn() };
const touch = (x: number, y: number) => ({ allTouches: [{ x, y }] });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const stage = () => container.querySelector('[data-testid="reel-stage-active"]') as HTMLElement;
/** The ground dim is the first layer of the active stage; its opacity is the lift value. */
const dimOpacity = () => Number((stage().children[0] as HTMLElement).style.opacity);
const wait = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });
const down = () => act(async () => { gesture.handlers.onTouchesDown(touch(180, 300), manager); });
const up = () => act(async () => { gesture.handlers.onTouchesUp(touch(180, 300), manager); });

const render = (reducedMotion: boolean) => act(async () => {
  root.render(
    <ReelItem
      actions={[]}
      count={3}
      height={700}
      index={0}
      item={items[0]}
      onLockScroll={noop}
      onNext={noop}
      onPrevious={noop}
      onSave={noop}
      onTogglePlayback={noop}
      paused
      reducedMotion={reducedMotion}
      role="active"
      width={375}
    />,
  );
});

describe("motion lift emergence", () => {
  it("dims the ground part-way during the hold, fully once grabbed, and clears it on settle, cycle after cycle", async () => {
    vi.useFakeTimers();
    await render(false);
    expect(dimOpacity()).toBe(0);
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await down();
      await wait(MOTION_LIFT.holdMs / 2);
      const pending = dimOpacity();
      expect(pending).toBeGreaterThan(0);
      expect(pending).toBeLessThan(0.6);
      await wait(MOTION_LIFT.holdMs);
      await wait(600);
      expect(dimOpacity()).toBeGreaterThan(0.9);
      await up();
      await wait(MOTION_LIFT.settleMs + 1500);
      expect(Math.abs(dimOpacity())).toBeLessThan(0.05);
    }
  });

  it("under Reduce Motion the hold shows nothing until the grab, which appears at once and settles at once", async () => {
    vi.useFakeTimers();
    await render(true);
    await down();
    await wait(MOTION_LIFT.holdMs / 2);
    expect(dimOpacity()).toBe(0);
    await wait(MOTION_LIFT.holdMs);
    expect(dimOpacity()).toBe(1);
    await up();
    await wait(1);
    expect(dimOpacity()).toBe(0);
  });
});
