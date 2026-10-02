/**
 * Ripple geometry. One fixed-size circle per surface (sized once, on layout)
 * is moved and scaled with transforms only, so a ripple never triggers layout.
 * Pure and platform-neutral.
 */
import type { LiquidPoint, LiquidSize } from "./magnetic-target";

export type RippleTransform = { translateX: number; translateY: number; startScale: number; endScale: number };

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Where a ripple starts: the press point clamped into the surface, or the
 * centre when there is no usable point (keyboard or assistive activation).
 */
export function resolveRippleOrigin(point: Partial<LiquidPoint> | null | undefined, size: LiquidSize): LiquidPoint {
  const centre = { x: size.width / 2, y: size.height / 2 };
  if (!point || !finite(point.x) || !finite(point.y)) return centre;
  return {
    x: Math.min(size.width, Math.max(0, point.x)),
    y: Math.min(size.height, Math.max(0, point.y)),
  };
}

/** Distance from the origin to the farthest corner: the radius that covers the whole surface. */
export function rippleRadius(origin: LiquidPoint, size: LiquidSize): number {
  const dx = Math.max(origin.x, size.width - origin.x);
  const dy = Math.max(origin.y, size.height - origin.y);
  return Math.hypot(dx, dy);
}

/** Diameter of the fixed circle: large enough for any origin inside the surface. */
export function rippleCanvasDiameter(size: LiquidSize): number {
  if (!(size.width > 0) || !(size.height > 0)) return 0;
  return 2 * Math.hypot(size.width, size.height);
}

/**
 * Transform that centres the fixed circle on `origin` and scales it from
 * `startFraction` of the covering radius up to the covering radius.
 */
export function rippleTransform(origin: LiquidPoint, size: LiquidSize, startFraction: number): RippleTransform {
  const diameter = rippleCanvasDiameter(size);
  if (diameter === 0) return { translateX: 0, translateY: 0, startScale: 0, endScale: 0 };
  const endScale = Math.min(1, rippleRadius(origin, size) / (diameter / 2));
  return {
    translateX: origin.x - diameter / 2,
    translateY: origin.y - diameter / 2,
    startScale: endScale * startFraction,
    endScale,
  };
}
