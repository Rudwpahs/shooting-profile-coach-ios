import { describe, expect, it, vi } from "vitest";

import type { RepresentativePose4DV2 } from "@/lib/shooting-profile/types";

vi.mock("react-native", () => ({
  StyleSheet: { create: <T>(styles: T) => styles },
  AccessibilityInfo: {},
  AppState: {},
}));
vi.mock("react-native-svg", () => ({ default: () => null, Circle: () => null, Line: () => null }));

const {
  representativeConfidence,
  representativeGlyph,
  representativeReleaseFrameIndex,
  representativeSequenceBounds,
} = await import("@/components/skeleton/representative-glyph");
const { buildTwoViewRepresentativeProfile } = await import("@/lib/shooting-profile/two-view-pipeline");
const { syntheticLandmarkSession } = await import("@/tests/fixtures/synthetic-landmark-sequence");

function syntheticProfile(): RepresentativePose4DV2 {
  const session = syntheticLandmarkSession({ mode: "basic_1_plus_1", shootingHand: "right" });
  const result = buildTwoViewRepresentativeProfile({
    mode: "basic_1_plus_1",
    shootingHand: "right",
    attempts: [...session.front, ...session.shootingSide].map((sequence) => ({
      id: `${sequence.view}-${sequence.takeIndex}`,
      sequence,
    })),
  });
  if (result.status !== "complete") throw new Error("fixture must reconstruct");
  return result.profile;
}

const profile = syntheticProfile();

describe("representativeGlyph", () => {
  it("projects the 12 observed joints plus 4 derived ones, screen-down, with the shooting arm marked", () => {
    const glyph = representativeGlyph(profile.frames[75], "oblique", "right");

    expect(Object.keys(glyph.points)).toHaveLength(16);
    expect(glyph.derivedJoints).toEqual(["head", "neck", "spine", "pelvis"]);
    expect(glyph.armJoints).toEqual(["rightShoulder", "rightElbow", "rightWrist"]);
    expect(glyph.bones).toHaveLength(15);
    // Screen y grows downward: the head sits above the pelvis, the ankles below it.
    expect(glyph.points.head.y).toBeLessThan(glyph.points.pelvis.y);
    expect(glyph.points.leftAnkle.y).toBeGreaterThan(glyph.points.pelvis.y);
  });

  it("marks the left arm for a left-handed shooter", () => {
    expect(representativeGlyph(profile.frames[0], "front", "left").armJoints).toEqual(["leftShoulder", "leftElbow", "leftWrist"]);
  });

  it("bounds a whole sequence so every frame fits inside them", () => {
    const bounds = representativeSequenceBounds(profile, "side", "right");
    for (const frame of profile.frames) {
      for (const point of Object.values(representativeGlyph(frame, "side", "right").points)) {
        expect(point.x).toBeGreaterThanOrEqual(bounds.minX - 1e-9);
        expect(point.x).toBeLessThanOrEqual(bounds.maxX + 1e-9);
        expect(point.y).toBeGreaterThanOrEqual(bounds.minY - 1e-9);
        expect(point.y).toBeLessThanOrEqual(bounds.maxY + 1e-9);
      }
    }
  });

  it("picks the release-proxy anchor as the still frame", () => {
    expect(representativeReleaseFrameIndex(profile)).toBe(75);
    const withoutAnchor = { ...profile, phaseAnchors: profile.phaseAnchors.filter((anchor) => anchor.id !== "releaseProxy") };
    expect(representativeReleaseFrameIndex(withoutAnchor)).toBe(75);
  });

  it("maps quality and mode to a confidence band, never to a number", () => {
    expect(representativeConfidence(profile)).toBe("basic");
    expect(representativeConfidence({ ...profile, mode: "high_accuracy_3_plus_3" })).toBe("high");
    expect(representativeConfidence({ ...profile, quality: { passed: false, reasons: ["x"] } })).toBe("recapture");
  });
});
