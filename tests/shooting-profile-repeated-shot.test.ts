import { describe, expect, it } from "vitest";

import {
  aggregateViewAttempts,
  CONSENSUS_V1,
  selectAgreeingAttemptSubset,
  type AggregatedProjectedBoneV1,
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

function degrees(value: number): number {
  return value * Math.PI / 180;
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

function withVisibility(
  attempt: NormalizedViewAttemptV2,
  visibility: number,
): NormalizedViewAttemptV2 {
  return {
    ...attempt,
    frames: attempt.frames.map((frame) => ({
      ...frame,
      sourceLandmarks: frame.sourceLandmarks.map((point) => ({ ...point, visibility })),
    })),
  };
}

function projectedDirection(
  attempt: NormalizedViewAttemptV2,
  frameIndex: number,
  proximalLandmarkIndex: number,
  distalLandmarkIndex: number,
): { x: number; y: number } {
  const proximal = attempt.frames[frameIndex].sourceLandmarks[proximalLandmarkIndex];
  const distal = attempt.frames[frameIndex].sourceLandmarks[distalLandmarkIndex];
  const x = distal.x - proximal.x;
  const y = distal.y - proximal.y;
  const magnitude = Math.hypot(x, y);
  return { x: x / magnitude, y: y / magnitude };
}

function expectSameDirection(
  actual: AggregatedProjectedBoneV1["direction"],
  expected: { x: number; y: number },
): void {
  expect(actual.x).toBeCloseTo(expected.x, 12);
  expect(actual.y).toBeCloseTo(expected.y, 12);
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

  it("includes the third take only by complete link and reports the final subset medoid", () => {
    const takeA = syntheticAttempt("take-a", 0, { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", 0.04, { takeIndex: 1 });
    const takeC = syntheticAttempt("take-c", 0.06, { takeIndex: 2 });

    const result = selectAgreeingAttemptSubset([takeC, takeA, takeB], CONSENSUS_V1);

    expect(result).toMatchObject({
      status: "accepted",
      evidence: "multi_take_consensus",
      attemptIds: ["take-a", "take-b", "take-c"],
      medoidAttemptId: "take-b",
    });
  });

  it("treats signed +179/-179-degree directions as two degrees apart across circular wraparound", () => {
    const takeA = syntheticAttempt("take-a", degrees(179), { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", degrees(-179), { takeIndex: 1 });
    const takeC = syntheticAttempt("take-c", degrees(0), { takeIndex: 2 });

    const result = aggregateViewAttempts([takeC, takeB, takeA], CONSENSUS_V1);

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.attemptIds).toEqual(["take-a", "take-b"]);
    expect(result.frames[40].bones.left_forearm.retainedSpreadRadians).toBeCloseTo(degrees(2), 10);
  });

  it("rejects true antipodal signed directions when no complete pair agrees", () => {
    const takeA = syntheticAttempt("take-a", degrees(0), { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", degrees(180), { takeIndex: 1 });
    const takeC = syntheticAttempt("take-c", degrees(90), { takeIndex: 2 });

    expect(selectAgreeingAttemptSubset([takeC, takeA, takeB], CONSENSUS_V1)).toEqual({
      status: "recapture_required",
      reason: "no_complete_agreeing_subset",
    });
  });

  it("admits 0/+7/-7 degrees by complete link and deterministically excludes the 14-degree endpoint", () => {
    const takeA = syntheticAttempt("take-a", degrees(0), { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", degrees(7), { takeIndex: 1 });
    const takeC = syntheticAttempt("take-c", degrees(-7), { takeIndex: 2 });
    const permutations = [
      [takeA, takeB, takeC],
      [takeA, takeC, takeB],
      [takeB, takeA, takeC],
      [takeB, takeC, takeA],
      [takeC, takeA, takeB],
      [takeC, takeB, takeA],
    ];

    const results = permutations.map((attempts) => selectAgreeingAttemptSubset(attempts, CONSENSUS_V1));

    expect(results.every((result) => (
      result.status === "accepted"
      && result.attemptIds.join("|") === "take-a|take-b"
      && result.medoidAttemptId === "take-a"
    ))).toBe(true);
  });

  it("excludes a phase-40 outlier even when all five marker phases agree", () => {
    const takeA = syntheticAttempt("take-a", 0, { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", 0.02, { takeIndex: 1 });
    const takeC = syntheticAttempt("take-c", (frameIndex) => frameIndex === 40 ? 0.50 : 0.01, {
      takeIndex: 2,
    });

    const result = selectAgreeingAttemptSubset([takeC, takeB, takeA], CONSENSUS_V1);

    expect(result).toMatchObject({
      status: "accepted",
      attemptIds: ["take-a", "take-b"],
    });
  });

  it("requires recapture when phase-40 corruptions leave no complete all-phase pair", () => {
    const takeA = syntheticAttempt("take-a", (index) => index === 40 ? 0 : 0, { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", (index) => index === 40 ? 0.30 : 0, { takeIndex: 1 });
    const takeC = syntheticAttempt("take-c", (index) => index === 40 ? 0.60 : 0, { takeIndex: 2 });

    expect(selectAgreeingAttemptSubset([takeA, takeB, takeC], CONSENSUS_V1)).toEqual({
      status: "recapture_required",
      reason: "no_complete_agreeing_subset",
    });
  });

  it("keeps deterministic whole-view selection under every input permutation", () => {
    const takeA = syntheticAttempt("take-a", 0, { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", 0.02, { takeIndex: 1 });
    const takeC = syntheticAttempt("take-c", (frameIndex) => frameIndex === 40 ? 0.50 : 0.01, {
      takeIndex: 2,
    });
    const permutations = [
      [takeA, takeB, takeC],
      [takeA, takeC, takeB],
      [takeB, takeA, takeC],
      [takeB, takeC, takeA],
      [takeC, takeA, takeB],
      [takeC, takeB, takeA],
    ];

    const results = permutations.map((attempts) => aggregateViewAttempts(attempts, CONSENSUS_V1));

    expect(results.every((result) => (
      result.status === "accepted"
      && result.attemptIds.join("|") === "take-a|take-b"
      && result.frames.length === 101
      && result.frames.every((frame) => Object.keys(frame.bones).length === CONSENSUS_V1.requiredBones.length)
    ))).toBe(true);
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
  it("uses the chosen attempt ID set unchanged for every phase and projected bone", () => {
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
    expectSameDirection(
      result.frames[0].bones.right_shin.direction,
      projectedDirection(takeA, 0, 26, 28),
    );
    expectSameDirection(
      result.frames[50].bones.right_shin.direction,
      projectedDirection(takeA, 50, 26, 28),
    );
    expect(result.frames.every((frame) => (
      frame.bones.right_shin.medoidAttemptId === "take-a"
      && frame.bones.right_shin.supportAttemptIds.join("|") === "take-a|take-b"
    ))).toBe(true);
  });

  it("returns an actual retained signed circular-medoid direction with stable ID tie-breaking", () => {
    const takeA = syntheticAttempt("take-a", 0, { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", 0.04, { takeIndex: 1 });
    const takeC = syntheticAttempt("take-c", 0.30, { takeIndex: 2 });

    const result = aggregateViewAttempts([takeC, takeB, takeA], CONSENSUS_V1);

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    const evidence = result.frames[40].bones.left_forearm;
    expect(evidence.medoidAttemptId).toBe("take-a");
    expectSameDirection(evidence.direction, projectedDirection(takeA, 40, 13, 15));
    expect(evidence.angularMadRadians).toBeCloseTo(0.02, 10);
    expect(evidence.retainedSpreadRadians).toBeCloseTo(0.04, 10);
    expect(evidence.supportAttemptIds).toEqual(["take-a", "take-b"]);
  });

  it("weights the circular medoid by retained endpoint visibility", () => {
    const takeA = withVisibility(syntheticAttempt("take-a", 0, { takeIndex: 0 }), 0.95);
    const takeB = withVisibility(syntheticAttempt("take-b", 0.12, { takeIndex: 1 }), 0.50);
    const takeC = withVisibility(syntheticAttempt("take-c", 0.13, { takeIndex: 2 }), 0.50);

    const result = aggregateViewAttempts([takeC, takeB, takeA], CONSENSUS_V1);

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    const evidence = result.frames[40].bones.left_forearm;
    expect(result.attemptIds).toEqual(["take-a", "take-b", "take-c"]);
    expect(evidence.medoidAttemptId).toBe("take-a");
    expectSameDirection(evidence.direction, projectedDirection(takeA, 40, 13, 15));
  });

  it("includes accepted third-take dispersion in every bone's retained spread", () => {
    const takeA = syntheticAttempt("take-a", 0, { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", 0.04, { takeIndex: 1 });
    const excluded = syntheticAttempt("take-c", 0.30, { takeIndex: 2 });
    const included = syntheticAttempt("take-c", 0.10, { takeIndex: 2 });

    const pairOnly = aggregateViewAttempts([excluded, takeB, takeA], CONSENSUS_V1);
    const withThird = aggregateViewAttempts([included, takeB, takeA], CONSENSUS_V1);

    expect(pairOnly.status).toBe("accepted");
    expect(withThird.status).toBe("accepted");
    if (pairOnly.status !== "accepted" || withThird.status !== "accepted") return;
    expect(pairOnly.attemptIds).toEqual(["take-a", "take-b"]);
    expect(withThird.attemptIds).toEqual(["take-a", "take-b", "take-c"]);
    expect(withThird.frames[40].bones.left_forearm.retainedSpreadRadians).toBeGreaterThan(
      pairOnly.frames[40].bones.left_forearm.retainedSpreadRadians,
    );
    expect(withThird.consensusDispersionRadians).toBeGreaterThan(pairOnly.consensusDispersionRadians);
  });

  it("reports retained spread as maximum pairwise separation rather than medoid radius", () => {
    const takeA = syntheticAttempt("take-a", degrees(0), { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", degrees(3), { takeIndex: 1 });
    const takeC = syntheticAttempt("take-c", degrees(6), { takeIndex: 2 });

    const result = aggregateViewAttempts([takeC, takeA, takeB], CONSENSUS_V1);

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.attemptIds).toEqual(["take-a", "take-b", "take-c"]);
    expect(result.frames[40].bones.left_forearm.medoidAttemptId).toBe("take-b");
    expect(result.frames[40].bones.left_forearm.retainedSpreadRadians).toBeCloseTo(degrees(6), 10);
  });

  it("fails closed when retained circular spread exceeds its named gate", () => {
    const takeA = syntheticAttempt("take-a", 0, { takeIndex: 0 });
    const takeB = syntheticAttempt("take-b", 0.05, { takeIndex: 1 });
    const takeC = syntheticAttempt("take-c", 0.30, { takeIndex: 2 });
    const permissivePairGate = {
      ...CONSENSUS_V1,
      maxAngularDistanceRadians: 0.35,
      maximumRetainedAngularSpreadRadians: 0.20,
    };

    expect(aggregateViewAttempts([takeC, takeB, takeA], permissivePairGate)).toEqual({
      status: "recapture_required",
      reason: "no_complete_agreeing_subset",
    });
  });
});
