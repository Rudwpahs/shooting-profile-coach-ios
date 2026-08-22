import { describe, expect, it } from "vitest";

import {
  restoreSourceLandmarks,
  restoreSourcePoint,
  type SourceTransformV2,
} from "@/lib/shooting-profile/coordinate-space";

function fullFrameTransform(
  rotationDeg: SourceTransformV2["rotationDeg"] = 0,
  mirrored = false,
): SourceTransformV2 {
  const swapsAxes = rotationDeg === 90 || rotationDeg === 270;
  return {
    sourceWidth: 800,
    sourceHeight: 600,
    cropRectPx: {
      x: 0,
      y: 0,
      width: swapsAxes ? 600 : 800,
      height: swapsAxes ? 800 : 600,
    },
    contentRect: { x: 0, y: 0, width: 1, height: 1 },
    mirrored,
    rotationDeg,
  };
}

describe("restoreSourcePoint", () => {
  it("undoes a crop without confusing width and height scales", () => {
    const point = restoreSourcePoint({ x: 0.5, y: 0.25 }, {
      sourceWidth: 1920,
      sourceHeight: 1080,
      cropRectPx: { x: 480, y: 108, width: 960, height: 864 },
      contentRect: { x: 0, y: 0, width: 1, height: 1 },
      mirrored: false,
      rotationDeg: 0,
    });

    expect(point.x).toBeCloseTo(0.5, 6);
    expect(point.y).toBeCloseTo(0.3, 6);
  });

  it("removes normalized model letterboxing before restoring the crop", () => {
    const point = restoreSourcePoint({ x: 0.25, y: 0.375 }, {
      sourceWidth: 640,
      sourceHeight: 320,
      cropRectPx: { x: 0, y: 0, width: 640, height: 320 },
      contentRect: { x: 0, y: 0.25, width: 1, height: 0.5 },
      mirrored: false,
      rotationDeg: 0,
    });

    expect(point).toEqual({ x: 0.25, y: 0.25 });
  });

  it("undoes horizontal mirroring in the oriented image", () => {
    const point = restoreSourcePoint({ x: 0.2, y: 0.4 }, fullFrameTransform(0, true));

    expect(point.x).toBeCloseTo(0.8, 12);
    expect(point.y).toBeCloseTo(0.4, 12);
  });

  it.each([
    { rotationDeg: 0 as const, modelPoint: { x: 0.2, y: 0.3 } },
    { rotationDeg: 90 as const, modelPoint: { x: 0.7, y: 0.2 } },
    { rotationDeg: 180 as const, modelPoint: { x: 0.8, y: 0.7 } },
    { rotationDeg: 270 as const, modelPoint: { x: 0.3, y: 0.8 } },
  ])("undoes a $rotationDeg-degree clockwise source orientation within half a pixel", ({
    rotationDeg,
    modelPoint,
  }) => {
    const point = restoreSourcePoint(modelPoint, fullFrameTransform(rotationDeg));

    expect(Math.abs((point.x - 0.2) * 800)).toBeLessThanOrEqual(0.5);
    expect(Math.abs((point.y - 0.3) * 600)).toBeLessThanOrEqual(0.5);
  });

  it("undoes mirror before rotation when both transforms are present", () => {
    // Upright (0.2, 0.3) rotates clockwise to (0.7, 0.2), then mirrors to (0.3, 0.2).
    const point = restoreSourcePoint({ x: 0.3, y: 0.2 }, fullFrameTransform(90, true));

    expect(point.x).toBeCloseTo(0.2, 12);
    expect(point.y).toBeCloseTo(0.3, 12);
  });

  it("allows at most one source pixel outside model content", () => {
    const transform: SourceTransformV2 = {
      sourceWidth: 100,
      sourceHeight: 50,
      cropRectPx: { x: 0, y: 0, width: 100, height: 50 },
      contentRect: { x: 0, y: 0, width: 1, height: 1 },
      mirrored: false,
      rotationDeg: 0,
    };

    expect(restoreSourcePoint({ x: -0.01, y: 1.02 }, transform)).toEqual({ x: -0.01, y: 1.02 });
    expect(() => restoreSourcePoint({ x: -0.010_001, y: 0.5 }, transform)).toThrow();
    expect(() => restoreSourcePoint({ x: 0.5, y: 1.020_001 }, transform)).toThrow();
  });

  it("rejects non-finite values, invalid dimensions, and unsupported rotations", () => {
    const valid = fullFrameTransform();

    expect(() => restoreSourcePoint({ x: Number.NaN, y: 0.5 }, valid)).toThrow();
    expect(() => restoreSourcePoint({ x: 0.5, y: 0.5 }, { ...valid, sourceWidth: 0 })).toThrow();
    expect(() => restoreSourcePoint({ x: 0.5, y: 0.5 }, {
      ...valid,
      cropRectPx: { ...valid.cropRectPx, height: -1 },
    })).toThrow();
    expect(() => restoreSourcePoint({ x: 0.5, y: 0.5 }, {
      ...valid,
      contentRect: { ...valid.contentRect, width: 0 },
    })).toThrow();
    expect(() => restoreSourcePoint({ x: 0.5, y: 0.5 }, {
      ...valid,
      rotationDeg: 45 as SourceTransformV2["rotationDeg"],
    })).toThrow();
  });

  it("rejects crops outside the oriented image, including swapped 90-degree dimensions", () => {
    const upright = fullFrameTransform();
    expect(() => restoreSourcePoint({ x: 0.5, y: 0.5 }, {
      ...upright,
      cropRectPx: { x: -1, y: 0, width: 800, height: 600 },
    })).toThrow();
    expect(() => restoreSourcePoint({ x: 0.5, y: 0.5 }, {
      ...upright,
      cropRectPx: { x: 1, y: 0, width: 800, height: 600 },
    })).toThrow();
    expect(() => restoreSourcePoint({ x: 0.5, y: 0.5 }, {
      ...upright,
      cropRectPx: { x: 0, y: 1, width: 800, height: 600 },
    })).toThrow();

    const rotated = fullFrameTransform(90);
    // A 90-degree image is 600 x 800, not the upright source's 800 x 600.
    expect(() => restoreSourcePoint({ x: 0.5, y: 0.5 }, {
      ...rotated,
      cropRectPx: { x: 0, y: 0, width: 601, height: 800 },
    })).toThrow();
    expect(() => restoreSourcePoint({ x: 0.5, y: 0.5 }, {
      ...rotated,
      cropRectPx: { x: 0, y: 0, width: 600, height: 801 },
    })).toThrow();
  });

  it("rejects model content rectangles outside normalized input bounds", () => {
    const valid = fullFrameTransform();
    expect(() => restoreSourcePoint({ x: 0.5, y: 0.5 }, {
      ...valid,
      contentRect: { x: -0.01, y: 0, width: 1, height: 1 },
    })).toThrow();
    expect(() => restoreSourcePoint({ x: 0.5, y: 0.5 }, {
      ...valid,
      contentRect: { x: 0, y: -0.01, width: 1, height: 1 },
    })).toThrow();
    expect(() => restoreSourcePoint({ x: 0.5, y: 0.5 }, {
      ...valid,
      contentRect: { x: 0.2, y: 0, width: 0.81, height: 1 },
    })).toThrow();
    expect(() => restoreSourcePoint({ x: 0.5, y: 0.5 }, {
      ...valid,
      contentRect: { x: 0, y: 0.2, width: 1, height: 0.81 },
    })).toThrow();
  });
});

describe("restoreSourceLandmarks", () => {
  it("preserves observation metadata while explicitly excluding image-relative z", () => {
    const restored = restoreSourceLandmarks([
      { x: 0.2, y: 0.3, z: 99, visibility: 0.75 },
      { x: 0.4, y: 0.6, z: -99 },
    ], fullFrameTransform());

    expect(restored).toEqual([
      { x: 0.2, y: 0.3, visibility: 0.75 },
      { x: 0.4, y: 0.6 },
    ]);
    expect(restored.every((landmark) => !("z" in landmark))).toBe(true);
  });
});
