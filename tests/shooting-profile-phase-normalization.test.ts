import { describe, expect, it } from "vitest";

import {
  detectPhaseAnchors,
  phaseAtTimestamp,
  resampleAttemptToPhaseGrid,
  type ShotPhaseAnchorV2,
} from "@/lib/shooting-profile/phase-normalization";
import type {
  CaptureViewV2,
  LandmarkSequenceV2,
  ShootingHandV2,
  SourceLandmarkV2,
} from "@/lib/shooting-profile/types";

const PHASES = [0, 0.25, 0.5, 0.75, 1] as const;

function landmarksForFrame(frameIndex: number, shootingHand: ShootingHandV2): SourceLandmarkV2[] {
  const landmarks: SourceLandmarkV2[] = Array.from(
    { length: 33 },
    () => ({ x: 0.5, y: 0.5, z: 10 }),
  );
  const bodyY = [0.45, 0.7, 0.55, 0.35, 0.37][frameIndex];
  const wristY = [0.8, 0.76, 0.61, 0.12, 0.09][frameIndex];
  const elbowY = [0.65, 0.68, 0.58, 0.24, 0.22][frameIndex];
  const shootingIndices = shootingHand === "right"
    ? { elbow: 14, wrist: 16, knee: 26, ankle: 28 }
    : { elbow: 13, wrist: 15, knee: 25, ankle: 27 };

  landmarks[23] = { x: 0.45, y: bodyY, z: 1, visibility: 0.9 };
  landmarks[24] = { x: 0.55, y: bodyY, z: 2, visibility: 0.9 };
  landmarks[shootingIndices.knee] = { x: 0.52, y: bodyY + 0.2, z: 3, visibility: 0.9 };
  landmarks[shootingIndices.ankle] = { x: 0.53, y: bodyY + 0.4, z: 4, visibility: 0.9 };
  landmarks[shootingIndices.elbow] = { x: 0.6, y: elbowY, z: 5, visibility: 0.9 };
  landmarks[shootingIndices.wrist] = { x: 0.65, y: wristY, z: 6, visibility: 0.9 };
  return landmarks;
}

function syntheticAttempt(
  timestamps: number[],
  options: {
    shootingHand?: ShootingHandV2;
    view?: CaptureViewV2;
    takeIndex?: 0 | 1 | 2;
  } = {},
): LandmarkSequenceV2 {
  const shootingHand = options.shootingHand ?? "right";
  return {
    version: 2,
    view: options.view ?? "front",
    shootingHand,
    takeIndex: options.takeIndex ?? 0,
    metadata: {
      durationMs: timestamps.at(-1) ?? 0,
      displayWidth: 1920,
      displayHeight: 1080,
      nominalFrameRate: 30,
      frameRateMode: "variable",
      attemptedFrames: timestamps.length,
      decodedFrames: timestamps.length,
      detectedFrames: timestamps.length,
      rejectedFrames: 0,
    },
    frames: timestamps.map((timestampMs, frameIndex) => ({
      timestampMs,
      sourceLandmarks: landmarksForFrame(frameIndex, shootingHand).map((point) => ({
        ...point,
        x: frameIndex / Math.max(1, timestamps.length - 1),
      })),
      cropRectPx: { x: 0, y: 0, width: 1920, height: 1080 },
      modelToSourcePx: [1, 0, 0, 0, 1, 0],
    })),
    transformConvention: "upright_source_top_left_v1",
    quality: { passed: true, reasons: [] },
  };
}

function knownAnchors(attempt: LandmarkSequenceV2): ShotPhaseAnchorV2[] {
  return attempt.frames.map((frame, index) => ({
    id: (["ready", "deepestDip", "rise", "releaseProxy", "followThrough"] as const)[index],
    timestampMs: frame.timestampMs,
    phase: PHASES[index],
  }));
}

describe("detectPhaseAnchors", () => {
  it.each(["right", "left"] as const)("selects the %s shooting arm and returns ordered anchors", (shootingHand) => {
    const attempt = syntheticAttempt([0, 100, 220, 360, 540], { shootingHand });

    expect(detectPhaseAnchors(attempt)).toEqual(knownAnchors(attempt));
  });

  it("rejects missing critical joints and duplicate or non-monotonic timestamps", () => {
    const missing = syntheticAttempt([0, 100, 220, 360, 540]);
    missing.frames[2].sourceLandmarks[16] = undefined as unknown as SourceLandmarkV2;
    expect(() => detectPhaseAnchors(missing)).toThrow();

    const duplicate = syntheticAttempt([0, 100, 100, 360, 540]);
    expect(() => detectPhaseAnchors(duplicate)).toThrow();

    const reversed = syntheticAttempt([0, 220, 100, 360, 540]);
    expect(() => detectPhaseAnchors(reversed)).toThrow();
  });
});

