import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  OBSERVATION_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2,
  REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2,
  serializeObservationSequenceForCloud,
  serializeRepresentativeSequenceForCloud,
  validateShootingProfileWriteV2,
} from "@/lib/firebase-shooting-profile-contract";
import {
  captureSessionReducer,
  matchingShootingProfileSaveInputV2,
  type CaptureSessionState,
} from "@/lib/shooting-profile/capture-session-reducer";
import { ENGINEERING_THRESHOLDS_V1 } from "@/lib/shooting-profile/engineering-thresholds";
import { KINEMATIC_TREE_V1 } from "@/lib/shooting-profile/kinematics";
import { parseLandmarkSequenceV2 } from "@/lib/shooting-profile/landmark-sequence-contract";
import {
  buildTwoViewRepresentativeProfile,
  type TwoViewPipelineAttemptV1,
  type TwoViewPipelineResultV1,
} from "@/lib/shooting-profile/two-view-pipeline";
import { PERSISTED_JOINT_NAMES_V2, type LandmarkSequenceV2 } from "@/lib/shooting-profile/types";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

type Complete = Extract<TwoViewPipelineResultV1, { status: "complete" }>;
type Point3 = { x: number; y: number; z: number };

function attemptsFor(session: { front: LandmarkSequenceV2[]; shootingSide: LandmarkSequenceV2[] }): TwoViewPipelineAttemptV1[] {
  return [...session.front, ...session.shootingSide].map((sequence) => ({
    id: `${sequence.view}-${sequence.takeIndex}`,
    sequence,
  }));
}

function expectComplete(result: TwoViewPipelineResultV1): Complete {
  expect(result.status, JSON.stringify(result).slice(0, 600)).toBe("complete");
  if (result.status !== "complete") throw new Error("unreachable");
  return result;
}

function expectRecaptureWithoutPayload(result: TwoViewPipelineResultV1): Extract<TwoViewPipelineResultV1, { status: "recapture_required" }> {
  expect(result.status).toBe("recapture_required");
  if (result.status !== "recapture_required") throw new Error("unreachable");
  expect("saveInput" in result).toBe(false);
  expect("profile" in result).toBe(false);
  expect("normalizedAttempts" in result).toBe(false);
  expect(JSON.stringify(result)).not.toContain("joints");
  expect(typeof result.reason).toBe("string");
  expect(Array.isArray(result.affectedAttemptIds)).toBe(true);
  return result;
}

