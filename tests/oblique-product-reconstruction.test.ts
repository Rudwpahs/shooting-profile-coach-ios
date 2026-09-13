import { describe, expect, it } from "vitest";

import type { CameraViewMetadataV2 } from "@/lib/shooting-profile/camera-view-metadata";
import {
  buildTwoViewRepresentativeProfile,
  type TwoViewPipelineAttemptV1,
  type TwoViewPipelineResultV1,
} from "@/lib/shooting-profile/two-view-pipeline";
import type { LandmarkSequenceV2, ShootingHandV2 } from "@/lib/shooting-profile/types";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

/**
 * The product reconstruction boundary now takes each view's shooter-centric
 * camera yaw instead of a hard-coded front/side pair. The legacy geometries
 * must survive that change untouched, and a declared oblique yaw must reach the
 * solver exactly as declared.
 *
 * Known-direction recovery at oblique yaw is proven directly against the solver
 * in tests/generalized-direction-reconstruction.test.ts. These tests cover the
 * product wiring: equivalence, transport, and validation.
 */

function attemptsFor(session: { front: LandmarkSequenceV2[]; shootingSide: LandmarkSequenceV2[] }): TwoViewPipelineAttemptV1[] {
  return [...session.front, ...session.shootingSide].map((sequence) => ({
    id: `${sequence.view}-${sequence.takeIndex}`,
    sequence,
  }));
}

function profileFor(
  shootingHand: ShootingHandV2,
  cameraViews?: { front: CameraViewMetadataV2; shootingSide: CameraViewMetadataV2 },
): TwoViewPipelineResultV1 {
  const session = syntheticLandmarkSession({ mode: "basic_1_plus_1", shootingHand });
  return buildTwoViewRepresentativeProfile({
    mode: "basic_1_plus_1",
    shootingHand,
    attempts: attemptsFor(session),
    ...(cameraViews === undefined ? {} : { cameraViews }),
  });
}

function legacyMetadata(shootingHand: ShootingHandV2) {
  return {
    front: { semanticView: "front", yawDegrees: 0, yawSource: "legacy_semantic_view" } as const,
    shootingSide: {
      semanticView: "shooting_side",
      yawDegrees: shootingHand === "right" ? 90 : -90,
      yawSource: "legacy_semantic_view",
    } as const,
  };
}

function obliqueMetadata(yawDegrees: number) {
  return {
    front: { semanticView: "front", yawDegrees: 0, yawSource: "capture_instruction" } as const,
    shootingSide: {
      semanticView: "shooting_oblique",
      yawDegrees,
      yawSource: "capture_instruction",
    } as const,
  };
}

function completeProfile(result: TwoViewPipelineResultV1) {
  expect(result.status, JSON.stringify(result).slice(0, 300)).toBe("complete");
  if (result.status !== "complete") throw new Error("unreachable");
  return result;
}

describe("oblique-aware product reconstruction", () => {
  it("leaves the right-handed legacy session byte-identical whether yaw is declared or inferred", () => {
    const inferred = completeProfile(profileFor("right"));
    const declared = completeProfile(profileFor("right", legacyMetadata("right")));

    expect(declared.profile).toEqual(inferred.profile);
    expect(declared.confidence).toBe(inferred.confidence);
    expect(declared.saveInput).toEqual(inferred.saveInput);
  });

  it("leaves the left-handed legacy session byte-identical whether yaw is declared or inferred", () => {
    const inferred = completeProfile(profileFor("left"));
    const declared = completeProfile(profileFor("left", legacyMetadata("left")));

    expect(declared.profile).toEqual(inferred.profile);
    expect(declared.confidence).toBe(inferred.confidence);
    expect(declared.saveInput).toEqual(inferred.saveInput);
  });

  it("carries a declared oblique yaw into reconstruction instead of the legacy 90 degrees", () => {
    const legacy = completeProfile(profileFor("right"));
    const oblique = completeProfile(profileFor("right", obliqueMetadata(60)));

    expect(oblique.profile).not.toEqual(legacy.profile);
  });

  it("does not snap an explicit 57.5 degrees to a nominal capture angle", () => {
    const explicit = completeProfile(profileFor("right", obliqueMetadata(57.5)));
    const nominal = completeProfile(profileFor("right", obliqueMetadata(60)));
    const alsoExplicit = completeProfile(profileFor("right", obliqueMetadata(57.5)));

    expect(explicit.profile).not.toEqual(nominal.profile);
    expect(explicit.profile).toEqual(alsoExplicit.profile);
  });

  it("treats a declared legacy 90 degrees and the inferred default as the same geometry", () => {
    const declaredAsOblique = completeProfile(profileFor("right", obliqueMetadata(90)));
    const inferred = completeProfile(profileFor("right"));

    expect(declaredAsOblique.profile).toEqual(inferred.profile);
  });

  it("refuses a shooting-side yaw whose sign contradicts the shooting hand", () => {
    // The convention is frozen: positive yaw moves toward the shooter's
    // anatomical right, so a left-hander's side camera is negative. A wrong
    // sign puts the camera on the far side of the body and mirrors depth, and
    // the result must not come back as a confident profile.
    const wrongForLeft = profileFor("left", obliqueMetadata(90));
    const wrongForRight = profileFor("right", obliqueMetadata(-60));
    const noSide = profileFor("right", obliqueMetadata(0));

    for (const result of [wrongForLeft, wrongForRight, noSide]) {
      expect(result.status).toBe("recapture_required");
      if (result.status === "recapture_required") expect(result.reason).toBe("invalid_attempt");
    }
  });

  it("still admits a correctly signed oblique yaw for either hand", () => {
    expect(completeProfile(profileFor("right", obliqueMetadata(60))).confidence).toBeGreaterThan(0);
    expect(completeProfile(profileFor("left", obliqueMetadata(-60))).confidence).toBeGreaterThan(0);
  });

  it("refuses malformed camera metadata instead of silently falling back to legacy yaw", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1", shootingHand: "right" });
    const malformed = [
      { front: { semanticView: "front", yawDegrees: 999, yawSource: "estimated" }, shootingSide: legacyMetadata("right").shootingSide },
      { front: legacyMetadata("right").front, shootingSide: { semanticView: "sideways", yawDegrees: 45, yawSource: "estimated" } },
      { front: legacyMetadata("right").front, shootingSide: { semanticView: "shooting_oblique", yawDegrees: 45, yawSource: "guessed" } },
    ];

    for (const cameraViews of malformed) {
      const result = buildTwoViewRepresentativeProfile({
        mode: "basic_1_plus_1",
        shootingHand: "right",
        attempts: attemptsFor(session),
        cameraViews: cameraViews as never,
      });
      expect(result.status).toBe("recapture_required");
      if (result.status === "recapture_required") expect(result.reason).toBe("invalid_attempt");
    }
  });
});
