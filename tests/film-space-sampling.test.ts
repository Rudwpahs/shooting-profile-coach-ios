import { describe, expect, it } from "vitest";

import { createFilmSpaceSamplingPlan } from "@/lib/film-space/sampling";

describe("film-space deterministic sampling", () => {
  it("creates deterministic 64-96 slice plans with bounded raw RGBA budget", () => {
    const plan = createFilmSpaceSamplingPlan(3000, {
      preferredSlices: 80,
      targetLongEdgePx: 240,
    });
    expect(plan.sliceCount).toBe(80);
    expect(plan.timestampsMs[0]).toBe(0);
    expect(plan.timestampsMs.at(-1)).toBe(3000);
    expect(plan.timestampsMs).toEqual([...plan.timestampsMs].sort((a, b) => a - b));
    expect(new Set(plan.timestampsMs).size).toBe(plan.sliceCount);
    expect(plan.estimatedRawRgbaBytes).toBeLessThanOrEqual(plan.maxRawRgbaBytes);
  });

  it("is byte-deterministic for identical metadata and clamps visual density", () => {
    const first = createFilmSpaceSamplingPlan(20_000, { preferredSlices: 500, targetLongEdgePx: 999 });
    const second = createFilmSpaceSamplingPlan(20_000, { preferredSlices: 500, targetLongEdgePx: 999 });
    expect(first).toEqual(second);
    expect(first.sliceCount).toBeGreaterThanOrEqual(64);
    expect(first.sliceCount).toBeLessThanOrEqual(96);
    expect(first.targetLongEdgePx).toBeLessThanOrEqual(300);
    expect(first.estimatedRawRgbaBytes).toBeLessThanOrEqual(first.maxRawRgbaBytes);
  });

  it("rejects invalid or pathologically short duration metadata explicitly", () => {
    expect(() => createFilmSpaceSamplingPlan(Number.NaN)).toThrow(/duration/i);
    expect(() => createFilmSpaceSamplingPlan(Number.POSITIVE_INFINITY)).toThrow(/duration/i);
    expect(() => createFilmSpaceSamplingPlan(0)).toThrow(/duration/i);
    expect(() => createFilmSpaceSamplingPlan(100)).toThrow(/short|duration/i);
  });

  it("keeps long clips bounded instead of scaling slice count with duration", () => {
    const plan = createFilmSpaceSamplingPlan(10 * 60_000, { preferredSlices: 80 });
    expect(plan.sliceCount).toBe(80);
    expect(plan.timestampsMs.at(-1)).toBe(10 * 60_000);
  });
});