describe("phaseAtTimestamp", () => {
  const anchors: ShotPhaseAnchorV2[] = [
    { id: "ready", timestampMs: 100, phase: 0 },
    { id: "deepestDip", timestampMs: 200, phase: 0.25 },
    { id: "rise", timestampMs: 400, phase: 0.5 },
    { id: "releaseProxy", timestampMs: 600, phase: 0.75 },
    { id: "followThrough", timestampMs: 900, phase: 1 },
  ];

  it("maps exact anchors, intervals, and bounds monotonically", () => {
    expect(phaseAtTimestamp(50, anchors)).toBe(0);
    expect(phaseAtTimestamp(200, anchors)).toBe(0.25);
    expect(phaseAtTimestamp(300, anchors)).toBe(0.375);
    expect(phaseAtTimestamp(750, anchors)).toBe(0.875);
    expect(phaseAtTimestamp(1_000, anchors)).toBe(1);
  });

  it("rejects non-finite timestamps and invalid anchor order", () => {
    expect(() => phaseAtTimestamp(Number.NaN, anchors)).toThrow();
    expect(() => phaseAtTimestamp(300, [anchors[0], anchors[2], anchors[1], anchors[3], anchors[4]])).toThrow();
    expect(() => phaseAtTimestamp(300, anchors.map((anchor, index) => {
      if (index === 1) return { ...anchor, id: "rise" };
      if (index === 2) return { ...anchor, id: "deepestDip" };
      return anchor;
    }))).toThrow();
    expect(() => phaseAtTimestamp(300, anchors.map((anchor, index) => (
      index === 2 ? { ...anchor, phase: 0.25 } : anchor
    )))).toThrow();
  });
});

describe("resampleAttemptToPhaseGrid", () => {
  it("maps independently timed attempts to the same production phase grid", () => {
    const fast = syntheticAttempt([0, 120, 260, 410, 620]);
    const slow = syntheticAttempt([0, 260, 620, 980, 1500]);
    const a = resampleAttemptToPhaseGrid(fast, knownAnchors(fast), 101);
    const b = resampleAttemptToPhaseGrid(slow, knownAnchors(slow), 101);

    expect(a.map((frame) => frame.phase)).toEqual(b.map((frame) => frame.phase));
    expect(a).toHaveLength(101);
    expect(a.map((frame) => frame.phase)).toEqual(Array.from({ length: 101 }, (_, index) => index / 100));
  });

  it("interpolates only source-space 2D observations from the supplied attempt", () => {
    const attempt = syntheticAttempt([1_000, 1_120, 1_260, 1_410, 1_620], {
      view: "shooting_side",
      takeIndex: 2,
    });
    const sampled = resampleAttemptToPhaseGrid(attempt, knownAnchors(attempt), 101);

    expect(sampled[0]).toMatchObject({
      phase: 0,
      view: "shooting_side",
      shootingHand: "right",
      takeIndex: 2,
    });
    expect(sampled[50].sourceLandmarks[0].x).toBeCloseTo(0.5, 12);
    expect(sampled[100].sourceLandmarks[0].x).toBeCloseTo(1, 12);
    expect(sampled.every((frame) => frame.sourceLandmarks.every((point) => !("z" in point)))).toBe(true);
  });

  it("rejects invalid sample counts, anchors, landmarks, and source frame order", () => {
    const attempt = syntheticAttempt([0, 120, 260, 410, 620]);
    const anchors = knownAnchors(attempt);

    expect(() => resampleAttemptToPhaseGrid(attempt, anchors, 1)).toThrow();
    expect(() => resampleAttemptToPhaseGrid(attempt, anchors, 2.5)).toThrow();
    expect(() => resampleAttemptToPhaseGrid(attempt, [anchors[0], anchors[2], anchors[1], anchors[3], anchors[4]], 101)).toThrow();

    const nonFinite = syntheticAttempt([0, 120, 260, 410, 620]);
    nonFinite.frames[2].sourceLandmarks[0].x = Number.POSITIVE_INFINITY;
    expect(() => resampleAttemptToPhaseGrid(nonFinite, anchors, 101)).toThrow();

    const insufficient = syntheticAttempt([0, 120, 260, 410, 620]);
    insufficient.frames = insufficient.frames.slice(0, 1);
    expect(() => resampleAttemptToPhaseGrid(insufficient, anchors, 101)).toThrow();

    const nonMonotonic = syntheticAttempt([0, 120, 260, 410, 620]);
    nonMonotonic.frames[2].timestampMs = 100;
    expect(() => resampleAttemptToPhaseGrid(nonMonotonic, anchors, 101)).toThrow();
  });
});
