import { describe, expect, it } from "vitest";

import { FORMPATH_FLAGS } from "@/lib/feature-flags";
import { parseRepresentativePose4D } from "@/lib/shooting-profile/codec";

const PERSISTED_JOINTS = [
  "leftShoulder", "leftElbow", "leftWrist", "rightShoulder", "rightElbow", "rightWrist",
  "leftHip", "leftKnee", "leftAnkle", "rightHip", "rightKnee", "rightAnkle",
] as const;

function validProfile() {
  return {
    schemaVersion: 2,
    boundary: "representative_phase_fused_4d_estimate_not_actual_3d",
    mode: "high_accuracy_3_plus_3",
    timeBasis: "normalized_shot_phase",
    units: "template_shoulder_breadths",
    frames: Array.from({ length: 101 }, (_, index) => ({
      phase: index / 100,
      joints: Object.fromEntries(PERSISTED_JOINTS.map((joint) => [joint, { x: 0.1, y: 0.2, z: 0.3 }])),
      uncertainty: Object.fromEntries(PERSISTED_JOINTS.map((joint) => [joint, {
        model: "heuristic_v1",
        covariance: [0.01, 0, 0, 0.01, 0, 0.01],
        directionalConeDegrees: 12,
      }])),
    })),
    phaseAnchors: [
      { id: "set", phase: 0 },
      { id: "release", phase: 0.7 },
      { id: "follow_through", phase: 1 },
    ],
    quality: { passed: true, reasons: [] },
  };
}

describe("V2 shooting-profile contract", () => {
  it("parses a finite, ordered 101-frame representative profile", () => {
    const profile = validProfile();
    expect(parseRepresentativePose4D(profile)).toEqual(profile);
  });

  it("keeps V2 capability flags disabled unless their public environment variables equal one", () => {
    expect(FORMPATH_FLAGS).toEqual({
      captureV2: process.env.EXPO_PUBLIC_FORMPATH_CAPTURE_V2 === "1",
      representative4DViewer: process.env.EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D === "1",
      profileV2: process.env.EXPO_PUBLIC_FORMPATH_PROFILE_V2 === "1",
    });
    expect(Object.isFrozen(FORMPATH_FLAGS)).toBe(true);
  });

  it("rejects unknown persisted keys at the top level and inside frames", () => {
    expect(() => parseRepresentativePose4D({ ...validProfile(), extra: "not persisted" })).toThrow();
    const profile = validProfile();
    const withRawMediaUri = {
      ...profile,
      frames: profile.frames.map((frame, index) => index === 0 ? { ...frame, rawMediaUri: "file:///private.mp4" } : frame),
    };
    expect(() => parseRepresentativePose4D(withRawMediaUri)).toThrow();
  });

  it("rejects non-finite coordinates and a different evidence boundary", () => {
    const nonFinite = validProfile();
    nonFinite.frames[0].joints.leftWrist.x = Number.POSITIVE_INFINITY;
    expect(() => parseRepresentativePose4D(nonFinite)).toThrow();

    expect(() => parseRepresentativePose4D({
      ...validProfile(),
      boundary: "calibrated_multi_view_3d",
    })).toThrow();
  });

  it("rejects non-monotonic phase values and any frame count other than 101", () => {
    const nonMonotonic = validProfile();
    nonMonotonic.frames[50].phase = nonMonotonic.frames[49].phase;
    expect(() => parseRepresentativePose4D(nonMonotonic)).toThrow();

    const wrongLength = validProfile();
    wrongLength.frames.pop();
    expect(() => parseRepresentativePose4D(wrongLength)).toThrow();
  });

  it("persists only the twelve allowed limb and torso landmarks", () => {
    const profile = validProfile();
    profile.frames[0].joints = { ...profile.frames[0].joints, head: { x: 0, y: 0, z: 0 } };
    expect(() => parseRepresentativePose4D(profile)).toThrow();
  });
});
