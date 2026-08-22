import { describe, expect, it } from "vitest";

import {
  PhaseDetectionError,
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
const ANCHOR_IDS = ["ready", "deepestDip", "rise", "releaseProxy", "followThrough"] as const;

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
      sourceLandmarks: landmarksForFrame(frameIndex, shootingHand),
      cropRectPx: { x: 0, y: 0, width: 1920, height: 1080 },
      modelToSourcePx: [1, 0, 0, 0, 1, 0],
    })),
    transformConvention: "upright_source_top_left_v1",
    quality: { passed: true, reasons: [] },
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function interpolate(from: number, to: number, amount: number): number {
  return from + (to - from) * clamp01(amount);
}

function credibleLandmarksAtTime(
  timestampMs: number,
  shootingHand: ShootingHandV2,
): SourceLandmarkV2[] {
  const landmarks: SourceLandmarkV2[] = Array.from(
    { length: 33 },
    () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }),
  );
  const dipProgress = clamp01((timestampMs - 600) / 300);
  const firstRiseProgress = clamp01((timestampMs - 900) / 200);
  const secondRiseProgress = clamp01((timestampMs - 1_100) / 200);
  const bodyY = timestampMs <= 900
    ? interpolate(0.45, 0.70, dipProgress)
    : timestampMs <= 1_100
      ? interpolate(0.70, 0.50, firstRiseProgress)
      : interpolate(0.50, 0.35, secondRiseProgress);
  const releaseProgress = clamp01((timestampMs - 900) / 400) ** 2;
  const followProgress = clamp01((timestampMs - 1_300) / 150);
  const wristY = timestampMs <= 900
    ? interpolate(0.78, 0.76, dipProgress)
    : timestampMs <= 1_300
      ? interpolate(0.76, 0.12, releaseProgress)
      : interpolate(0.12, 0.09, followProgress);
  const elbowY = timestampMs <= 900
    ? interpolate(0.65, 0.68, dipProgress)
    : timestampMs <= 1_300
      ? interpolate(0.68, 0.24, releaseProgress)
      : interpolate(0.24, 0.22, followProgress);
  const shootingIndices = shootingHand === "right"
    ? { elbow: 14, wrist: 16, knee: 26, ankle: 28 }
    : { elbow: 13, wrist: 15, knee: 25, ankle: 27 };
  landmarks[23] = { x: 0.45, y: bodyY, z: 0, visibility: 0.9 };
  landmarks[24] = { x: 0.55, y: bodyY, z: 0, visibility: 0.9 };
  landmarks[shootingIndices.knee] = { x: 0.52, y: bodyY + 0.20, z: 0, visibility: 0.9 };
  landmarks[shootingIndices.ankle] = { x: 0.53, y: bodyY + 0.40, z: 0, visibility: 0.9 };
  landmarks[shootingIndices.elbow] = { x: 0.60, y: elbowY, z: 0, visibility: 0.9 };
  landmarks[shootingIndices.wrist] = { x: 0.65, y: wristY, z: 0, visibility: 0.9 };
  return landmarks;
}

function motionAttempt(
  timestamps: readonly number[],
  options: {
    shootingHand?: ShootingHandV2;
    view?: CaptureViewV2;
    landmarksAtTime?: (timestampMs: number, shootingHand: ShootingHandV2) => SourceLandmarkV2[];
  } = {},
): LandmarkSequenceV2 {
  const shootingHand = options.shootingHand ?? "right";
  const landmarksAtTime = options.landmarksAtTime ?? credibleLandmarksAtTime;
  return {
    version: 2,
    view: options.view ?? "front",
    shootingHand,
    takeIndex: 0,
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
    frames: timestamps.map((timestampMs) => ({
      timestampMs,
      sourceLandmarks: landmarksAtTime(timestampMs, shootingHand),
      cropRectPx: { x: 0, y: 0, width: 1920, height: 1080 },
      modelToSourcePx: [1, 0, 0, 0, 1, 0],
    })),
    transformConvention: "upright_source_top_left_v1",
    quality: { passed: true, reasons: [] },
  };
}

function cadenceTimestamps(fps: 15 | 30, endTimestampMs = 1_600): number[] {
  const stepMs = 1_000 / fps;
  return Array.from(
    { length: Math.floor((endTimestampMs - 400) / stepMs + 1e-9) + 1 },
    (_, index) => 400 + index * stepMs,
  );
}