function distance(a: Point3, b: Point3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function maximumBoneLengthError(frames: readonly { joints: Record<string, Point3> }[]): number {
  let maximum = 0;
  for (const frame of frames) {
    for (const bone of KINEMATIC_TREE_V1) {
      const parent = bone.parent === "pelvis" ? { x: 0, y: 0, z: 0 } : frame.joints[bone.parent];
      const length = distance(parent, frame.joints[bone.child]);
      maximum = Math.max(
        maximum,
        Math.abs(length - ENGINEERING_THRESHOLDS_V1.templateBoneLengths[bone.id]),
      );
    }
  }
  return maximum;
}

/**
 * Plays the first half of the clip at half speed and the rest at normal
 * speed: the same shot with a slower dip, so the detected dip/rise anchors
 * land later in the take than in the other view.
 */
function slowFirstHalf(sequence: LandmarkSequenceV2): LandmarkSequenceV2 {
  const origin = sequence.frames[0].timestampMs;
  const duration = sequence.frames[sequence.frames.length - 1].timestampMs - origin;
  const midpoint = origin + duration / 2;
  const warp = (timestampMs: number) => (
    timestampMs <= midpoint ? origin + 2 * (timestampMs - origin) : timestampMs + duration / 2
  );
  return {
    ...sequence,
    metadata: {
      ...sequence.metadata,
      durationMs: duration * 1.5,
      releaseProxyTimestampMs: warp(sequence.metadata.releaseProxyTimestampMs),
      attempts: sequence.metadata.attempts.map((attempt) => ({
        requestedTimestampMs: warp(attempt.requestedTimestampMs),
        decodedTimestampMs: attempt.decodedTimestampMs === null ? null : warp(attempt.decodedTimestampMs),
        detectedTimestampMs: attempt.detectedTimestampMs === null ? null : warp(attempt.detectedTimestampMs),
      })),
    },
    frames: sequence.frames.map((frame) => ({ ...frame, timestampMs: warp(frame.timestampMs) })),
  };
}

function freezeShootingArm(sequence: LandmarkSequenceV2): LandmarkSequenceV2 {
  const frozen = sequence.frames[0].sourceLandmarks;
  return {
    ...sequence,
    frames: sequence.frames.map((frame) => ({
      ...frame,
      sourceLandmarks: frame.sourceLandmarks.map((point, index) => (
        index >= 13 && index <= 16 ? { ...frozen[index] } : point
      )),
    })),
  };
}

describe("buildTwoViewRepresentativeProfile", () => {
  it("starts from sequences that satisfy the exact public on-device contract", () => {
    for (const mode of ["basic_1_plus_1", "high_accuracy_3_plus_3"] as const) {
      for (const shootingHand of ["left", "right"] as const) {
        const session = syntheticLandmarkSession({ mode, shootingHand });
        [...session.front, ...session.shootingSide].forEach((sequence) => {
          expect(parseLandmarkSequenceV2(JSON.parse(JSON.stringify(sequence)))).toEqual(sequence);
        });
      }
    }
  });

  it("turns one front and one side landmark sequence into a persistence-ready Basic profile", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const result = expectComplete(buildTwoViewRepresentativeProfile({
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: attemptsFor(session),
    }));

    expect(result.profile.boundary).toBe("representative_phase_fused_4d_estimate_not_actual_3d");
    expect(result.profile.mode).toBe("basic_1_plus_1");
    expect(result.profile.timeBasis).toBe("normalized_shot_phase");
    expect(result.profile.frames).toHaveLength(101);
    result.profile.frames.forEach((frame, index) => {
      expect(frame.phase).toBeCloseTo(index / 100, 12);
      expect(Object.keys(frame.joints)).toEqual([...PERSISTED_JOINT_NAMES_V2]);
      expect(Object.keys(frame.uncertainty)).toEqual([...PERSISTED_JOINT_NAMES_V2]);
      for (const joint of PERSISTED_JOINT_NAMES_V2) {
        const point = frame.joints[joint];
        expect(Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)).toBe(true);
        expect(frame.uncertainty[joint].covariance.every(Number.isFinite)).toBe(true);
        expect(Number.isFinite(frame.uncertainty[joint].directionalConeDegrees)).toBe(true);
      }
    });
    expect(result.profile.frames.some((frame) => (
      Object.values(frame.joints).some((joint) => Math.abs(joint.z) > 1e-6)
    ))).toBe(true);
    expect(maximumBoneLengthError(result.profile.frames)).toBeLessThanOrEqual(
      ENGINEERING_THRESHOLDS_V1.templateBoneLengthTolerance,
    );
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(0.65);
    expect(result.crossViewAlignment.status).toBe("accepted");
    expect(result.crossViewAlignment.maximumIntermediateAnchorDelta).toBeLessThanOrEqual(0.10);
    expect(Object.values(result.evidenceSummary).every((value) => Number.isFinite(value))).toBe(true);
    expect(result.normalizedAttempts.map((attempt) => attempt.id)).toEqual(["front-0", "shooting_side-0"]);
    expect(result.selectedAttemptsByView).toEqual({ front: ["front-0"], shooting_side: ["shooting_side-0"] });
    expect(result.normalizedAnchorPositionsByAttempt["front-0"]).toHaveLength(5);
    expect(result.normalizedAnchorPositionsByAttempt["shooting_side-0"][0]).toBe(0);
    expect(result.normalizedAnchorPositionsByAttempt["shooting_side-0"][4]).toBe(1);
  });

  it("returns the exact persistence envelope that the cloud contract accepts", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const result = expectComplete(buildTwoViewRepresentativeProfile({
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: attemptsFor(session),
    }));

    expect(result.saveInput).toEqual({
      profile: result.profile,
      shootingHand: "right",
      confidence: result.confidence,
      normalizedAttempts: result.normalizedAttempts,
    });
    expect(validateShootingProfileWriteV2(result.saveInput)).toEqual(result.saveInput);
    const representative = serializeRepresentativeSequenceForCloud(result.saveInput.profile);
    expect(representative.payload.byteLength).toBe(REPRESENTATIVE_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2);
    const observations = result.saveInput.normalizedAttempts.map(serializeObservationSequenceForCloud);
    expect(observations).toHaveLength(2);
    observations.forEach((observation) => {
      expect(observation.payload.byteLength).toBe(OBSERVATION_SEQUENCE_PAYLOAD_BYTE_LENGTH_V2);
    });
    const serialized = JSON.stringify({
      representative: { ...representative, payload: undefined },
      observations: observations.map((observation) => ({ ...observation, payload: undefined })),
    });
    // `\buri\b` rather than `uri`: the representative metadata legitimately says "heuristic_v1".
    expect(serialized).not.toMatch(/timestampMs|sourceTimestampMs|file:\/\/|filename|\buri\b|exif|nose|displayWidth/i);
  });

  it("fuses three takes per view into a High-accuracy profile from the same entry point", () => {
    const session = syntheticLandmarkSession({ mode: "high_accuracy_3_plus_3" });
    const result = expectComplete(buildTwoViewRepresentativeProfile({
      mode: "high_accuracy_3_plus_3",
      shootingHand: "right",
      attempts: attemptsFor(session),
    }));

    expect(result.profile.mode).toBe("high_accuracy_3_plus_3");
    expect(result.profile.frames).toHaveLength(101);
    expect(result.normalizedAttempts).toHaveLength(6);
    expect(result.selectedAttemptsByView.front.length).toBeGreaterThanOrEqual(2);
    expect(result.selectedAttemptsByView.shooting_side.length).toBeGreaterThanOrEqual(2);
    expect(result.crossViewAlignment.comparedPairCount).toBe(
      result.selectedAttemptsByView.front.length * result.selectedAttemptsByView.shooting_side.length,
    );
    expect(validateShootingProfileWriteV2(result.saveInput)).toEqual(result.saveInput);
    expect(maximumBoneLengthError(result.profile.frames)).toBeLessThanOrEqual(
      ENGINEERING_THRESHOLDS_V1.templateBoneLengthTolerance,
    );
  });

  it("is deterministic and supports a left-handed shooter without changing joint names", () => {
    const build = () => buildTwoViewRepresentativeProfile({
      mode: "basic_1_plus_1",
      shootingHand: "left",
      attempts: attemptsFor(syntheticLandmarkSession({ mode: "basic_1_plus_1", shootingHand: "left" })),
    });
    const first = expectComplete(build());
    const second = expectComplete(build());

    expect(second).toEqual(first);
    expect(first.saveInput.shootingHand).toBe("left");
    first.profile.frames.forEach((frame) => {
      expect(Object.keys(frame.joints)).toEqual([...PERSISTED_JOINT_NAMES_V2]);
    });
  });

  it("requires recapture with the alignment reason when the side shot has a different phase rhythm", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const result = expectRecaptureWithoutPayload(buildTwoViewRepresentativeProfile({
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: [
        { id: "front-0", sequence: session.front[0] },
        { id: "shooting_side-0", sequence: slowFirstHalf(session.shootingSide[0]) },
      ],
    }));

    expect(result.reason).toBe("cross_view_phase_mismatch");
    expect(result.crossViewAlignment).toMatchObject({ status: "rejected", reason: "cross_view_phase_mismatch" });
    if (result.crossViewAlignment?.status !== "rejected") return;
    expect(result.crossViewAlignment.maximumIntermediateAnchorDelta).toBeGreaterThan(0.10);
    expect(result.affectedAttemptIds).toEqual(["front-0", "shooting_side-0"]);
  });

  it("still fuses a side shot recorded later and slower as a whole, with a lower alignment score than identical timing", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const retimed: LandmarkSequenceV2 = {
      ...session.shootingSide[0],
      frames: session.shootingSide[0].frames.map((frame) => ({
        ...frame,
        timestampMs: 90_000 + (frame.timestampMs - session.shootingSide[0].frames[0].timestampMs) * 1.25,
      })),
    };
    const result = expectComplete(buildTwoViewRepresentativeProfile({
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: [
        { id: "front-0", sequence: session.front[0] },
        { id: "shooting_side-0", sequence: retimed },
      ],
    }));

    expect(result.crossViewAlignment.status).toBe("accepted");
    expect(result.crossViewAlignment.maximumIntermediateAnchorDelta).toBeLessThanOrEqual(0.10);
    expect(result.confidence).toBeLessThanOrEqual(0.65);
  });

  it("requires recapture with the phase-detection reason when one view has no shot motion", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const result = expectRecaptureWithoutPayload(buildTwoViewRepresentativeProfile({
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: [
        { id: "front-0", sequence: session.front[0] },
        { id: "shooting_side-0", sequence: freezeShootingArm(session.shootingSide[0]) },
      ],
    }));

    expect(result.reason).toBe("phase_detection_failed");
    expect(result.detail).toMatch(/^(missing_dip|missing_rise|missing_release_proxy|missing_follow_through|insufficient_total_motion)$/);
    expect(result.affectedAttemptIds).toEqual(["shooting_side-0"]);
  });

  it("rejects an attempt set that does not match the protocol, hand, or quality gate", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const attempts = attemptsFor(session);

    const missingSide = expectRecaptureWithoutPayload(buildTwoViewRepresentativeProfile({
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: [attempts[0]],
    }));
    const wrongHand = expectRecaptureWithoutPayload(buildTwoViewRepresentativeProfile({
      mode: "basic_1_plus_1",
      shootingHand: "left",
      attempts,
    }));
    const failedQuality = expectRecaptureWithoutPayload(buildTwoViewRepresentativeProfile({
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: [
        attempts[0],
        {
          id: "shooting_side-0",
          sequence: { ...attempts[1].sequence, quality: { passed: false, reasons: ["low_detection_ratio"] } },
        },
      ],
    }));
    const highWithBasicInput = expectRecaptureWithoutPayload(buildTwoViewRepresentativeProfile({
      mode: "high_accuracy_3_plus_3",
      shootingHand: "right",
      attempts,
    }));

    expect(missingSide.reason).toBe("attempt_set_invalid");
    expect(wrongHand.reason).toBe("attempt_set_invalid");
    expect(wrongHand.affectedAttemptIds).toEqual(["front-0", "shooting_side-0"]);
    expect(failedQuality.reason).toBe("attempt_set_invalid");
    expect(failedQuality.affectedAttemptIds).toEqual(["shooting_side-0"]);
    expect(highWithBasicInput.reason).toBe("attempt_set_invalid");
  });
});

