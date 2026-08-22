import { describe, expect, it } from "vitest";

import {
  aggregateViewAttempts,
  CONSENSUS_V1,
  selectAgreeingAttemptSubset,
  type NormalizedViewAttemptV2,
} from "@/lib/shooting-profile/repeated-shot";
import type { PhaseSampleFrameV2 } from "@/lib/shooting-profile/phase-normalization";
import type { CaptureViewV2, ShootingHandV2 } from "@/lib/shooting-profile/types";

const ANCHOR_IDS = ["ready", "deepestDip", "rise", "releaseProxy", "followThrough"] as const;
const ANCHOR_PHASES = [0, 0.25, 0.5, 0.75, 1] as const;

type AttemptOptions = {
  view?: CaptureViewV2;
  shootingHand?: ShootingHandV2;
  takeIndex?: 0 | 1 | 2;
  anchorPositions?: readonly [number, number, number, number, number];
};

function rotate(x: number, y: number, radians: number): { x: number; y: number } {
  return {
    x: x * Math.cos(radians) - y * Math.sin(radians),
    y: x * Math.sin(radians) + y * Math.cos(radians),
  };
}

function syntheticAttempt(
  id: string,
  rotationAtFrame: number | ((frameIndex: number) => number),
  options: AttemptOptions = {},
): NormalizedViewAttemptV2 {
  const view = options.view ?? "front";
  const shootingHand = options.shootingHand ?? "right";
  const takeIndex = options.takeIndex ?? 0;
  const anchorPositions = options.anchorPositions ?? [0, 0.25, 0.5, 0.75, 1];
  const frames: PhaseSampleFrameV2[] = Array.from({ length: 101 }, (_, frameIndex) => {
    const radians = typeof rotationAtFrame === "function"
      ? rotationAtFrame(frameIndex)
      : rotationAtFrame;
    return {
      phase: frameIndex / 100,
      sourceTimestampMs: frameIndex * 10,
      view,
      shootingHand,
      takeIndex,
      sourceLandmarks: Array.from({ length: 29 }, (_, landmarkIndex) => ({
        ...rotate((landmarkIndex + 1) * 0.02, (landmarkIndex + 1) * 0.035, radians),
        visibility: 0.95,
      })),
    };
  });
  return {
    id,
    phaseAnchors: ANCHOR_IDS.map((anchorId, index) => ({
      id: anchorId,
      phase: ANCHOR_PHASES[index],
      timestampMs: anchorPositions[index] * 1_000,
    })),
    frames,
  };
}

function replaceFrame(
  attempt: NormalizedViewAttemptV2,
  frameIndex: number,
  replacement: PhaseSampleFrameV2,
): NormalizedViewAttemptV2 {
  return {
    ...attempt,
    frames: attempt.frames.map((frame, index) => index === frameIndex ? replacement : frame),
  };
}

