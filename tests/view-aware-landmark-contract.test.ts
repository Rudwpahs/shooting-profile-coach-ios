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
});
