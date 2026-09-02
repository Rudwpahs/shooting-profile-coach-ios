import { describe, expect, it } from "vitest";

import { angleBetweenDirections } from "@/lib/shooting-profile/direction-reconstruction";
import {
  detectPhaseAnchors,
  resampleAttemptToPhaseGrid,
  type ShotPhaseAnchorV2,
} from "@/lib/shooting-profile/phase-normalization";
import { buildRepresentativeSequence } from "@/lib/shooting-profile/representative-sequence";
import {
  syntheticLandmarkSequence,
  syntheticLandmarkSession,
  syntheticLandmarkTruthDirectionsAtPhase,
} from "@/tests/fixtures/synthetic-landmark-sequence";

const ANCHOR_IDS = ["ready", "deepestDip", "rise", "releaseProxy", "followThrough"] as const;

function normalizedAnchors(
  sequence: ReturnType<typeof syntheticLandmarkSequence>,
  anchors: readonly ShotPhaseAnchorV2[],
): number[] {
  const start = sequence.frames[0].timestampMs;
  const end = sequence.frames.at(-1)?.timestampMs ?? start;
  return anchors.map((anchor) => (anchor.timestampMs - start) / (end - start));
}

function normalizedAttempt(sequence: ReturnType<typeof syntheticLandmarkSequence>) {
  const phaseAnchors = detectPhaseAnchors(sequence);
  return {
    id: `${sequence.view}-${sequence.takeIndex}`,
    phaseAnchors,
    frames: resampleAttemptToPhaseGrid(sequence, phaseAnchors),
  };
}

describe("synthetic landmark sequence fixture", () => {
  it.each(["left", "right"] as const)("detects ordered phase anchors for every %s-handed take and view", (shootingHand) => {
    const session = syntheticLandmarkSession({ mode: "high_accuracy_3_plus_3", shootingHand });
    const allSequences = [...session.front, ...session.shootingSide];

    expect(allSequences).toHaveLength(6);
    allSequences.forEach((sequence) => {
      const anchors = detectPhaseAnchors(sequence);
      expect(anchors.map((anchor) => anchor.id)).toEqual(ANCHOR_IDS);
      expect(anchors.every((anchor, index) => (
        index === 0 || anchor.timestampMs > anchors[index - 1].timestampMs
      ))).toBe(true);
    });
  });

  it("keeps default front and side timing aligned after normalization", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const front = normalizedAnchors(session.front[0], detectPhaseAnchors(session.front[0]));
    const side = normalizedAnchors(
      session.shootingSide[0],
      detectPhaseAnchors(session.shootingSide[0]),
    );

    expect(Math.max(...front.map((value, index) => Math.abs(value - side[index])))).toBeLessThanOrEqual(0.05);
  });

  it.each([
    ["basic_1_plus_1", "left"],
    ["basic_1_plus_1", "right"],
    ["high_accuracy_3_plus_3", "left"],
    ["high_accuracy_3_plus_3", "right"],
  ] as const)("builds a complete %s %s-handed representative sequence", (mode, shootingHand) => {
    const session = syntheticLandmarkSession({ mode, shootingHand });
    const result = buildRepresentativeSequence({
      mode,
      frontAttempts: session.front.map(normalizedAttempt),
      shootingSideAttempts: session.shootingSide.map(normalizedAttempt),
      rootMotion: { status: "unavailable" },
    });

    expect(result.status, JSON.stringify(result)).toBe("complete");
  });

  it("exposes intentional cross-view intermediate-anchor timing disagreement", () => {
    const session = syntheticLandmarkSession({
      mode: "basic_1_plus_1",
      sideAnchorScheduleShift: 0.16,
    });
    const front = normalizedAnchors(session.front[0], detectPhaseAnchors(session.front[0]));
    const side = normalizedAnchors(
      session.shootingSide[0],
      detectPhaseAnchors(session.shootingSide[0]),
    );
    const intermediateDelta = Math.max(...front.slice(1, -1).map((value, index) => (
      Math.abs(value - side[index + 1])
    )));

    expect(intermediateDelta).toBeGreaterThan(0.10);
  });

  it("reconstructs the closed synthetic skeleton within ten degrees at key phases", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const result = buildRepresentativeSequence({
      mode: "basic_1_plus_1",
      frontAttempts: session.front.map(normalizedAttempt),
      shootingSideAttempts: session.shootingSide.map(normalizedAttempt),
      rootMotion: { status: "unavailable" },
    });

    expect(result.status, JSON.stringify(result)).toBe("complete");
    if (result.status !== "complete") return;

    const bones = {
      pelvis_to_left_hip: ["leftHip", undefined],
      pelvis_to_right_hip: ["rightHip", undefined],
      left_torso: ["leftShoulder", "leftHip"],
      right_torso: ["rightShoulder", "rightHip"],
      left_upper_arm: ["leftElbow", "leftShoulder"],
      left_forearm: ["leftWrist", "leftElbow"],
      right_upper_arm: ["rightElbow", "rightShoulder"],
      right_forearm: ["rightWrist", "rightElbow"],
      left_thigh: ["leftKnee", "leftHip"],
      left_shin: ["leftAnkle", "leftKnee"],
      right_thigh: ["rightKnee", "rightHip"],
      right_shin: ["rightAnkle", "rightKnee"],
    } as const;
    [0, 0.5, 1].forEach((phase) => {
      const frame = result.profile.frames[Math.round(phase * 100)];
      const truth = syntheticLandmarkTruthDirectionsAtPhase(phase);
      Object.entries(bones).forEach(([boneId, [distal, proximal]]) => {
        const distalJoint = frame.joints[distal];
        const proximalJoint = proximal === undefined ? { x: 0, y: 0, z: 0 } : frame.joints[proximal];
        expect(angleBetweenDirections({
          x: distalJoint.x - proximalJoint.x,
          y: distalJoint.y - proximalJoint.y,
          z: distalJoint.z - proximalJoint.z,
        }, truth[boneId as keyof typeof truth]) * 180 / Math.PI).toBeLessThan(10);
      });
    });
  });

  it("is deterministic", () => {
    expect(syntheticLandmarkSession({ mode: "high_accuracy_3_plus_3", shootingHand: "left" }))
      .toEqual(syntheticLandmarkSession({ mode: "high_accuracy_3_plus_3", shootingHand: "left" }));
  });
});
