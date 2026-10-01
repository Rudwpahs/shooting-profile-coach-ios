import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AccessibilityInfo, Text, type View } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIQUID_MOTION, LIQUID_SPRINGS, resolveLiquidMotion } from "@/components/ui/liquid/liquid-motion";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The system allows motion; `forceReducedMotion` is the only way a test asks for less.
vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
vi.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((() => ({ remove: vi.fn() })) as never);

// react-native-web reports onLayout through ResizeObserver, which jsdom lacks.
let resizeCallback: ((entries: { target: Element }[]) => void) | null = null;
const observed = new Set<Element>();
class FakeResizeObserver {
  constructor(callback: (entries: { target: Element }[]) => void) {
    resizeCallback = callback;
  }
  observe(element: Element) {
    observed.add(element);
  }
  unobserve(element: Element) {
    observed.delete(element);
  }
  disconnect() {}
}
(window as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;

vi.mock("react-native-reanimated", () => import("./support/reanimated-test-double"));
const unregister = vi.fn();
const registerMagneticTarget = vi.fn((_node: unknown, _options: { radius: number }, _listener: unknown) => unregister);
vi.mock("@/components/ui/liquid/magnetic-field", () => ({
  MAGNETIC_FIELD_SUPPORTED: true,
  registerMagneticTarget: (node: unknown, options: { radius: number }, listener: unknown) => registerMagneticTarget(node, options, listener),
}));

const { animationCalls, evaluateAnimatedStyles, resetAnimationCalls } = await import("./support/reanimated-test-double");
const { LiquidPressable } = await import("@/components/ui/liquid/liquid-pressable");

const FULL = resolveLiquidMotion(false);
const REDUCED = resolveLiquidMotion(true);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  resetAnimationCalls();
  registerMagneticTarget.mockClear();
  unregister.mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
}

const byRole = (role: string) => Array.from(container.querySelectorAll(`[role="${role}"]`)) as HTMLElement[];
const ripple = () => container.querySelector('[data-testid="liquid-ripple"]') as HTMLElement | null;

type Box = { left: number; top: number; width: number; height: number };
function setBox(element: HTMLElement, box: Box) {
  const offsets = { offsetLeft: box.left, offsetTop: box.top, offsetWidth: box.width, offsetHeight: box.height };
  for (const [key, value] of Object.entries(offsets)) Object.defineProperty(element, key, { configurable: true, value });
  element.getBoundingClientRect = () =>
    ({ ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height, toJSON: () => ({}) }) as DOMRect;
}

