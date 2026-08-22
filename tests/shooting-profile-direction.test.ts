import { describe, expect, it } from "vitest";

import {
  angleBetweenDirections,
  reconstructBoneDirection,
  type DirectionRejectionReason,
  type DirectionReconstructionResult,
} from "@/lib/shooting-profile/direction-reconstruction";

const rad = (degrees: number) => degrees * Math.PI / 180;

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
