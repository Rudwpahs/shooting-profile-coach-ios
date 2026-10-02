import { describe, expect, it } from "vitest";

import { LIQUID_MOTION, resolveLiquidMotion } from "@/components/ui/liquid/liquid-motion";
import {
  computeLiquidStretch,
  computeMagneticOffset,
  computeTouchLean,
  distanceOutsideRect,
  type MagneticConfig,
} from "@/components/ui/liquid/magnetic-target";
import { resolveRippleOrigin, rippleCanvasDiameter, rippleRadius, rippleTransform } from "@/components/ui/liquid/ripple-geometry";

const SIZE = { width: 160, height: 48 };
const CONFIG: MagneticConfig = {
  radius: LIQUID_MOTION.magnetic.radius,
  strength: LIQUID_MOTION.magnetic.strength,
  maxOffset: LIQUID_MOTION.magnetic.maxOffset,
};
const length = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);

/** Every pointer position on a grid that runs well past the target in each direction. */
function sweep(size = SIZE, margin = 120, step = 4) {
  const points: { x: number; y: number }[] = [];
  for (let x = -margin; x <= size.width + margin; x += step) {
    for (let y = -margin; y <= size.height + margin; y += step) points.push({ x, y });
  }
  return points;
}

describe("distanceOutsideRect", () => {
  it("is zero inside and measures the gap to the nearest edge outside", () => {
    expect(distanceOutsideRect({ x: 80, y: 24 }, SIZE)).toBe(0);
    expect(distanceOutsideRect({ x: 0, y: 0 }, SIZE)).toBe(0);
    expect(distanceOutsideRect({ x: -10, y: 24 }, SIZE)).toBe(10);
    expect(distanceOutsideRect({ x: 170, y: 58 }, SIZE)).toBeCloseTo(Math.hypot(10, 10), 6);
  });
});

describe("computeMagneticOffset", () => {
  it("never displaces the surface further than maxOffset, for any pointer position", () => {
    let largest = 0;
    for (const point of sweep()) largest = Math.max(largest, length(computeMagneticOffset(point, SIZE, CONFIG)));
    expect(largest).toBeLessThanOrEqual(CONFIG.maxOffset + 1e-9);
    expect(largest).toBeGreaterThan(CONFIG.maxOffset * 0.5);
  });

  it("stays put when the pointer is at the centre or beyond the attraction radius", () => {
    expect(computeMagneticOffset({ x: 80, y: 24 }, SIZE, CONFIG)).toEqual({ x: 0, y: 0 });
    expect(computeMagneticOffset({ x: SIZE.width + CONFIG.radius + 1, y: 24 }, SIZE, CONFIG)).toEqual({ x: 0, y: 0 });
    expect(computeMagneticOffset({ x: -500, y: -500 }, SIZE, CONFIG)).toEqual({ x: 0, y: 0 });
  });

  it("leans toward the pointer", () => {
    const right = computeMagneticOffset({ x: SIZE.width + 4, y: 24 }, SIZE, CONFIG);
    expect(right.x).toBeGreaterThan(0);
    expect(Math.abs(right.y)).toBeLessThan(1e-9);
    const upLeft = computeMagneticOffset({ x: -4, y: -4 }, SIZE, CONFIG);
    expect(upLeft.x).toBeLessThan(0);
    expect(upLeft.y).toBeLessThan(0);
  });

  it("fades out continuously as the pointer leaves the attraction radius (no snap)", () => {
    const at = (gap: number) => length(computeMagneticOffset({ x: SIZE.width + gap, y: 24 }, SIZE, CONFIG));
    const steps = Array.from({ length: 29 }, (_, i) => at(i));
    for (let i = 1; i < steps.length; i += 1) expect(steps[i]).toBeLessThanOrEqual(steps[i - 1] + 1e-9);
    expect(at(CONFIG.radius - 0.5)).toBeLessThan(0.05);
    expect(at(CONFIG.radius)).toBe(0);
  });

  it("is inert when reduced motion disables attraction, and safe on degenerate input", () => {
    const reduced = resolveLiquidMotion(true).magnetic;
    for (const point of sweep(SIZE, 60, 12)) {
      expect(computeMagneticOffset(point, SIZE, reduced)).toEqual({ x: 0, y: 0 });
    }
    expect(computeMagneticOffset({ x: 1, y: 1 }, { width: 0, height: 0 }, CONFIG)).toEqual({ x: 0, y: 0 });
    expect(computeMagneticOffset({ x: Number.NaN, y: 1 }, SIZE, CONFIG)).toEqual({ x: 0, y: 0 });
  });
});

