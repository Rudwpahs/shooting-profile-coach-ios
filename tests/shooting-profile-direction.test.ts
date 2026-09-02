import { describe, expect, it } from "vitest";

import type { Vector3 } from "@/lib/pose-motion";
import {
  angleBetweenDirections,
  reconstructBoneDirection,
  type DirectionRejectionReason,
  type DirectionReconstructionResult,
  type DirectionSign,
} from "@/lib/shooting-profile/direction-reconstruction";

const rad = (degrees: number) => degrees * Math.PI / 180;
const deg = (radians: number) => radians * 180 / Math.PI;

function expectRejected(
  result: DirectionReconstructionResult,
  reason: DirectionRejectionReason,
): void {
  expect(result).toEqual({ status: "rejected", reason });
  expect("direction" in result).toBe(false);
}

describe("reconstructBoneDirection", () => {
  it.each([
    { alpha: 45, beta: 30, verticalSign: 1 as const, xSign: 1, zSign: 1 },
    { alpha: -45, beta: -30, verticalSign: 1 as const, xSign: -1, zSign: -1 },
    { alpha: 135, beta: 150, verticalSign: -1 as const, xSign: 1, zSign: 1 },
    { alpha: -135, beta: -150, verticalSign: -1 as const, xSign: -1, zSign: -1 },
  ])("preserves the signed $alpha/$beta-degree quadrant", ({
    alpha,
    beta,
    verticalSign,
    xSign,
    zSign,
  }) => {
    const result = reconstructBoneDirection({
      alpha: rad(alpha),
      beta: rad(beta),
      verticalSign,
      sideAxisSign: 1,
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(Math.sign(result.direction.x)).toBe(xSign);
    expect(Math.sign(result.direction.y)).toBe(verticalSign);
    expect(Math.sign(result.direction.z)).toBe(zSign);
    expect(Math.hypot(result.direction.x, result.direction.y, result.direction.z)).toBeCloseTo(1, 12);
    expect(result.conditioning).toBeGreaterThanOrEqual(0.1);
  });

  it("preserves a downward bone from the full signed-angle quadrants", () => {
    const result = reconstructBoneDirection({
      alpha: rad(135),
      beta: rad(180),
      verticalSign: -1,
      sideAxisSign: 1,
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.direction.x).toBeGreaterThan(0);
    expect(result.direction.y).toBeLessThan(0);
    expect(Math.abs(result.direction.z)).toBeLessThan(1e-12);
  });

  it("applies the shooting-side axis sign explicitly without changing front x/y", () => {
    const positiveAxis = reconstructBoneDirection({
      alpha: rad(30),
      beta: rad(40),
      verticalSign: 1,
      sideAxisSign: 1,
    });
    const negativeAxis = reconstructBoneDirection({
      alpha: rad(30),
      beta: rad(40),
      verticalSign: 1,
      sideAxisSign: -1,
    });

    expect(positiveAxis.status).toBe("accepted");
    expect(negativeAxis.status).toBe("accepted");
    if (positiveAxis.status !== "accepted" || negativeAxis.status !== "accepted") return;
    expect(positiveAxis.direction.x).toBeCloseTo(negativeAxis.direction.x, 12);
    expect(positiveAxis.direction.y).toBeCloseTo(negativeAxis.direction.y, 12);
    expect(positiveAxis.direction.z).toBeCloseTo(-negativeAxis.direction.z, 12);
  });

  it("rejects inferred or explicitly supplied front/side vertical-sign disagreement", () => {
    expectRejected(reconstructBoneDirection({
      alpha: rad(30),
      beta: rad(150),
      verticalSign: 1,
      sideAxisSign: 1,
    }), "vertical_sign_disagreement");
    expectRejected(reconstructBoneDirection({
      alpha: rad(30),
      beta: rad(40),
      verticalSign: 1,
      frontVerticalSign: 1,
      sideVerticalSign: -1,
      sideAxisSign: 1,
    }), "vertical_sign_disagreement");
  });

  it("requires inferred and explicit per-view signs to agree with the robust vertical sign", () => {
    expectRejected(reconstructBoneDirection({
      alpha: rad(30),
      beta: rad(40),
      verticalSign: -1,
      sideAxisSign: 1,
    }), "vertical_sign_disagreement");
    expectRejected(reconstructBoneDirection({
      alpha: rad(30),
      beta: rad(40),
      verticalSign: 1,
      frontVerticalSign: -1,
      sideVerticalSign: -1,
      sideAxisSign: 1,
    }), "vertical_sign_disagreement");
  });

  it("rejects non-finite inputs and invalid orientation signs", () => {
    expectRejected(reconstructBoneDirection({
      alpha: Number.NaN,
      beta: 0,
      verticalSign: 1,
      sideAxisSign: 1,
    }), "non_finite_input");
    expectRejected(reconstructBoneDirection({
      alpha: 0,
      beta: 0,
      verticalSign: 1,
      sideAxisSign: 1,
      frontProjectionLength: Number.POSITIVE_INFINITY,
    }), "non_finite_input");
    expectRejected(reconstructBoneDirection({
      alpha: 0,
      beta: 0,
      verticalSign: 0 as 1,
      sideAxisSign: 1,
    }), "invalid_vertical_sign");
    expectRejected(reconstructBoneDirection({
      alpha: 0,
      beta: 0,
      verticalSign: 1,
      sideAxisSign: 0 as 1,
    }), "invalid_side_axis_sign");
  });

  it("rejects supplied or reconstructed collapsed projected bones", () => {
    expectRejected(reconstructBoneDirection({
      alpha: 0,
      beta: 0,
      verticalSign: 1,
      sideAxisSign: 1,
      frontProjectionLength: 0,
    }), "collapsed_front_projection");
    expectRejected(reconstructBoneDirection({
      alpha: 0,
      beta: 0,
      verticalSign: 1,
      sideAxisSign: 1,
      sideProjectionLength: 0,
    }), "collapsed_side_projection");
    expectRejected(reconstructBoneDirection({
      alpha: Math.PI / 2,
      beta: 0,
      verticalSign: 1,
      sideAxisSign: 1,
    }), "collapsed_side_projection");
    expectRejected(reconstructBoneDirection({
      alpha: 0,
      beta: Math.PI / 2,
      verticalSign: 1,
      sideAxisSign: 1,
    }), "collapsed_front_projection");
  });

  it("rejects the both-views-horizontal degeneracy before nullspace normalization", () => {
    expectRejected(reconstructBoneDirection({
      alpha: Math.PI / 2,
      beta: Math.PI / 2,
      verticalSign: 1,
      sideAxisSign: 1,
    }), "both_views_horizontal");
  });

  it("rejects finite but poorly conditioned near-horizontal projection constraints", () => {
    expectRejected(reconstructBoneDirection({
      alpha: rad(89),
      beta: rad(89),
      verticalSign: 1,
      sideAxisSign: 1,
    }), "ill_conditioned_projection_constraints");
  });
});

describe("angleBetweenDirections", () => {
  it("returns stable angles in [0, pi] and is invariant to vector scale", () => {
    expect(angleBetweenDirections({ x: 2, y: 0, z: 0 }, { x: 5, y: 0, z: 0 })).toBe(0);
    expect(angleBetweenDirections({ x: 2, y: 0, z: 0 }, { x: 0, y: -3, z: 0 })).toBeCloseTo(Math.PI / 2, 12);
    expect(angleBetweenDirections({ x: 2, y: 0, z: 0 }, { x: -5, y: 0, z: 0 })).toBeCloseTo(Math.PI, 12);
  });

  it("remains scale-stable at the smallest and largest finite magnitudes", () => {
    expect(angleBetweenDirections(
      { x: Number.MIN_VALUE, y: 0, z: 0 },
      { x: 0, y: Number.MIN_VALUE, z: 0 },
    )).toBeCloseTo(Math.PI / 2, 12);
    expect(angleBetweenDirections(
      { x: Number.MAX_VALUE, y: Number.MAX_VALUE, z: 0 },
      { x: -Number.MAX_VALUE, y: Number.MAX_VALUE, z: 0 },
    )).toBeCloseTo(Math.PI / 2, 12);
    expect(angleBetweenDirections(
      { x: Number.MAX_VALUE, y: Number.MAX_VALUE, z: Number.MAX_VALUE },
      { x: Number.MIN_VALUE, y: Number.MIN_VALUE, z: Number.MIN_VALUE },
    )).toBeCloseTo(0, 12);
  });

  it("rejects zero and non-finite directions", () => {
    expect(() => angleBetweenDirections({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toThrow(/nonzero/i);
    expect(() => angleBetweenDirections({ x: 1, y: 0, z: 0 }, { x: 0, y: Number.NaN, z: 0 })).toThrow(/finite/i);
  });
});

/**
 * Two-view golden cases. `alpha` is the front-view angle and `beta` the
 * shooting-side-view angle, both in degrees measured from the canonical +y
 * (image-up) axis. `alpha > 0` tilts toward front-view image right (+x) and
 * `beta > 0` toward side-view image right (+z for a right-handed shooter).
 */
function acceptedDirection(
  alphaDegrees: number,
  betaDegrees: number,
  options: { verticalSign?: DirectionSign; sideAxisSign?: DirectionSign } = {},
): { direction: Vector3; conditioning: number } {
  const result = reconstructBoneDirection({
    alpha: rad(alphaDegrees),
    beta: rad(betaDegrees),
    verticalSign: options.verticalSign ?? 1,
    sideAxisSign: options.sideAxisSign ?? 1,
  });
  expect(result.status, `alpha=${alphaDegrees} beta=${betaDegrees} ${JSON.stringify(result)}`).toBe("accepted");
  if (result.status !== "accepted") throw new Error("unreachable");
  return result;
}

/** The user-supplied ratio form: d = normalize(tan(alpha), 1, tan(beta)), oriented by sign(y). */
function tangentRatioDirection(
  alphaDegrees: number,
  betaDegrees: number,
  verticalSign: DirectionSign,
  sideAxisSign: DirectionSign,
): Vector3 {
  const raw = {
    x: Math.tan(rad(alphaDegrees)),
    y: 1,
    z: Math.tan(rad(betaDegrees) * sideAxisSign),
  };
  const magnitude = Math.hypot(raw.x, raw.y, raw.z);
  return {
    x: verticalSign * raw.x / magnitude,
    y: verticalSign * raw.y / magnitude,
    z: verticalSign * raw.z / magnitude,
  };
}

function isFiniteVector(vector: Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

describe("two-view direction reconstruction golden cases", () => {
  it.each([
    { label: "vertical identity", first: [0, 0], second: [0, 0], expectedDegrees: 0 },
    { label: "front-only tilt", first: [0, 0], second: [45, 0], expectedDegrees: 45 },
    { label: "side-only tilt", first: [0, 0], second: [0, 45], expectedDegrees: 45 },
    { label: "orthogonal-view tilt", first: [45, 0], second: [0, 45], expectedDegrees: 60 },
    { label: "opposite front tilt", first: [45, 0], second: [-45, 0], expectedDegrees: 90 },
  ] as const)("reconstructs the $label pair at $expectedDegrees degrees", ({ first, second, expectedDegrees }) => {
    const u = acceptedDirection(first[0], first[1]).direction;
    const v = acceptedDirection(second[0], second[1]).direction;

    expect(deg(angleBetweenDirections(u, v))).toBeCloseTo(expectedDegrees, 10);
    expect(Math.hypot(u.x, u.y, u.z)).toBeCloseTo(1, 12);
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 12);
  });

  it("solves the 60-degree case to the documented normalized vectors", () => {
    const u = acceptedDirection(45, 0).direction;
    const v = acceptedDirection(0, 45).direction;

    expect(u.x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(u.y).toBeCloseTo(Math.SQRT1_2, 12);
    expect(u.z).toBeCloseTo(0, 12);
    expect(v.x).toBeCloseTo(0, 12);
    expect(v.y).toBeCloseTo(Math.SQRT1_2, 12);
    expect(v.z).toBeCloseTo(Math.SQRT1_2, 12);
    expect(u.x * v.x + u.y * v.y + u.z * v.z).toBeCloseTo(0.5, 12);
  });

  it("matches normalize(tan(alpha), 1, tan(beta)) whenever the shared vertical component is nonzero", () => {
    const upward = [-80, -60, -45, -30, -15, 0, 15, 30, 45, 60, 80];
    const downward = [100, 120, 135, 150, 165, 180, -100, -135, -165];
    let compared = 0;
    for (const sideAxisSign of [1, -1] as const) {
      for (const angles of [upward, downward]) {
        const verticalSign: DirectionSign = angles === upward ? 1 : -1;
        for (const alpha of angles) {
          for (const beta of angles) {
            const { direction, conditioning } = acceptedDirection(alpha, beta, { verticalSign, sideAxisSign });
            const expected = tangentRatioDirection(alpha, beta, verticalSign, sideAxisSign);
            expect(direction.x, `alpha=${alpha} beta=${beta}`).toBeCloseTo(expected.x, 12);
            expect(direction.y, `alpha=${alpha} beta=${beta}`).toBeCloseTo(expected.y, 12);
            expect(direction.z, `alpha=${alpha} beta=${beta}`).toBeCloseTo(expected.z, 12);
            // |front x side| for unit constraint normals: the sine of the angle between the
            // two projection planes, which is exactly the conditioning the solver reports.
            const cosAlpha = Math.cos(rad(alpha));
            const cosBeta = Math.cos(rad(beta));
            expect(conditioning).toBeCloseTo(
              Math.sqrt(cosAlpha ** 2 + cosBeta ** 2 - cosAlpha ** 2 * cosBeta ** 2),
              12,
            );
            compared += 1;
          }
        }
      }
    }
    expect(compared).toBe(2 * (upward.length ** 2 + downward.length ** 2));
  });

  it("preserves the joint angle under consistent front mirroring and consistent side mirroring", () => {
    const pairs: readonly (readonly [readonly [number, number], readonly [number, number]])[] = [
      [[30, 40], [-20, -35]],
      [[45, 0], [0, 45]],
      [[10, 70], [65, 15]],
      [[135, 150], [160, 110]],
    ];
    for (const [first, second] of pairs) {
      const verticalSign: DirectionSign = Math.cos(rad(first[0])) < 0 ? -1 : 1;
      const original = angleBetweenDirections(
        acceptedDirection(first[0], first[1], { verticalSign }).direction,
        acceptedDirection(second[0], second[1], { verticalSign }).direction,
      );

      const frontMirroredU = acceptedDirection(-first[0], first[1], { verticalSign }).direction;
      const frontMirroredV = acceptedDirection(-second[0], second[1], { verticalSign }).direction;
      const sideMirroredU = acceptedDirection(first[0], first[1], { verticalSign, sideAxisSign: -1 }).direction;
      const sideMirroredV = acceptedDirection(second[0], second[1], { verticalSign, sideAxisSign: -1 }).direction;
      const originalU = acceptedDirection(first[0], first[1], { verticalSign }).direction;

      expect(angleBetweenDirections(frontMirroredU, frontMirroredV)).toBeCloseTo(original, 12);
      expect(angleBetweenDirections(sideMirroredU, sideMirroredV)).toBeCloseTo(original, 12);
      // Mirroring changes only the mirrored axis sign of each direction.
      expect(frontMirroredU.x).toBeCloseTo(-originalU.x, 12);
      expect(frontMirroredU.y).toBeCloseTo(originalU.y, 12);
      expect(frontMirroredU.z).toBeCloseTo(originalU.z, 12);
      expect(sideMirroredU.x).toBeCloseTo(originalU.x, 12);
      expect(sideMirroredU.y).toBeCloseTo(originalU.y, 12);
      expect(sideMirroredU.z).toBeCloseTo(-originalU.z, 12);
    }
  });

  it("accepts a near-horizontal but still conditioned pair with a finite unit direction", () => {
    const { direction, conditioning } = acceptedDirection(84, 84);

    expect(isFiniteVector(direction)).toBe(true);
    expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1, 12);
    expect(conditioning).toBeGreaterThanOrEqual(0.1);
    expect(conditioning).toBeLessThanOrEqual(1);
  });

  it("maps every documented degenerate input to a typed rejection", () => {
    const expectations: readonly [number, number, DirectionRejectionReason][] = [
      [90, 90, "both_views_horizontal"],
      [-90, 90, "both_views_horizontal"],
      [89, 89, "ill_conditioned_projection_constraints"],
      [0, 90, "collapsed_front_projection"],
      [90, 0, "collapsed_side_projection"],
      [30, 150, "vertical_sign_disagreement"],
      [150, 30, "vertical_sign_disagreement"],
    ];
    for (const [alpha, beta, reason] of expectations) {
      expectRejected(reconstructBoneDirection({
        alpha: rad(alpha),
        beta: rad(beta),
        verticalSign: 1,
        sideAxisSign: 1,
      }), reason);
    }
    expectRejected(reconstructBoneDirection({
      alpha: 0,
      beta: 0,
      verticalSign: 1,
      sideAxisSign: 1,
      frontProjectionLength: 1e-13,
    }), "collapsed_front_projection");
    expectRejected(reconstructBoneDirection({
      alpha: 0,
      beta: 0,
      verticalSign: 1,
      sideAxisSign: 1,
      sideProjectionLength: 1e-13,
    }), "collapsed_side_projection");
  });

  it("never emits NaN or infinity across singular, near-singular, and wrapped angle sweeps", () => {
    const angles = [
      -270, -180, -91, -90.000001, -90, -89.999999, -89.9, -89, -60, -1e-9, 0, 1e-9,
      60, 89, 89.9, 89.999999, 90, 90.000001, 91, 180, 270, 359.999999, 360, 720.5,
    ];
    const lengths = [undefined, 1e-13, 1e-9, 1, 1e9];
    let accepted = 0;
    let rejected = 0;
    for (const alpha of angles) {
      for (const beta of angles) {
        for (const verticalSign of [1, -1] as const) {
          for (const sideAxisSign of [1, -1] as const) {
            for (const frontProjectionLength of lengths) {
              const result = reconstructBoneDirection({
                alpha: rad(alpha),
                beta: rad(beta),
                verticalSign,
                sideAxisSign,
                ...(frontProjectionLength === undefined ? {} : { frontProjectionLength }),
              });
              if (result.status === "rejected") {
                rejected += 1;
                expect(typeof result.reason).toBe("string");
                continue;
              }
              accepted += 1;
              expect(isFiniteVector(result.direction), `alpha=${alpha} beta=${beta}`).toBe(true);
              expect(Math.hypot(result.direction.x, result.direction.y, result.direction.z)).toBeCloseTo(1, 9);
              expect(Number.isFinite(result.conditioning)).toBe(true);
              expect(result.conditioning).toBeGreaterThanOrEqual(0.1);
              expect(result.conditioning).toBeLessThanOrEqual(1 + 1e-12);
              expect(Math.sign(result.direction.y)).toBe(verticalSign);
            }
          }
        }
      }
    }
    expect(accepted).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  });
});
