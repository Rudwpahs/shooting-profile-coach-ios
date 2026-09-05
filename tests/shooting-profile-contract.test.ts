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
      { id: "ready", phase: 0 },
      { id: "deepestDip", phase: 0.25 },
      { id: "rise", phase: 0.5 },
      { id: "releaseProxy", phase: 0.75 },
      { id: "followThrough", phase: 1 },
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
      realVideoEvaluation: process.env.EXPO_PUBLIC_FORMPATH_REAL_VIDEO_EVAL === "1",
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

  it("rejects failed quality and any reason on a framed profile", () => {
    expect(() => parseRepresentativePose4D({
      ...validProfile(),
      quality: { passed: false, reasons: [] },
    })).toThrow();
    expect(() => parseRepresentativePose4D({
      ...validProfile(),
      quality: { passed: true, reasons: ["recapture_required"] },
    })).toThrow();
  });

  it("rejects 100, 102, and sparse frame arrays", () => {
    const oneHundredFrames = validProfile();
    oneHundredFrames.frames.pop();
    expect(() => parseRepresentativePose4D(oneHundredFrames)).toThrow();

    const oneHundredTwoFrames = validProfile();
    oneHundredTwoFrames.frames.push({
      ...oneHundredTwoFrames.frames[100],
      phase: 1,
    });
    expect(() => parseRepresentativePose4D(oneHundredTwoFrames)).toThrow();

    const sparseFrames = validProfile();
    Reflect.deleteProperty(sparseFrames.frames, "50");
    expect(50 in sparseFrames.frames).toBe(false);
    expect(() => parseRepresentativePose4D(sparseFrames)).toThrow();
  });

  it("rejects shifted or otherwise noncanonical frame phases", () => {
    const shiftedGrid = validProfile();
    shiftedGrid.frames.forEach((frame, index) => {
      frame.phase = 0.001 + index * 0.00998;
    });
    shiftedGrid.frames[0].phase = 0.001;
    shiftedGrid.frames[100].phase = 0.999;
    expect(shiftedGrid.frames[0].phase).toBe(0.001);
    expect(shiftedGrid.frames[100].phase).toBe(0.999);
    expect(() => parseRepresentativePose4D(shiftedGrid)).toThrow();

    const shiftedInteriorPhase = validProfile();
    shiftedInteriorPhase.frames[50].phase = 0.501;
    expect(() => parseRepresentativePose4D(shiftedInteriorPhase)).toThrow();
  });

  it("requires the five exact canonical phase anchors in order", () => {
    const missingAnchor = validProfile();
    missingAnchor.phaseAnchors.pop();
    expect(() => parseRepresentativePose4D(missingAnchor)).toThrow();

    const wrongAnchorId = validProfile();
    wrongAnchorId.phaseAnchors[2] = { id: "releaseProxy", phase: 0.5 };
    expect(() => parseRepresentativePose4D(wrongAnchorId)).toThrow();

    const wrongAnchorPhase = validProfile();
    wrongAnchorPhase.phaseAnchors[2] = { id: "rise", phase: 0.51 };
    expect(() => parseRepresentativePose4D(wrongAnchorPhase)).toThrow();
  });

  it("rejects covariance with a negative variance or a materially indefinite matrix", () => {
    const negativeVariance = validProfile();
    negativeVariance.frames[0].uncertainty.leftWrist.covariance = [-0.01, 0, 0, 0.01, 0, 0.01];
    expect(() => parseRepresentativePose4D(negativeVariance)).toThrow();

    const indefiniteCovariance = validProfile();
    indefiniteCovariance.frames[0].uncertainty.leftWrist.covariance = [1, -0.9, -0.9, 1, -0.9, 1];
    expect(() => parseRepresentativePose4D(indefiniteCovariance)).toThrow();
  });

  it("accepts a finite correlated positive-semidefinite covariance", () => {
    const correlatedCovariance = validProfile();
    correlatedCovariance.frames[0].uncertainty.leftWrist.covariance = [4, 2, 1, 2, 0.75, 1.3125];
    expect(parseRepresentativePose4D(correlatedCovariance)).toEqual(correlatedCovariance);
  });

  it("rejects directional cones outside zero through 180 degrees", () => {
    const negativeCone = validProfile();
    negativeCone.frames[0].uncertainty.leftWrist.directionalConeDegrees = -0.01;
    expect(() => parseRepresentativePose4D(negativeCone)).toThrow();

    const oversizedCone = validProfile();
    oversizedCone.frames[0].uncertainty.leftWrist.directionalConeDegrees = 180.01;
    expect(() => parseRepresentativePose4D(oversizedCone)).toThrow();
  });

  it("persists only the twelve allowed limb and torso landmarks", () => {
    const profile = validProfile();
    profile.frames[0].joints = { ...profile.frames[0].joints, head: { x: 0, y: 0, z: 0 } };
    expect(() => parseRepresentativePose4D(profile)).toThrow();
  });
});