function appendDuplicateFrame(attempt: LandmarkSequenceV2, elapsedMs: number): LandmarkSequenceV2 {
  const last = attempt.frames.at(-1) as LandmarkSequenceV2["frames"][number];
  return {
    ...attempt,
    metadata: {
      ...attempt.metadata,
      durationMs: last.timestampMs + elapsedMs,
      attemptedFrames: attempt.metadata.attemptedFrames + 1,
      decodedFrames: attempt.metadata.decodedFrames + 1,
      detectedFrames: attempt.metadata.detectedFrames + 1,
    },
    frames: [
      ...attempt.frames,
      {
        ...last,
        timestampMs: last.timestampMs + elapsedMs,
        sourceLandmarks: last.sourceLandmarks.map((point) => ({ ...point })),
      },
    ],
  };
}

function walkingLandmarksAtTime(
  timestampMs: number,
  shootingHand: ShootingHandV2,
): SourceLandmarkV2[] {
  const cycle = 2 * Math.PI * timestampMs / 800;
  const bodyY = 0.48 + Math.sin(cycle) * 0.006;
  const translationX = timestampMs * 0.00005;
  const landmarks = credibleLandmarksAtTime(400, shootingHand).map((point) => ({
    ...point,
    x: point.x + translationX,
  }));
  const shootingIndices = shootingHand === "right"
    ? { elbow: 14, wrist: 16, knee: 26, ankle: 28 }
    : { elbow: 13, wrist: 15, knee: 25, ankle: 27 };
  landmarks[23].y = bodyY;
  landmarks[24].y = bodyY;
  landmarks[shootingIndices.knee].y = bodyY + 0.20 + Math.sin(cycle) * 0.01;
  landmarks[shootingIndices.ankle].y = bodyY + 0.40 - Math.sin(cycle) * 0.01;
  landmarks[shootingIndices.elbow].y = 0.64 - Math.sin(cycle) * 0.015;
  landmarks[shootingIndices.wrist].y = 0.72 + Math.sin(cycle) * 0.02;
  return landmarks;
}

function knownAnchors(attempt: LandmarkSequenceV2): ShotPhaseAnchorV2[] {
  return attempt.frames.map((frame, index) => ({
    id: (["ready", "deepestDip", "rise", "releaseProxy", "followThrough"] as const)[index],
    timestampMs: frame.timestampMs,
    phase: PHASES[index],
  }));
}

function mapAttemptLandmarks(
  attempt: LandmarkSequenceV2,
  mapPoint: (
    point: SourceLandmarkV2,
    landmarkIndex: number,
    frameIndex: number,
  ) => SourceLandmarkV2,
): LandmarkSequenceV2 {
  return {
    ...attempt,
    frames: attempt.frames.map((frame, frameIndex) => ({
      ...frame,
      sourceLandmarks: frame.sourceLandmarks.map((point, landmarkIndex) => (
        mapPoint(point, landmarkIndex, frameIndex)
      )),
    })),
  };
}

function expectPhaseFailure(
  attempt: LandmarkSequenceV2,
  reason: PhaseDetectionError["reason"],
): void {
  let anchors: ShotPhaseAnchorV2[] | undefined;
  expect(() => {
    anchors = detectPhaseAnchors(attempt);
  }).toThrowError(expect.objectContaining({ reason }));
  expect(anchors).toBeUndefined();
}

