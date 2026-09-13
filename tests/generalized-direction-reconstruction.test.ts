import { describe, expect, it } from "vitest";

import type { Vector3 } from "@/lib/pose-motion";
import { reconstructBoneDirection } from "@/lib/shooting-profile/direction-reconstruction";
import {
  reconstructBoneDirectionFromYawViews,
} from "@/lib/shooting-profile/generalized-direction-reconstruction";

function rad(degrees: number): number {
  return degrees * Math.PI / 180;
}

function unit(vector: Vector3): Vector3 {
  const magnitude = Math.hypot(vector.x, vector.y, vector.z);
  return { x: vector.x / magnitude, y: vector.y / magnitude, z: vector.z / magnitude };
}

function projectionObservation(vector: Vector3, yawDegrees: number) {
  const yaw = rad(yawDegrees);
  const horizontal = Math.cos(yaw) * vector.x + Math.sin(yaw) * vector.z;
  const vertical = vector.y;
  return {
    yawDegrees,
    angleRadians: Math.atan2(horizontal, vertical),
    projectionLength: Math.hypot(horizontal, vertical),
    verticalSign: vertical < 0 ? -1 as const : 1 as const,
  };
}

function expectDirectionClose(actual: Vector3, expected: Vector3, tolerance = 1e-10): void {
  expect(actual.x).toBeCloseTo(expected.x, Math.max(0, Math.round(-Math.log10(tolerance))));
  expect(actual.y).toBeCloseTo(expected.y, Math.max(0, Math.round(-Math.log10(tolerance))));
  expect(actual.z).toBeCloseTo(expected.z, Math.max(0, Math.round(-Math.log10(tolerance))));
}

describe("generalized camera-yaw direction reconstruction", () => {
  it("is numerically equivalent to the legacy right-handed 0° + 90° solver", () => {
    const cases = [
      { alpha: 12, beta: 18 },
      { alpha: 35, beta: -22 },
      { alpha: -28, beta: 41 },
      { alpha: 55, beta: 33 },
    ];

    for (const testCase of cases) {
      const legacy = reconstructBoneDirection({
        alpha: rad(testCase.alpha),
        beta: rad(testCase.beta),
        verticalSign: 1,
        sideAxisSign: 1,
      });
      const generalized = reconstructBoneDirectionFromYawViews({
        first: { yawDegrees: 0, angleRadians: rad(testCase.alpha) },
        second: { yawDegrees: 90, angleRadians: rad(testCase.beta) },
        verticalSign: 1,
      });

      expect(generalized.status).toBe(legacy.status);
      if (legacy.status === "accepted" && generalized.status === "accepted") {
        expectDirectionClose(generalized.direction, legacy.direction);
        expect(generalized.conditioning).toBeCloseTo(legacy.conditioning, 12);
      }
    }
  });

  it("is numerically equivalent to the legacy left-handed 0° + -90° solver", () => {
    const alpha = rad(31);
    const beta = rad(-24);
    const legacy = reconstructBoneDirection({
      alpha,
      beta,
      verticalSign: 1,
      sideAxisSign: -1,
    });
    const generalized = reconstructBoneDirectionFromYawViews({
      first: { yawDegrees: 0, angleRadians: alpha },
      second: { yawDegrees: -90, angleRadians: beta },
      verticalSign: 1,
    });

    expect(generalized.status).toBe(legacy.status);
    if (legacy.status === "accepted" && generalized.status === "accepted") {
      expectDirectionClose(generalized.direction, legacy.direction);
      expect(generalized.conditioning).toBeCloseTo(legacy.conditioning, 12);
    }
  });

  it("recovers a known 3D direction from front 0° and shooting-side oblique 60°", () => {
    const truth = unit({ x: 0.3, y: 0.8, z: 0.52 });
    const result = reconstructBoneDirectionFromYawViews({
      first: projectionObservation(truth, 0),
      second: projectionObservation(truth, 60),
      verticalSign: 1,
    });

    expect(result.status).toBe("accepted");
    if (result.status === "accepted") expectDirectionClose(result.direction, truth);
  });

  it("recovers a known 3D direction from symmetric -45° and +45° views", () => {
    const truth = unit({ x: -0.42, y: 0.71, z: 0.57 });
    const result = reconstructBoneDirectionFromYawViews({
      first: projectionObservation(truth, -45),
      second: projectionObservation(truth, 45),
      verticalSign: 1,
    });

    expect(result.status).toBe("accepted");
    if (result.status === "accepted") expectDirectionClose(result.direction, truth);
  });

  it("fails closed when two yaw views are too poorly conditioned for the observed direction", () => {
    const truth = unit({ x: 0.3, y: 0.8, z: 0.52 });
    const result = reconstructBoneDirectionFromYawViews({
      first: projectionObservation(truth, 0),
      second: projectionObservation(truth, 5),
      verticalSign: 1,
    });

    expect(result).toEqual({
      status: "rejected",
      reason: "ill_conditioned_projection_constraints",
    });
  });

  it("rejects an explicit vertical-sign contradiction", () => {
    const truth = unit({ x: 0.3, y: 0.8, z: 0.52 });
    const first = projectionObservation(truth, 0);
    const second = projectionObservation(truth, 60);
    const result = reconstructBoneDirectionFromYawViews({
      first: { ...first, verticalSign: -1 },
      second,
      verticalSign: 1,
    });

    expect(result).toEqual({
      status: "rejected",
      reason: "vertical_sign_disagreement",
    });
  });
});
