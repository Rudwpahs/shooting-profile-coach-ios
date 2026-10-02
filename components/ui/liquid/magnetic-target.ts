/**
 * Pointer geometry for liquid surfaces: magnetic attraction, touch lean and
 * droplet stretch. Pure and platform-neutral; every output is bounded so the
 * visual surface can never drift far from its (unmoving) hit area.
 *
 * Coordinates are local to the surface: (0, 0) is its top-left corner and a
 * pointer may lie outside it.
 */

export type LiquidPoint = { x: number; y: number };
export type LiquidSize = { width: number; height: number };
export type MagneticConfig = { radius: number; strength: number; maxOffset: number };
export type LiquidStretch = { scaleX: number; scaleY: number };

const ZERO: LiquidPoint = { x: 0, y: 0 };
const IDENTITY: LiquidStretch = { scaleX: 1, scaleY: 1 };

/** Normalises -0 so callers and tests see a plain 0. */
const tidy = (value: number) => (value === 0 ? 0 : value);

function usable(point: LiquidPoint, size: LiquidSize): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}

function limitLength(x: number, y: number, max: number): LiquidPoint {
  const length = Math.hypot(x, y);
  if (length <= max || length === 0) return { x: tidy(x), y: tidy(y) };
  const k = max / length;
  return { x: tidy(x * k), y: tidy(y * k) };
}

/** Gap between a point and the surface's edge; 0 when the point is on or inside it. */
export function distanceOutsideRect(point: LiquidPoint, size: LiquidSize): number {
  const dx = Math.max(0 - point.x, 0, point.x - size.width);
  const dy = Math.max(0 - point.y, 0, point.y - size.height);
  return Math.hypot(dx, dy);
}

/** 0 → 1 with zero slope at both ends, so attraction fades in and out without a snap. */
function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/**
 * How far (px) the surface drifts toward a nearby pointer. Inside the surface
 * it follows `strength` of the pointer's offset from centre; outside, the pull
 * fades smoothly to nothing at `radius` px from the edge. The result is
 * clamped to `maxOffset` in every direction.
 */
export function computeMagneticOffset(pointer: LiquidPoint, size: LiquidSize, config: MagneticConfig): LiquidPoint {
  if (!usable(pointer, size) || !(config.maxOffset > 0) || !(config.strength > 0)) return ZERO;
  const outside = distanceOutsideRect(pointer, size);
  if (outside >= config.radius) return ZERO;
  const falloff = smoothstep(1 - outside / config.radius);
  const dx = pointer.x - size.width / 2;
  const dy = pointer.y - size.height / 2;
  const reach = Math.hypot(dx, dy);
  if (reach === 0 || falloff === 0) return ZERO;
  const magnitude = Math.min(config.maxOffset, reach * config.strength) * falloff;
  return limitLength((dx / reach) * magnitude, (dy / reach) * magnitude, config.maxOffset);
}

function normalised(point: LiquidPoint, size: LiquidSize): LiquidPoint {
  const nx = (point.x - size.width / 2) / (size.width / 2);
  const ny = (point.y - size.height / 2) / (size.height / 2);
  return { x: Math.min(1, Math.max(-1, nx)), y: Math.min(1, Math.max(-1, ny)) };
}

/** Lean (px) toward the touch point: none at the centre, `maxLean` at an edge. */
export function computeTouchLean(point: LiquidPoint, size: LiquidSize, maxLean: number): LiquidPoint {
  if (!usable(point, size) || !(maxLean > 0)) return ZERO;
  const n = normalised(point, size);
  return limitLength(n.x * maxLean, n.y * maxLean, maxLean);
}

/**
 * Droplet stretch toward the touch axis: the surface elongates by up to
 * `amount` along the axis of the touch and thins by half as much across it,
 * so it reads as liquid being drawn toward the finger. Each factor stays in
 * [1 − amount/2, 1 + amount].
 */
export function computeLiquidStretch(point: LiquidPoint, size: LiquidSize, amount: number): LiquidStretch {
  if (!usable(point, size) || !(amount > 0)) return IDENTITY;
  const n = normalised(point, size);
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  return {
    scaleX: 1 + amount * ax - (amount / 2) * ay,
    scaleY: 1 + amount * ay - (amount / 2) * ax,
  };
}