function denseSmoothingAttempt(): LandmarkSequenceV2 {
  const base = syntheticAttempt(Array.from({ length: 101 }, (_, index) => index * 10));
  return mapAttemptLandmarks(base, (point, landmarkIndex, frameIndex) => {
    if (landmarkIndex !== 0) return { ...point, x: 0.5, y: 0.5 };
    return {
      ...point,
      x: frameIndex === 50 ? 0.9 : 0.5,
      y: 0.5,
      visibility: frameIndex === 50 ? 0.001 : 1,
    };
  });
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

  it.each(["front", "shooting_side"] as const)(
    "fails closed for a stationary %s attempt without manufacturing anchors",
    (view) => {
      const source = syntheticAttempt([0, 100, 220, 360, 540], { view });
      const stationary = mapAttemptLandmarks(source, (_point, landmarkIndex) => ({
        ...source.frames[0].sourceLandmarks[landmarkIndex],
      }));

      expectPhaseFailure(stationary, "insufficient_total_motion");
    },
  );

  it("rejects sub-threshold jitter and walking translation without shot motion", () => {
    const source = syntheticAttempt([0, 100, 220, 360, 540]);
    const jitter = mapAttemptLandmarks(source, (_point, landmarkIndex, frameIndex) => {
      const origin = source.frames[0].sourceLandmarks[landmarkIndex];
      const amount = (frameIndex % 2 === 0 ? 1 : -1) * 0.00005;
      return { ...origin, x: origin.x + amount, y: origin.y - amount };
    });
    const walking = motionAttempt(
      Array.from({ length: 21 }, (_, index) => index * 100),
      { landmarksAtTime: walkingLandmarksAtTime },
    );

    expectPhaseFailure(jitter, "insufficient_total_motion");
    expectPhaseFailure(walking, "missing_dip");
  });

  it("keeps ready and follow-through anchors invariant to near-idle pre-roll and appended idle tail", () => {
    const baseTimestamps = cadenceTimestamps(30);
    const base = motionAttempt(baseTimestamps);
    const prependedSource = motionAttempt([0, 100, 200, 300, ...baseTimestamps]);
    const prepended = mapAttemptLandmarks(prependedSource, (point, _landmarkIndex, frameIndex) => (
      frameIndex < 4
        ? { ...point, y: point.y + (frameIndex % 2 === 0 ? 0.0001 : -0.0001) }
        : point
    ));
    const appended = motionAttempt([...baseTimestamps, 1_700, 1_800, 1_900]);

    const expected = detectPhaseAnchors(base);

    expect(detectPhaseAnchors(prepended)).toEqual(expected);
    expect(detectPhaseAnchors(appended)).toEqual(expected);
    expect(expected[0].timestampMs).toBeCloseTo(600, 10);
    expect(expected[4].timestampMs).toBeLessThan(1_600);
  });

  it("admits the same interpolated shot at 15 and 30 fps with anchors in one 15-fps neighborhood", () => {
    const fifteenFps = detectPhaseAnchors(motionAttempt(cadenceTimestamps(15)));
    const thirtyFps = detectPhaseAnchors(motionAttempt(cadenceTimestamps(30)));

    expect(fifteenFps.map((anchor) => anchor.id)).toEqual(ANCHOR_IDS);
    expect(thirtyFps.map((anchor) => anchor.id)).toEqual(ANCHOR_IDS);
    expect(fifteenFps.every((anchor, index) => (
      Math.abs(anchor.timestampMs - thirtyFps[index].timestampMs) <= 1_000 / 15
    ))).toBe(true);
    expect(Math.abs(fifteenFps[3].timestampMs - 1_300)).toBeLessThanOrEqual(1_000 / 15);
    expect(Math.abs(thirtyFps[3].timestampMs - 1_300)).toBeLessThanOrEqual(1_000 / 30);
  });

  it("requires elapsed post-release evidence instead of accepting a truncated clip or 1 ms duplicate", () => {
    const truncated = motionAttempt(cadenceTimestamps(30, 1_300));
    const duplicate = appendDuplicateFrame(truncated, 1);

    expect(truncated.frames.at(-1)?.timestampMs).toBeCloseTo(1_300, 10);
    expectPhaseFailure(truncated, "missing_follow_through");
    expectPhaseFailure(duplicate, "missing_follow_through");
  });

  it("rejects a dip with no credible post-dip rise or release proxy", () => {
    const source = syntheticAttempt([0, 100, 220, 360, 540]);
    const missingRise = mapAttemptLandmarks(source, (point, landmarkIndex, frameIndex) => {
      const isBody = [23, 24, 26, 28].includes(landmarkIndex);
      const isArm = [14, 16].includes(landmarkIndex);
      if (isBody) {
        const ready = source.frames[0].sourceLandmarks[landmarkIndex];
        return { ...ready, y: ready.y + (frameIndex === 0 ? 0 : 0.18) };
      }
      if (isArm) return { ...source.frames[0].sourceLandmarks[landmarkIndex] };
      return point;
    });

    expectPhaseFailure(missingRise, "missing_rise");
  });

  it("rejects a valid dip and body rise when the shooting wrist never rises or extends", () => {
    const source = syntheticAttempt([0, 100, 220, 360, 540]);
    const missingRelease = mapAttemptLandmarks(source, (point, landmarkIndex) => (
      [14, 16].includes(landmarkIndex)
        ? { ...source.frames[0].sourceLandmarks[landmarkIndex] }
        : point
    ));

    expectPhaseFailure(missingRelease, "missing_release_proxy");
  });

  it("rejects degenerate body scale and a critical detected-frame gap around release", () => {
    const source = syntheticAttempt([0, 100, 220, 360, 540]);
    const degenerate = mapAttemptLandmarks(source, (point, landmarkIndex) => (
      [23, 24, 26, 28].includes(landmarkIndex)
        ? { ...point, x: 0.5, y: 0.5 }
        : point
    ));
    const gap = syntheticAttempt([0, 100, 220, 900, 1_020]);

    expectPhaseFailure(degenerate, "degenerate_body_scale");
    expectPhaseFailure(gap, "critical_phase_gap");
  });

  it("rejects invalid upright-source dimensions before phase motion is measured", () => {
    const attempt = syntheticAttempt([0, 100, 220, 360, 540]);
    attempt.metadata.displayHeight = 0;

    expectPhaseFailure(attempt, "invalid_source_dimensions");
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
    const source = syntheticAttempt([1_000, 1_120, 1_260, 1_410, 1_620], {
      view: "shooting_side",
      takeIndex: 2,
    });
    const attempt = mapAttemptLandmarks(source, (point, landmarkIndex, frameIndex) => (
      landmarkIndex === 0 ? { ...point, x: 0.48 + frameIndex * 0.01 } : point
    ));
    const sampled = resampleAttemptToPhaseGrid(attempt, knownAnchors(attempt), 101);

    expect(sampled[0]).toMatchObject({
      phase: 0,
      view: "shooting_side",
      shootingHand: "right",
      takeIndex: 2,
    });
    expect(sampled[50].sourceLandmarks[0].x).toBeCloseTo(0, 12);
    expect(sampled[100].sourceLandmarks[0].x).toBeCloseTo(0.02 * 1920 / 1080, 12);
    expect(sampled.every((frame) => frame.sourceLandmarks.every((point) => !("z" in point)))).toBe(true);
  });

  it.each([
    ["landscape", 1920, 1080],
    ["portrait", 1080, 1920],
    ["square", 1000, 1000],
  ] as const)(
    "reconstructs a 45-degree pixel projection isotropically in %s source geometry",
    (_label, displayWidth, displayHeight) => {
      const source = syntheticAttempt([0, 120, 260, 410, 620]);
      source.metadata.displayWidth = displayWidth;
      source.metadata.displayHeight = displayHeight;
      const attempt = mapAttemptLandmarks(source, (point, landmarkIndex) => {
        if (landmarkIndex === 11) return { ...point, x: 0.5, y: 0.5 };
        if (landmarkIndex === 13) {
          return {
            ...point,
            x: 0.5 + 90 / displayWidth,
            y: 0.5 - 90 / displayHeight,
          };
        }
        return point;
      });

      const sampled = resampleAttemptToPhaseGrid(attempt, knownAnchors(attempt));
      const proximal = sampled[50].sourceLandmarks[11];
      const distal = sampled[50].sourceLandmarks[13];

      expect(Math.abs((distal.x - proximal.x) / (distal.y - proximal.y))).toBeCloseTo(1, 12);
    },
  );

  it("confidence-weights deterministic pre-angle smoothing without changing endpoints or visibility", () => {
    const attempt = denseSmoothingAttempt();
    const anchors: ShotPhaseAnchorV2[] = ANCHOR_IDS.map((id, index) => ({
      id,
      phase: PHASES[index],
      timestampMs: index * 250,
    }));

    const first = resampleAttemptToPhaseGrid(attempt, anchors);
    const second = resampleAttemptToPhaseGrid(attempt, anchors);

    expect(second).toEqual(first);
    expect(first[0].sourceLandmarks[0]).toMatchObject({ x: 0, y: 0, visibility: 1 });
    expect(first[100].sourceLandmarks[0]).toMatchObject({ x: 0, y: 0, visibility: 1 });
    expect(Math.abs(first[50].sourceLandmarks[0].x)).toBeLessThan(0.05);
    expect(first[50].sourceLandmarks[0].visibility).toBeCloseTo(0.001, 12);
    expect(first.every((frame) => frame.sourceLandmarks.every((point) => (
      Number.isFinite(point.x) && Number.isFinite(point.y) && !("z" in point)
    )))).toBe(true);
  });

  it("rejects non-positive or non-finite source dimensions before isotropic conversion", () => {
    for (const [field, value] of [
      ["displayWidth", 0],
      ["displayHeight", Number.NaN],
    ] as const) {
      const attempt = syntheticAttempt([0, 120, 260, 410, 620]);
      attempt.metadata[field] = value;
      expect(() => resampleAttemptToPhaseGrid(attempt, knownAnchors(attempt))).toThrow(/dimensions/i);
    }
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