describe("selectAgreeingAttemptSubset", () => {
  it("accepts one complete Basic attempt and labels it as single-take evidence", () => {
    const attempt = syntheticAttempt("front-0", 0);

    const result = selectAgreeingAttemptSubset([attempt], CONSENSUS_V1);

    expect(result).toMatchObject({
      status: "accepted",
      evidence: "single_take",
      attemptIds: ["front-0"],
      medoidAttemptId: "front-0",
      robustScore: 0,
    });
    if (result.status === "accepted") {
      expect(Object.isFrozen(result.attemptIds)).toBe(true);
    }
  });

  it("sorts stable IDs and selects the lowest-distance complete 2-of-3 subset", () => {
    const takeA = syntheticAttempt("take-a", 0, { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", 0.05, { takeIndex: 1 });
    const takeC = syntheticAttempt("take-c", 0.16, { takeIndex: 2 });

    const result = selectAgreeingAttemptSubset([takeC, takeB, takeA], CONSENSUS_V1);

    expect(result).toMatchObject({
      status: "accepted",
      evidence: "multi_take_consensus",
      attemptIds: ["take-a", "take-b"],
      medoidAttemptId: "take-a",
    });
    if (result.status === "accepted") {
      expect(result.robustScore).toBeCloseTo(0.05, 10);
    }
  });

  it("includes the third take only when it agrees with the selected pair medoid", () => {
    const takeA = syntheticAttempt("take-a", 0, { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", 0.04, { takeIndex: 1 });
    const takeC = syntheticAttempt("take-c", 0.06, { takeIndex: 2 });

    const result = selectAgreeingAttemptSubset([takeC, takeA, takeB], CONSENSUS_V1);

    expect(result).toMatchObject({
      status: "accepted",
      evidence: "multi_take_consensus",
      attemptIds: ["take-a", "take-b", "take-c"],
    });
  });

  it("excludes an unavailable third take when the other two form a complete pair", () => {
    const takeA = syntheticAttempt("take-a", 0, { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", 0.04, { takeIndex: 1 });
    const takeCSource = syntheticAttempt("take-c", 0.02, { takeIndex: 2 });
    const unavailableFrame = {
      ...takeCSource.frames[50],
      sourceLandmarks: takeCSource.frames[50].sourceLandmarks.map((point, index) => (
        index === 11 ? { ...point, visibility: 0.1 } : point
      )),
    };
    const takeC = replaceFrame(takeCSource, 50, unavailableFrame);

    const result = selectAgreeingAttemptSubset([takeC, takeB, takeA], CONSENSUS_V1);

    expect(result).toMatchObject({
      status: "accepted",
      attemptIds: ["take-a", "take-b"],
    });
  });

  it("requires recapture with no frames when no complete angular pair agrees", () => {
    const takeA = syntheticAttempt("take-a", 0, { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", 0.3, { takeIndex: 1 });
    const takeC = syntheticAttempt("take-c", 0.6, { takeIndex: 2 });

    expect(selectAgreeingAttemptSubset([takeA, takeB, takeC], CONSENSUS_V1)).toEqual({
      status: "recapture_required",
      reason: "no_complete_agreeing_subset",
    });
    expect(aggregateViewAttempts([takeA, takeB, takeC], CONSENSUS_V1)).toEqual({
      status: "recapture_required",
      reason: "no_complete_agreeing_subset",
    });
  });

  it("gates otherwise matching pairs on normalized phase-anchor agreement", () => {
    const takeA = syntheticAttempt("take-a", 0, {
      takeIndex: 0,
      anchorPositions: [0, 0.25, 0.5, 0.75, 1],
    });
    const takeB = syntheticAttempt("take-b", 0, {
      takeIndex: 1,
      anchorPositions: [0, 0.1, 0.35, 0.6, 1],
    });
    const takeC = syntheticAttempt("take-c", 0, {
      takeIndex: 2,
      anchorPositions: [0, 0.4, 0.65, 0.9, 1],
    });

    expect(selectAgreeingAttemptSubset([takeA, takeB, takeC], CONSENSUS_V1)).toEqual({
      status: "recapture_required",
      reason: "no_complete_agreeing_subset",
    });
  });

  it("rejects duplicate IDs, cross-view/hand input, and a non-production attempt count", () => {
    const takeA = syntheticAttempt("take-a", 0, { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", 0, { takeIndex: 1 });
    const takeC = syntheticAttempt("take-c", 0, { takeIndex: 2 });

    expect(() => selectAgreeingAttemptSubset([takeA, takeB, { ...takeC, id: "take-a" }], CONSENSUS_V1)).toThrow(/unique/i);
    expect(() => selectAgreeingAttemptSubset([
      takeA,
      takeB,
      syntheticAttempt("take-c", 0, { view: "shooting_side", takeIndex: 2 }),
    ], CONSENSUS_V1)).toThrow(/view/i);
    expect(() => selectAgreeingAttemptSubset([
      takeA,
      takeB,
      syntheticAttempt("take-c", 0, { shootingHand: "left", takeIndex: 2 }),
    ], CONSENSUS_V1)).toThrow(/hand/i);
    expect(() => selectAgreeingAttemptSubset([takeA, takeB], CONSENSUS_V1)).toThrow(/one or three/i);
  });

  it("validates runtime view, hand, and take-index literals plus protocol take indices", () => {
    const basic = syntheticAttempt("take-a", 0);
    const invalidView = {
      ...basic,
      frames: basic.frames.map((frame) => ({ ...frame, view: "rear" as CaptureViewV2 })),
    };
    expect(() => selectAgreeingAttemptSubset([invalidView], CONSENSUS_V1)).toThrow(/view/i);

    const invalidHand = {
      ...basic,
      frames: basic.frames.map((frame) => ({ ...frame, shootingHand: "both" as ShootingHandV2 })),
    };
    expect(() => selectAgreeingAttemptSubset([invalidHand], CONSENSUS_V1)).toThrow(/hand/i);

    const invalidTakeIndex = {
      ...basic,
      frames: basic.frames.map((frame) => ({ ...frame, takeIndex: 3 as 0 })),
    };
    expect(() => selectAgreeingAttemptSubset([invalidTakeIndex], CONSENSUS_V1)).toThrow(/take index/i);
    expect(() => selectAgreeingAttemptSubset([
      syntheticAttempt("basic-1", 0, { takeIndex: 1 }),
    ], CONSENSUS_V1)).toThrow(/basic.*take index 0/i);
    expect(() => selectAgreeingAttemptSubset([
      syntheticAttempt("take-a", 0, { takeIndex: 0 }),
      syntheticAttempt("take-b", 0.02, { takeIndex: 0 }),
      syntheticAttempt("take-c", 0.04, { takeIndex: 2 }),
    ], CONSENSUS_V1)).toThrow(/distinct.*0, 1, 2/i);
  });

  it("rejects malformed grids, missing bones, and invalid visibility values", () => {
    const valid = syntheticAttempt("take-a", 0);
    const short = { ...valid, id: "short", frames: valid.frames.slice(0, 100) };
    expect(() => selectAgreeingAttemptSubset([short], CONSENSUS_V1)).toThrow(/101/i);

    const unorderedFrame = { ...valid.frames[50], phase: valid.frames[49].phase };
    const unordered = replaceFrame({ ...valid, id: "unordered" }, 50, unorderedFrame);
    expect(() => selectAgreeingAttemptSubset([unordered], CONSENSUS_V1)).toThrow(/phase/i);

    const missingBoneFrame = {
      ...valid.frames[0],
      sourceLandmarks: valid.frames[0].sourceLandmarks.slice(0, 28),
    };
    const missingBone = replaceFrame({ ...valid, id: "missing" }, 0, missingBoneFrame);
    expect(() => selectAgreeingAttemptSubset([missingBone], CONSENSUS_V1)).toThrow(/required bone/i);

    for (const [id, visibility] of [["non-finite-visibility", Number.NaN], ["out-of-range-visibility", 1.1]] as const) {
      const invalidVisibilityFrame = {
        ...valid.frames[0],
        sourceLandmarks: valid.frames[0].sourceLandmarks.map((point, index) => (
          index === 11 ? { ...point, visibility } : point
        )),
      };
      const invalidVisibility = replaceFrame({ ...valid, id }, 0, invalidVisibilityFrame);
      expect(() => selectAgreeingAttemptSubset([invalidVisibility], CONSENSUS_V1)).toThrow(/visibility.*\[0, 1\]/i);
    }
  });

  it("returns exact recapture for structurally valid Basic data that fails eligibility", () => {
    const valid = syntheticAttempt("take-a", 0);
    const expected = { status: "recapture_required", reason: "no_complete_agreeing_subset" } as const;

    const nonFiniteFrame = {
      ...valid.frames[0],
      sourceLandmarks: valid.frames[0].sourceLandmarks.map((point, index) => (
        index === 11 ? { ...point, x: Number.NaN } : point
      )),
    };
    const nonFinite = replaceFrame({ ...valid, id: "non-finite" }, 0, nonFiniteFrame);
    expect(selectAgreeingAttemptSubset([nonFinite], CONSENSUS_V1)).toEqual(expected);

    const unavailableFrame = {
      ...valid.frames[0],
      sourceLandmarks: valid.frames[0].sourceLandmarks.map((point, index) => (
        index === 11 ? { ...point, visibility: 0.1 } : point
      )),
    };
    const unavailable = replaceFrame({ ...valid, id: "unavailable" }, 0, unavailableFrame);
    expect(selectAgreeingAttemptSubset([unavailable], CONSENSUS_V1)).toEqual(expected);

    const collapsedFrame = {
      ...valid.frames[0],
      sourceLandmarks: valid.frames[0].sourceLandmarks.map((point, index, points) => (
        index === 12 ? { ...points[11] } : point
      )),
    };
    const collapsed = replaceFrame({ ...valid, id: "collapsed" }, 0, collapsedFrame);
    expect(selectAgreeingAttemptSubset([collapsed], CONSENSUS_V1)).toEqual(expected);
  });
});

describe("aggregateViewAttempts", () => {
  it("uses the chosen attempt ID set unchanged for every phase and landmark", () => {
    const takeA = syntheticAttempt("take-a", 0, { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", 0.04, { takeIndex: 1 });
    const takeC = syntheticAttempt("take-c", (frameIndex) => frameIndex === 0 ? 0.01 : 0.4, {
      takeIndex: 2,
    });

    const result = aggregateViewAttempts([takeC, takeB, takeA], CONSENSUS_V1);

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.attemptIds).toEqual(["take-a", "take-b"]);
    expect(result.frames).toHaveLength(101);
    expect(result.frames.every((frame) => frame.view === "front" && frame.shootingHand === "right")).toBe(true);
    expect(result.frames[0].sourceLandmarks[28].x).toBeCloseTo(
      (takeA.frames[0].sourceLandmarks[28].x + takeB.frames[0].sourceLandmarks[28].x) / 2,
      12,
    );
    expect(result.frames[50].sourceLandmarks[28].y).toBeCloseTo(
      (takeA.frames[50].sourceLandmarks[28].y + takeB.frames[50].sourceLandmarks[28].y) / 2,
      12,
    );
  });
});