/** Lay out a 200×60 hit area whose visible surface sits at `surface` inside it, then deliver onLayout. */
async function layout(hitArea: HTMLElement, surface: Box) {
  setBox(hitArea, { left: 0, top: 0, width: 200, height: 60 });
  setBox(hitArea.firstElementChild as HTMLElement, surface);
  await act(async () => {
    resizeCallback?.([...observed].map((target) => ({ target })));
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

/** The surface's resting transform right now (the double resolves animations to their targets). */
function surfaceMotion(index = 0) {
  const styles = evaluateAnimatedStyles().filter(
    (style) => Array.isArray(style.transform) && (style.transform as object[]).some((part) => "scaleX" in part),
  );
  const style = styles[index];
  const t = Object.assign({}, ...(style.transform as object[])) as { translateX: number; translateY: number; scaleX: number; scaleY: number };
  return { ...t, opacity: style.opacity as number };
}

/**
 * A held press: react-native-web activates press-in only after its 50 ms
 * press delay (so scrolling on touch web does not flash feedback); holding
 * past it is what a real finger or mouse does.
 */
async function pressIn(el: HTMLElement, clientX = 10, clientY = 10) {
  await act(async () => { el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX, clientY })); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 70)); });
}
async function pressOut(el: HTMLElement) {
  await act(async () => { el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 })); });
}
async function click(el: HTMLElement) {
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

describe("LiquidPressable semantics", () => {
  it("is a labelled button by default and fires onPress", async () => {
    const onPress = vi.fn();
    await render(
      <LiquidPressable accessibilityLabel="분석 시작" onPress={onPress}>
        <Text>분석 시작</Text>
      </LiquidPressable>,
    );
    const [button] = byRole("button");
    expect(button).toBeDefined();
    expect(button.getAttribute("aria-label")).toBe("분석 시작");
    await click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps a caller's role and selected state (tab bars, selectors)", async () => {
    await render(
      <LiquidPressable accessibilityRole="tab" accessibilityState={{ selected: true }} aria-selected accessibilityLabel="홈">
        <Text>홈</Text>
      </LiquidPressable>,
    );
    expect(byRole("button")).toHaveLength(0);
    const [tab] = byRole("tab");
    expect(tab.getAttribute("aria-label")).toBe("홈");
    expect(tab.getAttribute("aria-selected")).toBe("true");
  });

  it("does not fire or animate when disabled, and says so", async () => {
    const onPress = vi.fn();
    await render(
      <LiquidPressable accessibilityLabel="저장" disabled onPress={onPress}>
        <Text>저장</Text>
      </LiquidPressable>,
    );
    const [button] = byRole("button");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    await pressIn(button);
    await pressOut(button);
    await click(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(animationCalls.filter((call) => call.kind === "spring")).toHaveLength(0);
  });

  it("forwards its ref to the pressable (hit-area) node, not the moving surface", async () => {
    const ref = createRef<View>();
    await render(
      <LiquidPressable ref={ref} accessibilityLabel="촬영">
        <Text>촬영</Text>
      </LiquidPressable>,
    );
    expect(ref.current).toBe(byRole("button")[0]);
  });

  it("still calls the caller's onPressIn/onPressOut", async () => {
    const onPressIn = vi.fn();
    const onPressOut = vi.fn();
    await render(
      <LiquidPressable accessibilityLabel="탐색" onPressIn={onPressIn} onPressOut={onPressOut}>
        <Text>탐색</Text>
      </LiquidPressable>,
    );
    const [button] = byRole("button");
    await pressIn(button);
    await pressOut(button);
    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  it("makes the hit area, not a child, the touch target (children are presentational)", async () => {
    await render(
      <LiquidPressable accessibilityLabel="홈">
        <Text>홈</Text>
      </LiquidPressable>,
    );
    const [button] = byRole("button");
    // react-native-web implements box-only on its own host node: children stop taking pointer input.
    expect(button.className).toMatch(/pointerEvents/);
    expect(getComputedStyle(button.querySelector('[dir="auto"]') as HTMLElement).pointerEvents).toBe("none");
  });
});

describe("LiquidPressable ripple", () => {
  it("renders a decorative, clipped ripple layer that never takes pointer input", async () => {
    await render(
      <LiquidPressable accessibilityLabel="분석" surfaceStyle={{ borderRadius: 14 }}>
        <Text>분석</Text>
      </LiquidPressable>,
    );
    const layer = ripple();
    expect(layer).not.toBeNull();
    expect(layer!.getAttribute("aria-hidden")).toBe("true");
    expect(getComputedStyle(layer!).pointerEvents).toBe("none");
    // react-native-web expands `overflow` into its two axes.
    expect(getComputedStyle(layer!).overflowX).toBe("hidden");
    expect(getComputedStyle(layer!).overflowY).toBe("hidden");
    expect(getComputedStyle(layer!).position).toBe("absolute");
  });

  it("keeps firing onPress across repeated presses while ripples run", async () => {
    const onPress = vi.fn();
    await render(
      <LiquidPressable accessibilityLabel="분석" onPress={onPress}>
        <Text>분석</Text>
      </LiquidPressable>,
    );
    const [button] = byRole("button");
    await pressIn(button, 4, 4);
    await pressOut(button);
    await click(button);
    await pressIn(button, 30, 8);
    await pressOut(button);
    await click(button);
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("can be switched off per surface", async () => {
    await render(
      <LiquidPressable accessibilityLabel="분석" ripple={false}>
        <Text>분석</Text>
      </LiquidPressable>,
    );
    expect(ripple()).toBeNull();
  });
});

describe("LiquidPressable motion", () => {
  it("compresses on a spring and rebounds on the release spring", async () => {
    await render(
      <LiquidPressable accessibilityLabel="분석">
        <Text>분석</Text>
      </LiquidPressable>,
    );
    const [button] = byRole("button");
    await pressIn(button);
    const press = animationCalls.filter((call) => call.kind === "spring" && call.toValue === LIQUID_MOTION.press.scale);
    expect(press.length).toBeGreaterThanOrEqual(1);
    expect(press[0].config).toMatchObject(LIQUID_SPRINGS.press);

    resetAnimationCalls();
    await pressOut(button);
    const release = animationCalls.filter((call) => call.kind === "spring" && call.toValue === 1);
    expect(release.length).toBeGreaterThanOrEqual(1);
    expect(release.every((call) => call.config && (call.config as { damping: number }).damping === LIQUID_SPRINGS.release.damping)).toBe(true);
    expect(surfaceMotion()).toEqual({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, opacity: 1 });
  });

  it("measures the press point in the surface's own frame, even when the surface is inset in its hit area", async () => {
    await render(
      <LiquidPressable accessibilityLabel="홈" style={{ padding: 5 }}>
        <Text>홈</Text>
      </LiquidPressable>,
    );
    const [button] = byRole("button");
    // A 180×50 surface inset 10px / 5px inside its 200×60 hit area; press 2px in from its left edge.
    await layout(button, { left: 10, top: 5, width: 180, height: 50 });
    await pressIn(button, 12, 30);
    const nx = (2 - 90) / 90;
    const held = surfaceMotion();
    expect(held.translateX).toBeCloseTo(nx * LIQUID_MOTION.press.touchLean, 6);
    expect(held.translateY).toBeCloseTo(0, 6);
    expect(held.scaleX).toBeCloseTo(LIQUID_MOTION.press.scale * (1 + LIQUID_MOTION.press.stretch * Math.abs(nx)), 6);
    expect(held.scaleY).toBeCloseTo(LIQUID_MOTION.press.scale * (1 - (LIQUID_MOTION.press.stretch / 2) * Math.abs(nx)), 6);
  });

  it("starts a keyboard press from the centre: uniform compression, no lean", async () => {
    const onPress = vi.fn();
    await render(
      <LiquidPressable accessibilityLabel="홈" onPress={onPress}>
        <Text>홈</Text>
      </LiquidPressable>,
    );
    const [button] = byRole("button");
    await layout(button, { left: 0, top: 0, width: 200, height: 60 });
    await act(async () => { button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    const held = surfaceMotion();
    expect(held).toEqual({ translateX: 0, translateY: 0, scaleX: LIQUID_MOTION.press.scale, scaleY: LIQUID_MOTION.press.scale, opacity: 1 });
    await act(async () => { button.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true })); });
    await click(button); // the browser's activation click for a native <button>
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(surfaceMotion()).toEqual({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, opacity: 1 });
  });

  it("still gives a quick tap (released inside the press delay) its press and release", async () => {
    const onPress = vi.fn();
    await render(
      <LiquidPressable accessibilityLabel="분석" onPress={onPress}>
        <Text>분석</Text>
      </LiquidPressable>,
    );
    const [button] = byRole("button");
    await act(async () => { button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); });
    await pressOut(button);
    await click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(animationCalls.some((call) => call.kind === "spring" && call.toValue === LIQUID_MOTION.press.scale)).toBe(true);
    expect(animationCalls.some((call) => call.kind === "spring" && call.toValue === 1)).toBe(true);
  });

  it("uses no spring at all under reduced motion: an exact dim and small nudge, with no lean or stretch", async () => {
    await render(
      <LiquidPressable accessibilityLabel="분석" forceReducedMotion magnetic>
        <Text>분석</Text>
      </LiquidPressable>,
    );
    const [button] = byRole("button");
    await layout(button, { left: 0, top: 0, width: 200, height: 60 });
    await pressIn(button, 2, 2); // a corner press would lean and stretch with full motion
    expect(surfaceMotion()).toEqual({
      translateX: 0,
      translateY: 0,
      scaleX: REDUCED.pressedScale,
      scaleY: REDUCED.pressedScale,
      opacity: REDUCED.pressedOpacity,
    });
    await pressOut(button);
    expect(surfaceMotion()).toEqual({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, opacity: 1 });
    expect(animationCalls.filter((call) => call.kind === "spring")).toHaveLength(0);
    expect(animationCalls.every((call) => call.kind === "timing" && (call.config as { duration: number }).duration <= 160)).toBe(true);
  });

  it("returns fully to rest on release even if the motion setting changed mid-press", async () => {
    await render(
      <LiquidPressable accessibilityLabel="분석" forceReducedMotion>
        <Text>분석</Text>
      </LiquidPressable>,
    );
    await pressIn(byRole("button")[0]);
    expect(surfaceMotion().opacity).toBeCloseTo(REDUCED.pressedOpacity, 6);
    // e.g. the press itself switched the setting, or the system answer arrived mid-press
    await render(
      <LiquidPressable accessibilityLabel="분석">
        <Text>분석</Text>
      </LiquidPressable>,
    );
    await pressOut(byRole("button")[0]);
    expect(surfaceMotion()).toEqual({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, opacity: 1 });
  });

  it("owns reduction itself: every animation opts out of Reanimated's launch-time Reduce Motion snapshot", async () => {
    await render(
      <LiquidPressable accessibilityLabel="분석">
        <Text>분석</Text>
      </LiquidPressable>,
    );
    const [button] = byRole("button");
    await pressIn(button);
    await pressOut(button);
    expect(animationCalls.length).toBeGreaterThan(0);
    expect(animationCalls.every((call) => (call.config as { reduceMotion?: string }).reduceMotion === "never")).toBe(true);
  });

  it("registers magnetic attraction on the hit-area node only when asked and motion is allowed", async () => {
    await render(
      <LiquidPressable accessibilityLabel="홈" magnetic>
        <Text>홈</Text>
      </LiquidPressable>,
    );
    expect(registerMagneticTarget).toHaveBeenCalledTimes(1);
    expect(registerMagneticTarget.mock.calls[0][0]).toBe(byRole("button")[0]);
    expect(registerMagneticTarget.mock.calls[0][1]).toEqual({ radius: LIQUID_MOTION.magnetic.radius });
    await act(async () => root.render(null));
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it("never registers magnetic attraction under reduced motion, when disabled, or by default", async () => {
    await render(
      <>
        <LiquidPressable accessibilityLabel="a" magnetic forceReducedMotion><Text>a</Text></LiquidPressable>
        <LiquidPressable accessibilityLabel="b" magnetic disabled><Text>b</Text></LiquidPressable>
        <LiquidPressable accessibilityLabel="c"><Text>c</Text></LiquidPressable>
      </>,
    );
    expect(registerMagneticTarget).not.toHaveBeenCalled();
  });

  it("drops attraction as soon as reduced motion turns on", async () => {
    await render(
      <LiquidPressable accessibilityLabel="홈" magnetic>
        <Text>홈</Text>
      </LiquidPressable>,
    );
    expect(registerMagneticTarget).toHaveBeenCalledTimes(1);
    await render(
      <LiquidPressable accessibilityLabel="홈" magnetic forceReducedMotion>
        <Text>홈</Text>
      </LiquidPressable>,
    );
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(registerMagneticTarget).toHaveBeenCalledTimes(1);
    expect(surfaceMotion()).toMatchObject({ translateX: 0, translateY: 0 });
  });

  it("drifts by a bounded amount toward a nearby pointer, measured from the surface", async () => {
    await render(
      <LiquidPressable accessibilityLabel="홈" magnetic>
        <Text>홈</Text>
      </LiquidPressable>,
    );
    const [button] = byRole("button");
    await layout(button, { left: 0, top: 0, width: 200, height: 60 });
    const listener = registerMagneticTarget.mock.calls.at(-1)![2] as (p: { x: number; y: number } | null, s: { width: number; height: number }) => void;
    resetAnimationCalls();
    await act(async () => listener({ x: 206, y: 30 }, { width: 200, height: 60 })); // 6px right of the right edge
    const near = surfaceMotion();
    expect(near.translateX).toBeGreaterThan(0);
    expect(Math.hypot(near.translateX, near.translateY)).toBeLessThanOrEqual(LIQUID_MOTION.magnetic.maxOffset);
    expect(near.translateY).toBeCloseTo(0, 6);
    for (const call of animationCalls) expect(call.config).toMatchObject(LIQUID_SPRINGS.magnetic);
    await act(async () => listener(null, { width: 200, height: 60 }));
    expect(surfaceMotion()).toMatchObject({ translateX: 0, translateY: 0 });
    expect(FULL.magnetic.enabled).toBe(true);
  });
});