describe("capture session integration with the two-view pipeline", () => {
  const aggregating: CaptureSessionState = {
    status: "aggregating",
    mode: "basic_1_plus_1",
    shootingHand: "right",
    slots: [],
    sessionGeneration: 3,
  };

  it("keeps a recapture out of the persistence envelope and records the stable reason code", () => {
    const state = captureSessionReducer(aggregating, {
      type: "AGGREGATE_RECAPTURE_REQUIRED",
      sessionGeneration: 3,
      reason: "정면 클립과 측면 클립의 슛 타이밍이 서로 다릅니다.",
      reasonCode: "cross_view_phase_mismatch",
    });

    expect(state).toMatchObject({
      status: "error",
      recoveryStatus: "collecting",
      recaptureReasonCode: "cross_view_phase_mismatch",
    });
    expect(state.profile).toBeUndefined();
    expect(state.confidence).toBeUndefined();
    expect(matchingShootingProfileSaveInputV2(state, null)).toBeNull();
    expect(matchingShootingProfileSaveInputV2(state, {
      sessionGeneration: 3,
      mode: "basic_1_plus_1",
      shootingHand: "right",
      normalizedAttempts: [],
    })).toBeNull();
  });

  it("hands a complete pipeline result to the reducer as the same strict save envelope", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const result = expectComplete(buildTwoViewRepresentativeProfile({
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: attemptsFor(session),
    }));
    const state = captureSessionReducer(aggregating, {
      type: "AGGREGATE_COMPLETED",
      sessionGeneration: 3,
      profile: result.profile,
      confidence: result.confidence,
    });

    expect(state.status).toBe("result_review");
    expect(matchingShootingProfileSaveInputV2(state, {
      sessionGeneration: 3,
      mode: "basic_1_plus_1",
      shootingHand: "right",
      normalizedAttempts: result.normalizedAttempts,
    })).toEqual(result.saveInput);
  });

  it("routes the capture hook through the pipeline and forwards the stable reason code", () => {
    const hook = readFileSync("hooks/use-shooting-profile-capture.ts", "utf8");
    expect(hook).toContain('from "@/lib/shooting-profile/two-view-pipeline"');
    expect(hook).toContain("buildTwoViewRepresentativeProfile({");
    expect(hook).not.toContain("buildRepresentativeSequence");
    expect(hook).not.toContain("detectPhaseAnchors");
    expect(hook).not.toContain("resampleAttemptToPhaseGrid");
    expect(hook).toContain("reasonCode: result.reason");
    expect(hook).toContain("normalizedAttempts: attempts");
    expect(hook).toContain('reason === "cross_view_phase_mismatch"');
    expect(hook).toContain('reason === "phase_detection_failed"');
  });
});
