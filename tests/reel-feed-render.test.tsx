import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TouchHandler = (event: { allTouches: { x: number; y: number }[] }, manager: GestureManager) => void;
type GestureManager = { begin: () => void; activate: () => void; fail: () => void; end: () => void };

// The gesture builder records the touch handlers so a test can drive them like a pointer.
const gesture = vi.hoisted(() => ({ handlers: {} as Record<string, TouchHandler> }));

vi.mock("react-native-svg", () => ({
  default: ({ children, ...props }: { children?: React.ReactNode; width?: number; height?: number }) => <svg data-testid="skeleton-svg" width={props.width} height={props.height}>{children}</svg>,
  Circle: () => <circle />,
  Line: () => <line />,
}));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({
  default: ({ name }: { name: string }) => <span data-icon={name} />,
}));
// The sequence viewer (whose lifecycle the loops share) imports haptics, which needs a native runtime.
vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(async () => undefined),
  impactAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy", Rigid: "rigid", Soft: "soft" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));
vi.mock("react-native-gesture-handler", () => {
  const builder: Record<string, (arg?: unknown) => unknown> = {};
  for (const name of ["manualActivation", "maxPointers", "shouldCancelWhenOutside", "runOnJS", "onTouchesDown", "onTouchesMove", "onTouchesUp", "onTouchesCancelled"]) {
    builder[name] = (arg?: unknown) => {
      if (typeof arg === "function") gesture.handlers[name] = arg as TouchHandler;
      return builder;
    };
  }
  return {
    Gesture: { Pan: () => builder },
    GestureDetector: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

const Haptics = await import("expo-haptics");
const { ReelFeed } = await import("@/components/feed/reel-feed");
const { ReelItem } = await import("@/components/feed/reel-item");
const { REEL_CHROME_BOTTOM_HEIGHT, REEL_RAIL_WIDTH } = await import("@/components/feed/reel-chrome");
const { MOTION_LIFT } = await import("@/lib/feed/motion-lift-state");
const { reelLabFixtures } = await import("@/lib/feed/reel-fixtures");

// Tells React 19 this is a test environment so act() does not warn on every update.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WIDTH = 375;
const HEIGHT = 700;
const items = reelLabFixtures();
const noActions = () => [];
const noop = () => {};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.clearAllMocks();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const byTestId = (id: string) => Array.from(container.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];
const byTestIdPrefix = (prefix: string) => Array.from(container.querySelectorAll(`[data-testid^="${prefix}"]`)) as HTMLElement[];
const tap = () => container.querySelector('[data-testid="reel-tap"]') as HTMLElement;

describe("reel feed", () => {
  it("renders one full-height item with exactly one active, playing stage", async () => {
    await act(async () => {
      root.render(<ReelFeed actionsFor={noActions} height={HEIGHT} items={items} reducedMotion width={WIDTH} />);
    });
    expect(byTestId("reel-feed")).toHaveLength(1);
    expect(byTestId("reel-stage-active")).toHaveLength(1);
    const first = byTestId("reel-item-user")[0];
    expect(first.style.height).toBe(`${HEIGHT}px`);
    expect(first.style.width).toBe(`${WIDTH}px`);
    const label = tap().getAttribute("aria-label") ?? "";
    expect(label).toContain("내 슛폼 릴, 1/3, 재생 중");
    expect(tap().getAttribute("aria-valuetext")).toBe("1 / 3");
    expect(byTestId("reel-pause-mark")).toHaveLength(0);
    // Playing: no hold surface exists, so a long press cannot start Motion Lift.
    expect(byTestIdPrefix("motion-lift-layer")).toHaveLength(0);
  });

  it("tap pauses and resumes the active item, shows a small pause mark outside the centre, and mounts the hold surface only while paused", async () => {
    await act(async () => {
      root.render(<ReelFeed actionsFor={noActions} height={HEIGHT} items={items} reducedMotion width={WIDTH} />);
    });
    await act(async () => { tap().click(); });
    expect(tap().getAttribute("aria-label")).toContain("일시정지됨");
    expect(byTestId("reel-pause-mark")).toHaveLength(1);
    expect(byTestId("motion-lift-layer-idle")).toHaveLength(1);
    await act(async () => { tap().click(); });
    expect(tap().getAttribute("aria-label")).toContain("재생 중");
    expect(byTestId("reel-pause-mark")).toHaveLength(0);
    expect(byTestIdPrefix("motion-lift-layer")).toHaveLength(0);
  });

  it("renders nothing until the viewport is measured", async () => {
    await act(async () => {
      root.render(<ReelFeed actionsFor={noActions} height={0} items={items} reducedMotion width={WIDTH} />);
    });
    expect(byTestId("reel-feed")).toHaveLength(0);
  });
});

describe("reel item roles", () => {
  const render = (role: "active" | "adjacent" | "idle", paused = false) => act(async () => {
    root.render(
      <ReelItem
        actions={[{ icon: "human", label: "내 슛폼 프로필 열기", onPress: noop }]}
        count={3}
        height={HEIGHT}
        index={1}
        item={items[1]}
        onLockScroll={noop}
        onNext={noop}
        onPrevious={noop}
        onSave={noop}
        onTogglePlayback={noop}
        paused={paused}
        reducedMotion
        role={role}
        width={WIDTH}
      />,
    );
  });

  it("adjacent holds a still and idle holds nothing; neither is exposed to VoiceOver", async () => {
    await render("adjacent");
    expect(byTestId("reel-stage-still")).toHaveLength(1);
    expect(byTestId("reel-stage-active")).toHaveLength(0);
    expect(byTestId("skeleton-svg")).toHaveLength(1);
    expect(tap().getAttribute("aria-label")).toContain("대기");
    expect(tap().getAttribute("aria-disabled")).toBe("true");
    await render("idle");
    expect(byTestId("reel-stage-idle")).toHaveLength(1);
    expect(byTestId("skeleton-svg")).toHaveLength(0);
  });

  it("coach reel: dominant skeleton, one label, one message line, no dashboard", async () => {
    await render("active", true);
    expect(byTestId("reel-stage-active")).toHaveLength(1);
    const chrome = byTestId("reel-chrome")[0];
    const leaves = Array.from(chrome.querySelectorAll("*")).filter((node) => node.children.length === 0);
    const lines = leaves.map((node) => node.textContent?.trim() ?? "").filter((text) => text.length > 0);
    expect(lines).toEqual(["코치 · 릴리스 추정", items[1].kind === "coach" ? items[1].message : ""]);
    expect(chrome.textContent).not.toMatch(/[0-9%]/);
    expect(container.querySelector('[aria-label="내 슛폼 프로필 열기"]')).not.toBeNull();
    expect(byTestId("reel-pause-mark")).toHaveLength(1);
  });

  it("keeps the chrome off the athlete: the stage ends above the caption band and the rail hugs the trailing edge", async () => {
    await render("active");
    const stage = byTestId("reel-stage-active")[0];
    expect(stage.style.height).toBe(`${HEIGHT - REEL_CHROME_BOTTOM_HEIGHT}px`);
    expect(REEL_CHROME_BOTTOM_HEIGHT).toBeGreaterThanOrEqual(88);
    expect(REEL_RAIL_WIDTH).toBeLessThanOrEqual(56);
    expect(tap().style.height).toBe(`${HEIGHT - REEL_CHROME_BOTTOM_HEIGHT}px`);
  });
});

describe("motion lift over a paused reel", () => {
  const manager: GestureManager = { begin: vi.fn(), activate: vi.fn(), fail: vi.fn(), end: vi.fn() };
  const touch = (x: number, y: number) => ({ allTouches: [{ x, y }] });
  const down = (x: number, y: number) => act(async () => { gesture.handlers.onTouchesDown(touch(x, y), manager); });
  const moveTo = (x: number, y: number) => act(async () => { gesture.handlers.onTouchesMove(touch(x, y), manager); });
  const up = () => act(async () => { gesture.handlers.onTouchesUp(touch(0, 0), manager); });
  const wait = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });

  const spies = () => ({ onLockScroll: vi.fn(), onSave: vi.fn(), onTogglePlayback: vi.fn(), onLiftPhase: vi.fn() });

  const render = (props: ReturnType<typeof spies>, paused = true) => act(async () => {
    root.render(
      <ReelItem
        actions={[]}
        count={3}
        height={HEIGHT}
        index={0}
        item={items[0]}
        onNext={noop}
        onPrevious={noop}
        paused={paused}
        reducedMotion
        role="active"
        width={WIDTH}
        {...props}
      />,
    );
  });

  it("pause -> hold -> turn -> up-to-save is one continuous pointer interaction with one haptic per snap", async () => {
    vi.useFakeTimers();
    const handlers = spies();
    await render(handlers);
    expect(byTestId("motion-lift-layer-idle")).toHaveLength(1);
    expect(byTestId("reel-stage-lifted")).toHaveLength(0);

    await down(180, 300);
    expect(manager.begin).toHaveBeenCalledTimes(1);
    expect(byTestId("motion-lift-layer-pending")).toHaveLength(1);
    expect(handlers.onLiftPhase).toHaveBeenLastCalledWith("pending");

    await wait(MOTION_LIFT.holdMs);
    expect(byTestId("motion-lift-layer-grabbed")).toHaveLength(1);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(handlers.onLockScroll).toHaveBeenLastCalledWith(true);
    // The save affordance is present but faint until the pointer travels up.
    expect(byTestId("motion-lift-save")).toHaveLength(1);

    await moveTo(240, 300);
    expect(manager.activate).toHaveBeenCalledTimes(1);
    expect(byTestId("reel-stage-lifted")).toHaveLength(1);
    expect(byTestId("motion-lift-layer-grabbed")).toHaveLength(1);

    await moveTo(240, 190);
    expect(byTestId("motion-lift-layer-save_armed")).toHaveLength(1);
    expect(byTestId("motion-lift-save-armed")).toHaveLength(1);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    await moveTo(250, 185);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(manager.activate).toHaveBeenCalledTimes(1);

    await up();
    expect(handlers.onSave).toHaveBeenCalledTimes(1);
    const moment = handlers.onSave.mock.calls[0][0];
    expect(moment.itemId).toBe(items[0].id);
    expect(moment.yaw).toBeCloseTo(-45 + 70 * MOTION_LIFT.yawDegreesPerPoint, 6);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(handlers.onLockScroll.mock.calls.map((call) => call[0])).toEqual([true, false]);
    expect(manager.end).toHaveBeenCalledTimes(1);
    expect(byTestId("motion-lift-saved")).toHaveLength(1);
    expect(handlers.onTogglePlayback).not.toHaveBeenCalled();

    // Reduce Motion settles at once; the inspected pose stays.
    await wait(0);
    expect(byTestId("motion-lift-layer-idle")).toHaveLength(1);
    expect(byTestId("reel-stage-lifted")).toHaveLength(1);
    await wait(MOTION_LIFT.savedNoticeMs);
    expect(byTestId("motion-lift-saved")).toHaveLength(0);
  });

  it("a move before the hold fails the gesture so the feed scroll wins, and no grab follows", async () => {
    vi.useFakeTimers();
    const handlers = spies();
    await render(handlers);
    await down(180, 300);
    await moveTo(180, 330);
    expect(manager.fail).toHaveBeenCalledTimes(1);
    expect(byTestId("motion-lift-layer-idle")).toHaveLength(1);
    await wait(MOTION_LIFT.holdMs * 2);
    expect(byTestId("motion-lift-layer-idle")).toHaveLength(1);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(handlers.onLockScroll).not.toHaveBeenCalled();
  });

  it("a release before the hold is the tap that resumes playback", async () => {
    vi.useFakeTimers();
    const handlers = spies();
    await render(handlers);
    await down(180, 300);
    await wait(MOTION_LIFT.holdMs / 2);
    await up();
    expect(handlers.onTogglePlayback).toHaveBeenCalledTimes(1);
    expect(manager.fail).toHaveBeenCalledTimes(1);
    expect(manager.end).not.toHaveBeenCalled();
    expect(byTestId("motion-lift-layer-idle")).toHaveLength(1);
  });

  it("release without Save keeps the turned pose, and resuming the Reel resets it and the lock", async () => {
    vi.useFakeTimers();
    const handlers = spies();
    await render(handlers);
    await down(180, 300);
    await wait(MOTION_LIFT.holdMs);
    await moveTo(120, 310);
    expect(byTestId("reel-stage-lifted")).toHaveLength(1);
    await up();
    expect(handlers.onSave).not.toHaveBeenCalled();
    expect(byTestId("reel-stage-lifted")).toHaveLength(1);
    expect(handlers.onLockScroll.mock.calls.map((call) => call[0])).toEqual([true, false]);

    // A grab in progress when the Reel resumes or changes must release the lock.
    await down(180, 300);
    await wait(MOTION_LIFT.holdMs);
    expect(handlers.onLockScroll).toHaveBeenLastCalledWith(true);
    await render(handlers, false);
    expect(handlers.onLockScroll).toHaveBeenLastCalledWith(false);
    expect(byTestIdPrefix("motion-lift-layer")).toHaveLength(0);
    expect(byTestId("reel-stage-lifted")).toHaveLength(0);
    expect(byTestId("reel-stage-active")).toHaveLength(1);
  });
});
