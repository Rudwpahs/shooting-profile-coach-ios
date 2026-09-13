import { describe, expect, it } from "vitest";

import { parseLandmarkSequenceV2 } from "@/lib/shooting-profile/landmark-sequence-contract";
import type { LandmarkSequenceV2 } from "@/lib/shooting-profile/types";
import { syntheticLandmarkSequence } from "@/tests/fixtures/synthetic-landmark-sequence";

function withLandmarkVisibility(
  sequence: LandmarkSequenceV2,
  landmarkIndex: number,
  visibility: number,
): LandmarkSequenceV2 {
  return {
    ...sequence,
    frames: sequence.frames.map((frame) => ({
      ...frame,
      sourceLandmarks: frame.sourceLandmarks.map((landmark, index) => (
        index === landmarkIndex ? { ...landmark, visibility } : landmark
      )),
    })),
  };
}

describe("LandmarkSequenceV2 view-aware quality recomputation", () => {
  it("admits a right-handed side sequence when only the far left wrist is occluded", () => {
    const sequence = syntheticLandmarkSequence({
      view: "shooting_side",
      shootingHand: "right",
    });
    const farWristOccluded = withLandmarkVisibility(sequence, 15, 0.1);

    expect(() => parseLandmarkSequenceV2(farWristOccluded)).not.toThrow();
  });

  it("still rejects a right-handed side sequence when the shooting right wrist is occluded", () => {
    const sequence = syntheticLandmarkSequence({
      view: "shooting_side",
      shootingHand: "right",
    });
    const shootingWristOccluded = withLandmarkVisibility(sequence, 16, 0.1);

    expect(() => parseLandmarkSequenceV2(shootingWristOccluded)).toThrow();
  });

  it("preserves front-view rejection when either wrist is occluded", () => {
    const sequence = syntheticLandmarkSequence({
      view: "front",
      shootingHand: "right",
    });
    const leftWristOccluded = withLandmarkVisibility(sequence, 15, 0.1);

    expect(() => parseLandmarkSequenceV2(leftWristOccluded)).toThrow();
  });

  it("preserves front-view rejection for the right wrist and for a left-handed shooter", () => {
    const rightHanded = syntheticLandmarkSequence({ view: "front", shootingHand: "right" });
    const leftHanded = syntheticLandmarkSequence({ view: "front", shootingHand: "left" });

    expect(() => parseLandmarkSequenceV2(withLandmarkVisibility(rightHanded, 16, 0.1))).toThrow();
    expect(() => parseLandmarkSequenceV2(withLandmarkVisibility(leftHanded, 15, 0.1))).toThrow();
    expect(() => parseLandmarkSequenceV2(withLandmarkVisibility(leftHanded, 16, 0.1))).toThrow();
  });

  it("mirrors the side policy anatomically for a left-handed shooter", () => {
    const sequence = syntheticLandmarkSequence({
      view: "shooting_side",
      shootingHand: "left",
    });

    expect(() => parseLandmarkSequenceV2(withLandmarkVisibility(sequence, 16, 0.1))).not.toThrow();
    expect(() => parseLandmarkSequenceV2(withLandmarkVisibility(sequence, 15, 0.1))).toThrow();
    expect(() => parseLandmarkSequenceV2(withLandmarkVisibility(sequence, 13, 0.1))).toThrow();
  });

  it("requires the shooting elbow and shoulder in side view but not the far shoulder", () => {
    const sequence = syntheticLandmarkSequence({
      view: "shooting_side",
      shootingHand: "right",
    });

    expect(() => parseLandmarkSequenceV2(withLandmarkVisibility(sequence, 14, 0.1))).toThrow();
    expect(() => parseLandmarkSequenceV2(withLandmarkVisibility(sequence, 12, 0.1))).toThrow();
    expect(() => parseLandmarkSequenceV2(withLandmarkVisibility(sequence, 11, 0.1))).not.toThrow();
  });

  it("keeps the 0.85 coverage and 0.5 visibility thresholds exactly for required side joints", () => {
    const sequence = syntheticLandmarkSequence({
      view: "shooting_side",
      shootingHand: "right",
    });
    const frameCount = sequence.frames.length;
    const lowFrames = Math.ceil(frameCount * 0.15) + 1;
    const belowCoverage = {
      ...sequence,
      frames: sequence.frames.map((frame, frameIndex) => ({
        ...frame,
        sourceLandmarks: frame.sourceLandmarks.map((landmark, index) => (
          index === 16 && frameIndex < lowFrames ? { ...landmark, visibility: 0.49 } : landmark
        )),
      })),
    };
    const atVisibilityFloor = withLandmarkVisibility(sequence, 16, 0.5);

    expect(() => parseLandmarkSequenceV2(belowCoverage)).toThrow();
    expect(() => parseLandmarkSequenceV2(atVisibilityFloor)).not.toThrow();
  });
});
