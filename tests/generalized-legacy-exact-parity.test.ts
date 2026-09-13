import { describe, expect, it } from "vitest";

import { reconstructBoneDirection } from "@/lib/shooting-profile/direction-reconstruction";
import { reconstructBoneDirectionFromYawViews } from "@/lib/shooting-profile/generalized-direction-reconstruction";

/**
 * The product path is moving onto the generalized yaw solver, so at the two
 * legacy geometries it must not merely agree to a tolerance: it must return
 * exactly what the legacy solver returns, including the legacy rejections.
 * Anything less would silently move every existing profile.
 */

function rad(degrees: number): number {
  return degrees * Math.PI / 180;
}

const ANGLE_PAIRS = [
  { alpha: 12, beta: 18 },
  { alpha: 35, beta: -22 },
  { alpha: -28, beta: 41 },
  { alpha: 55, beta: 33 },
  { alpha: 0.5, beta: -0.5 },
  { alpha: 89, beta: -89 },
  { alpha: -73, beta: 64 },
];

describe("generalized solver is bit-exact with the legacy solver at legacy yaws", () => {
  it("matches the right-handed front 0 and side +90 result exactly", () => {
    for (const pair of ANGLE_PAIRS) {
      const legacy = reconstructBoneDirection({
        alpha: rad(pair.alpha),
        beta: rad(pair.beta),
        verticalSign: 1,
        sideAxisSign: 1,
      });
      const generalized = reconstructBoneDirectionFromYawViews({
        first: { yawDegrees: 0, angleRadians: rad(pair.alpha) },
        second: { yawDegrees: 90, angleRadians: rad(pair.beta) },
        verticalSign: 1,
      });

      expect(generalized).toEqual(legacy);
    }
  });

  it("matches the left-handed front 0 and side -90 result exactly", () => {
    for (const pair of ANGLE_PAIRS) {
      const legacy = reconstructBoneDirection({
        alpha: rad(pair.alpha),
        beta: rad(pair.beta),
        verticalSign: 1,
        sideAxisSign: -1,
      });
      const generalized = reconstructBoneDirectionFromYawViews({
        first: { yawDegrees: 0, angleRadians: rad(pair.alpha) },
        second: { yawDegrees: -90, angleRadians: rad(pair.beta) },
        verticalSign: 1,
      });

      expect(generalized).toEqual(legacy);
    }
  });

  it("reproduces the legacy rejection when a bone collapses in one view", () => {
    // alpha = 0 and beta = 0 puts the reconstructed direction along the camera
    // axis of one view, which the legacy solver refuses after normalization.
    const legacyFrontCollapse = reconstructBoneDirection({
      alpha: rad(90),
      beta: rad(0),
      verticalSign: 1,
      sideAxisSign: 1,
    });
    const generalizedFrontCollapse = reconstructBoneDirectionFromYawViews({
      first: { yawDegrees: 0, angleRadians: rad(90) },
      second: { yawDegrees: 90, angleRadians: rad(0) },
      verticalSign: 1,
    });
    expect(generalizedFrontCollapse).toEqual(legacyFrontCollapse);

    const legacySideCollapse = reconstructBoneDirection({
      alpha: rad(0),
      beta: rad(90),
      verticalSign: 1,
      sideAxisSign: 1,
    });
    const generalizedSideCollapse = reconstructBoneDirectionFromYawViews({
      first: { yawDegrees: 0, angleRadians: rad(0) },
      second: { yawDegrees: 90, angleRadians: rad(90) },
      verticalSign: 1,
    });
    expect(generalizedSideCollapse).toEqual(legacySideCollapse);
  });

  it("still refuses a bone that collapses in an oblique view", () => {
    // With a purely horizontal front observation the reconstruction lies in the
    // ground plane along the 45 degree camera axis, so that view sees no bone
    // at all. The guard must fire at 45 degrees exactly as it does at 90.
    const result = reconstructBoneDirectionFromYawViews({
      first: { yawDegrees: 0, angleRadians: rad(90) },
      second: { yawDegrees: 45, angleRadians: rad(30) },
      verticalSign: 1,
    });

    expect(result).toEqual({ status: "rejected", reason: "collapsed_side_projection" });
  });

  it("keeps exact trigonometric constraints at every quadrant yaw", () => {
    for (const yaw of [0, 90, -90, 180, -180]) {
      const result = reconstructBoneDirectionFromYawViews({
        first: { yawDegrees: yaw, angleRadians: rad(20) },
        second: { yawDegrees: yaw + 90 > 180 ? yaw - 90 : yaw + 90, angleRadians: rad(30) },
        verticalSign: 1,
      });
      expect(result.status).toBe("accepted");
      if (result.status === "accepted") {
        const zeroCoordinates = [result.direction.x, result.direction.y, result.direction.z]
          .filter((value) => Math.abs(value) < 1e-12);
        for (const value of zeroCoordinates) expect(value).toBe(0);
      }
    }
  });
});
