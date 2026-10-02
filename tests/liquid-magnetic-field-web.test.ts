// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAGNETIC_FIELD_SUPPORTED, registerMagneticTarget } from "@/components/ui/liquid/magnetic-field.web";

/** jsdom has no layout, so each target reports a fixed client rect. */
function target(left: number, top: number, width: number, height: number): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

function move(clientX: number, clientY: number, pointerType = "mouse") {
  const event = new MouseEvent("pointermove", { clientX, clientY, bubbles: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  window.dispatchEvent(event);
}

let frames: FrameRequestCallback[] = [];
const flush = () => {
  const pending = frames;
  frames = [];
  pending.forEach((cb) => cb(performance.now()));
};

beforeEach(() => {
  frames = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.push(cb);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("web magnetic field", () => {
  it("is supported on web", () => {
    expect(MAGNETIC_FIELD_SUPPORTED).toBe(true);
  });

  it("reports the mouse position in the target's local coordinates while it is near", () => {
    const el = target(100, 200, 80, 40);
    const listener = vi.fn();
    const stop = registerMagneticTarget(el, { radius: 24 }, listener);

    move(190, 215); // 10px right of the right edge
    expect(listener).not.toHaveBeenCalled(); // coalesced to the next animation frame
    flush();
    expect(listener).toHaveBeenLastCalledWith({ x: 90, y: 15 }, { width: 80, height: 40 });
    stop();
  });

  it("coalesces a burst of pointer events into one update per frame", () => {
    const el = target(0, 0, 50, 50);
    const listener = vi.fn();
    const stop = registerMagneticTarget(el, { radius: 20 }, listener);
    for (let i = 0; i < 10; i += 1) move(25 + i, 25);
    flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith({ x: 34, y: 25 }, { width: 50, height: 50 });
    stop();
  });

  it("releases the target once when the pointer leaves the radius, then stays quiet", () => {
    const el = target(0, 0, 50, 50);
    const listener = vi.fn();
    const stop = registerMagneticTarget(el, { radius: 20 }, listener);
    move(60, 25);
    flush();
    expect(listener).toHaveBeenCalledTimes(1);
    move(400, 25);
    flush();
    expect(listener).toHaveBeenLastCalledWith(null, { width: 50, height: 50 });
    move(500, 25);
    flush();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
  });

  it("ignores touch and pen pointers (magnetic attraction is a hover affordance)", () => {
    const el = target(0, 0, 50, 50);
    const listener = vi.fn();
    const stop = registerMagneticTarget(el, { radius: 20 }, listener);
    move(25, 25, "touch");
    move(25, 25, "pen");
    flush();
    expect(listener).not.toHaveBeenCalled();
    stop();
  });

  it("releases every target when the pointer leaves the window", () => {
    const el = target(0, 0, 50, 50);
    const listener = vi.fn();
    const stop = registerMagneticTarget(el, { radius: 20 }, listener);
    move(25, 25);
    flush();
    window.dispatchEvent(new Event("blur"));
    flush();
    expect(listener).toHaveBeenLastCalledWith(null, { width: 50, height: 50 });
    stop();
  });

  it("re-measures when content scrolls under a still pointer", () => {
    let top = 0;
    const el = document.createElement("div");
    el.getBoundingClientRect = () => ({ left: 0, top, width: 50, height: 50, right: 50, bottom: top + 50, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(el);
    const listener = vi.fn();
    const stop = registerMagneticTarget(el, { radius: 20 }, listener);
    move(25, 60); // 10px below the bottom edge
    flush();
    expect(listener).toHaveBeenLastCalledWith({ x: 25, y: 60 }, { width: 50, height: 50 });
    top = -200; // the list scrolled; the pointer has not moved
    document.dispatchEvent(new Event("scroll")); // scroll events do not bubble: the field listens in capture
    flush();
    expect(listener).toHaveBeenLastCalledWith(null, { width: 50, height: 50 });
    stop();
  });

  it("adds one shared window listener and removes it with the last target", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const a = registerMagneticTarget(target(0, 0, 10, 10), { radius: 10 }, vi.fn());
    const b = registerMagneticTarget(target(50, 0, 10, 10), { radius: 10 }, vi.fn());
    expect(add.mock.calls.filter(([type]) => type === "pointermove")).toHaveLength(1);
    a();
    expect(remove.mock.calls.filter(([type]) => type === "pointermove")).toHaveLength(0);
    b();
    expect(remove.mock.calls.filter(([type]) => type === "pointermove")).toHaveLength(1);
  });

  it("does nothing for a node that is not a DOM element", () => {
    const listener = vi.fn();
    const stop = registerMagneticTarget({} as unknown, { radius: 20 }, listener);
    move(1, 1);
    flush();
    expect(listener).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });
});
