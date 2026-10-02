import { describe, expect, it } from "vitest";

import {
  createFilmSpaceSliceStack,
  normalizeFilmSpaceCamera,
} from "@/lib/film-space/slice-stack";

describe("film-space slice-stack render plan", () => {
  it("builds a deterministic bounded slice plan with exactly one selected plane", () => {
    const stack = createFilmSpaceSliceStack(80, 39, {
      yawDegrees: -18,
      pitchDegrees: 7,
      zoom: 1,
    });

    expect(stack).toHaveLength(80);
    expect(stack[0].normalizedDepth).toBe(0);
    expect(stack[79].normalizedDepth).toBe(1);
    expect(stack[0].centeredDepth).toBe(-0.5);
    expect(stack[79].centeredDepth).toBe(0.5);
    expect(stack.filter((slice) => slice.selected)).toHaveLength(1);
    expect(stack[39].selected).toBe(true);
    expect(stack[39].opacity).toBe(0.92);
    expect(stack[38].opacity).toBe(0.035);

    for (const slice of stack) {
      expect([
        slice.normalizedDepth,
        slice.centeredDepth,
        slice.opacity,
        slice.translateXPx,
        slice.translateYPx,
        slice.scale,
        slice.zIndex,
      ].every(Number.isFinite)).toBe(true);
    }
  });

  it("normalizes display-only camera values without changing source-time ordering", () => {
    expect(normalizeFilmSpaceCamera({
      yawDegrees: 540,
      pitchDegrees: 100,
      zoom: 10,
    })).toEqual({
      yawDegrees: 180,
      pitchDegrees: 24,
      zoom: 1.5,
    });

    const stack = createFilmSpaceSliceStack(64, -100, {
      yawDegrees: 0,
      pitchDegrees: -100,
      zoom: 0.1,
    });
    expect(stack[0].selected).toBe(true);
    expect(stack.map((slice) => slice.index)).toEqual(
      Array.from({ length: 64 }, (_, index) => index),
    );
    expect(stack[0].scale).toBeCloseTo(0.8 * 0.84);
    expect(stack[63].scale).toBeCloseTo(0.8);
  });

  it("fails closed for non-finite or unbounded render inputs", () => {
    expect(() => createFilmSpaceSliceStack(0, 0, {
      yawDegrees: 0,
      pitchDegrees: 0,
      zoom: 1,
    })).toThrow(/1\.\.96/);
    expect(() => createFilmSpaceSliceStack(97, 0, {
      yawDegrees: 0,
      pitchDegrees: 0,
      zoom: 1,
    })).toThrow(/1\.\.96/);
    expect(() => createFilmSpaceSliceStack(80, Number.NaN, {
      yawDegrees: 0,
      pitchDegrees: 0,
      zoom: 1,
    })).toThrow(/selected index/);
    expect(() => normalizeFilmSpaceCamera({
      yawDegrees: Number.POSITIVE_INFINITY,
      pitchDegrees: 0,
      zoom: 1,
    })).toThrow(/yaw/);
  });
});