describe("computeTouchLean", () => {
  it("leans at most maxLean toward the touch and not at all from the centre", () => {
    let largest = 0;
    for (const point of sweep(SIZE, 40, 4)) largest = Math.max(largest, length(computeTouchLean(point, SIZE, 2)));
    expect(largest).toBeLessThanOrEqual(2 + 1e-9);
    expect(computeTouchLean({ x: 80, y: 24 }, SIZE, 2)).toEqual({ x: 0, y: 0 });
    expect(computeTouchLean({ x: 160, y: 24 }, SIZE, 2).x).toBeCloseTo(2, 6);
    expect(computeTouchLean({ x: 0, y: 24 }, SIZE, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe("computeLiquidStretch", () => {
  it("is the identity at the centre and when stretch is disabled", () => {
    expect(computeLiquidStretch({ x: 80, y: 24 }, SIZE, 0.02)).toEqual({ scaleX: 1, scaleY: 1 });
    expect(computeLiquidStretch({ x: 0, y: 0 }, SIZE, 0)).toEqual({ scaleX: 1, scaleY: 1 });
  });

  it("elongates toward the touch axis and thins the other, within the bound", () => {
    const amount = 0.02;
    const edge = computeLiquidStretch({ x: 160, y: 24 }, SIZE, amount);
    expect(edge.scaleX).toBeGreaterThan(1);
    expect(edge.scaleY).toBeLessThan(1);
    for (const point of sweep(SIZE, 40, 4)) {
      const s = computeLiquidStretch(point, SIZE, amount);
      for (const value of [s.scaleX, s.scaleY]) {
        expect(value).toBeGreaterThanOrEqual(1 - amount / 2 - 1e-9);
        expect(value).toBeLessThanOrEqual(1 + amount + 1e-9);
      }
    }
  });
});

describe("ripple geometry", () => {
  it("clamps the origin into the surface and falls back to the centre (keyboard press)", () => {
    expect(resolveRippleOrigin({ x: 10, y: 12 }, SIZE)).toEqual({ x: 10, y: 12 });
    expect(resolveRippleOrigin({ x: -30, y: 99 }, SIZE)).toEqual({ x: 0, y: 48 });
    expect(resolveRippleOrigin(undefined, SIZE)).toEqual({ x: 80, y: 24 });
    expect(resolveRippleOrigin({ x: undefined, y: 3 }, SIZE)).toEqual({ x: 80, y: 24 });
    expect(resolveRippleOrigin({ x: Number.NaN, y: 3 }, SIZE)).toEqual({ x: 80, y: 24 });
  });

  it("reaches the farthest corner so the ripple always covers the whole surface", () => {
    expect(rippleRadius({ x: 0, y: 0 }, SIZE)).toBeCloseTo(Math.hypot(160, 48), 6);
    expect(rippleRadius({ x: 80, y: 24 }, SIZE)).toBeCloseTo(Math.hypot(80, 24), 6);
  });

  it("uses one fixed-size circle per surface and moves it with transform only", () => {
    const diameter = rippleCanvasDiameter(SIZE);
    expect(diameter).toBeCloseTo(2 * Math.hypot(160, 48), 6);
    for (const origin of [{ x: 0, y: 0 }, { x: 160, y: 48 }, { x: 37, y: 11 }, { x: 80, y: 24 }]) {
      const t = rippleTransform(origin, SIZE, 0.2);
      // translate puts the circle's centre on the origin
      expect(t.translateX + diameter / 2).toBeCloseTo(origin.x, 6);
      expect(t.translateY + diameter / 2).toBeCloseTo(origin.y, 6);
      // the end state covers the farthest corner and never needs more than the canvas
      expect(t.endScale * (diameter / 2)).toBeGreaterThanOrEqual(rippleRadius(origin, SIZE) - 1e-6);
      expect(t.endScale).toBeLessThanOrEqual(1 + 1e-9);
      expect(t.startScale).toBeCloseTo(t.endScale * 0.2, 9);
    }
  });

  it("is safe before layout (zero size)", () => {
    expect(rippleCanvasDiameter({ width: 0, height: 0 })).toBe(0);
    const t = rippleTransform({ x: 0, y: 0 }, { width: 0, height: 0 }, 0.2);
    expect([t.translateX, t.translateY, t.startScale, t.endScale].every(Number.isFinite)).toBe(true);
  });
});
