import { describe, expect, it } from "vitest";

import { parseRepresentativePose4D } from "@/lib/shooting-profile/codec";
import { angleBetweenDirections } from "@/lib/shooting-profile/direction-reconstruction";
import {
  ENGINEERING_THRESHOLDS_V1,
} from "@/lib/shooting-profile/engineering-thresholds";
import {
  KINEMATIC_TREE_V1,
  ReconstructionError,
  forwardKinematicsFrame,
  type BoneDirectionMapV1,
  type BoneLengthMapV1,
} from "@/lib/shooting-profile/kinematics";
import {
  buildRepresentativeSequence,
  type RepresentativeSequenceResultV1,
} from "@/lib/shooting-profile/representative-sequence";
import { PERSISTED_JOINT_NAMES_V2 } from "@/lib/shooting-profile/types";
import {
  syntheticDualViewSession,
  syntheticTruthDirectionsAtPhase,
  type SyntheticDualViewSession,
} from "@/tests/fixtures/synthetic-dual-view";

type Point3 = { x: number; y: number; z: number };

const CANONICAL_TEMPLATE_LENGTHS: BoneLengthMapV1 = {
  pelvis_to_left_hip: 0.34,
  pelvis_to_right_hip: 0.34,
  left_torso: 1.10,
  right_torso: 1.10,
  left_upper_arm: 0.72,
  left_forearm: 0.60,
  right_upper_arm: 0.72,
  right_forearm: 0.60,
  left_thigh: 1.05,
  left_shin: 1.02,
  right_thigh: 1.05,
  right_shin: 1.02,
};

function distance(a: Point3, b: Point3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function direction(a: Point3, b: Point3): Point3 {
  const length = distance(a, b);
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length, z: (b.z - a.z) / length };
}

function maxTemplateBoneLengthError(
  frames: readonly { joints: Record<string, Point3> }[],
): number {
  let maximum = 0;
  for (const frame of frames) {
    for (const bone of KINEMATIC_TREE_V1) {
      const parent = bone.parent === "pelvis" ? { x: 0, y: 0, z: 0 } : frame.joints[bone.parent];
      maximum = Math.max(
        maximum,
        Math.abs(distance(parent, frame.joints[bone.child])
          - CANONICAL_TEMPLATE_LENGTHS[bone.id]),
      );
    }
  }
  return maximum;
}

function withProjectedBoneDirections(
  session: SyntheticDualViewSession,
  startFrameIndex: number,
  directions: readonly Point3[],
  proximalLandmarkIndex = 13,
  distalLandmarkIndex = 15,
): SyntheticDualViewSession {
  const mutate = (
    attempts: SyntheticDualViewSession["frontAttempts"],
    view: "front" | "shooting_side",
  ) => attempts.map((attempt) => ({
    ...attempt,
    frames: attempt.frames.map((frame, frameIndex) => {
      const desired = directions[frameIndex - startFrameIndex];
      if (!desired) return frame;
      const proximal = frame.sourceLandmarks[proximalLandmarkIndex];
      const horizontal = view === "front" ? desired.x : desired.z;
      const replacement = {
        ...frame.sourceLandmarks[distalLandmarkIndex],
        x: proximal.x + horizontal * 0.06,
        y: proximal.y - desired.y * 0.06,
      };
      return {
        ...frame,
        sourceLandmarks: frame.sourceLandmarks.map((point, landmarkIndex) => (
          landmarkIndex === distalLandmarkIndex ? replacement : point
        )),
      };
    }),
  }));
  return {
    ...session,
    frontAttempts: mutate(session.frontAttempts, "front"),
    shootingSideAttempts: mutate(session.shootingSideAttempts, "shooting_side"),
  };
}

function withLandmarkVisibility(
  session: SyntheticDualViewSession,
  landmarkIndices: readonly number[],
  visibility: number,
  onlyFrameIndex?: number,
): SyntheticDualViewSession {
  const selected = new Set(landmarkIndices);
  const mutate = (attempts: SyntheticDualViewSession["frontAttempts"]) => attempts.map((attempt) => ({
    ...attempt,
    frames: attempt.frames.map((frame, frameIndex) => (
      onlyFrameIndex !== undefined && frameIndex !== onlyFrameIndex
        ? frame
        : {
          ...frame,
          sourceLandmarks: frame.sourceLandmarks.map((point, landmarkIndex) => (
            selected.has(landmarkIndex) ? { ...point, visibility } : point
          )),
        }
    )),
  }));
  return {
    ...session,
    frontAttempts: mutate(session.frontAttempts),
    shootingSideAttempts: mutate(session.shootingSideAttempts),
  };
}

function withProjectedVerticalReliabilities(
  session: SyntheticDualViewSession,
  frameIndex: number,
  reliabilities: { front: number; shooting_side: number },
  proximalLandmarkIndex = 13,
  distalLandmarkIndex = 15,
): SyntheticDualViewSession {
  const mutate = (
    attempts: SyntheticDualViewSession["frontAttempts"],
    view: "front" | "shooting_side",
  ) => attempts.map((attempt) => ({
    ...attempt,
    frames: attempt.frames.map((frame, index) => {
      if (index !== frameIndex) return frame;
      const proximal = frame.sourceLandmarks[proximalLandmarkIndex];
      const distal = frame.sourceLandmarks[distalLandmarkIndex];
      const horizontal = distal.x - proximal.x;
      const reliability = reliabilities[view];
      const verticalMagnitude = Math.abs(horizontal) * Math.abs(reliability)
        / Math.sqrt(1 - reliability * reliability);
      const vertical = Math.sign(reliability) * verticalMagnitude;
      return {
        ...frame,
        sourceLandmarks: frame.sourceLandmarks.map((point, landmarkIndex) => (
          landmarkIndex === distalLandmarkIndex
            ? { ...point, x: proximal.x + horizontal, y: proximal.y - vertical }
            : point
        )),
      };
    }),
  }));
  return {
    ...session,
    frontAttempts: mutate(session.frontAttempts, "front"),
    shootingSideAttempts: mutate(session.shootingSideAttempts, "shooting_side"),
  };
}

function expectRecaptureWithoutTrajectory(result: RepresentativeSequenceResultV1): void {
  expect(result.status).toBe("recapture_required");
  if (result.status !== "recapture_required") return;
  expect(result.affectedBones).toBeDefined();
  expect("profile" in result).toBe(false);
  expect("frames" in result).toBe(false);
  expect("confidence" in result).toBe(false);
  expect(JSON.stringify(result)).not.toContain("joints");
}

function cloneWithInputZ(session: SyntheticDualViewSession, z: number): SyntheticDualViewSession {
  const mutateAttempts = (attempts: SyntheticDualViewSession["frontAttempts"]) => attempts.map((attempt) => ({
    ...attempt,
    frames: attempt.frames.map((frame) => ({
      ...frame,
      sourceLandmarks: frame.sourceLandmarks.map((point) => ({ ...point, z })),
    })),
  }));
  return {
    ...session,
    frontAttempts: mutateAttempts(session.frontAttempts),
    shootingSideAttempts: mutateAttempts(session.shootingSideAttempts),
  };
}

function replaceLandmark(
  session: SyntheticDualViewSession,
  view: "frontAttempts" | "shootingSideAttempts",
  frameIndex: number,
  landmarkIndex: number,
  replacementIndex: number,
): SyntheticDualViewSession {
  return {
    ...session,
    [view]: session[view].map((attempt) => ({
      ...attempt,
      frames: attempt.frames.map((frame, index) => index === frameIndex ? {
        ...frame,
        sourceLandmarks: frame.sourceLandmarks.map((point, pointIndex, points) => (
          pointIndex === landmarkIndex ? { ...points[replacementIndex] } : point
        )),
      } : frame),
    })),
  };
}

describe("forwardKinematicsFrame", () => {
  it("normalizes directions and guarantees finite fixed template lengths", () => {
    const directions = Object.fromEntries(KINEMATIC_TREE_V1.map((bone, index) => [
      bone.id,
      { x: index + 1, y: index % 2 === 0 ? 2 : -2, z: 0.5 },
    ])) as BoneDirectionMapV1;

    const joints = forwardKinematicsFrame(
      directions,
      ENGINEERING_THRESHOLDS_V1.templateBoneLengths,
    );

    expect(Object.keys(joints).sort()).toEqual([...PERSISTED_JOINT_NAMES_V2].sort());
    expect(Object.values(joints).flatMap((point) => [point.x, point.y, point.z]).every(Number.isFinite)).toBe(true);
    expect(maxTemplateBoneLengthError([{ joints }])).toBeLessThan(1e-12);
  });

  it.each([
    ["missing direction", undefined, "missing_critical_bone"],
    ["non-finite direction", { x: Number.NaN, y: 1, z: 0 }, "non_finite_direction"],
    ["zero direction", { x: 0, y: 0, z: 0 }, "zero_direction"],
  ] as const)("throws a stable ReconstructionError for a %s", (_label, replacement, reason) => {
    const directions = Object.fromEntries(KINEMATIC_TREE_V1.map((bone) => [
      bone.id,
      { x: 0.3, y: 0.8, z: 0.4 },
    ])) as BoneDirectionMapV1;
    directions[KINEMATIC_TREE_V1[0].id] = replacement as Point3;

    expect(() => forwardKinematicsFrame(
      directions,
      ENGINEERING_THRESHOLDS_V1.templateBoneLengths,
    )).toThrowError(expect.objectContaining<Partial<ReconstructionError>>({ reason }));
  });

  it.each([
    ["missing length", undefined, "missing_critical_bone"],
    ["non-finite length", Number.POSITIVE_INFINITY, "non_finite_length"],
    ["zero length", 0, "invalid_length"],
  ] as const)("throws a stable ReconstructionError for a %s", (_label, replacement, reason) => {
    const directions = Object.fromEntries(KINEMATIC_TREE_V1.map((bone) => [
      bone.id,
      { x: 0.3, y: 0.8, z: 0.4 },
    ])) as BoneDirectionMapV1;
    const lengths: BoneLengthMapV1 = { ...ENGINEERING_THRESHOLDS_V1.templateBoneLengths };
    lengths[KINEMATIC_TREE_V1[0].id] = replacement as number;

    expect(() => forwardKinematicsFrame(directions, lengths)).toThrowError(
      expect.objectContaining<Partial<ReconstructionError>>({ reason }),
    );
  });

  it.each(KINEMATIC_TREE_V1.map((bone) => [bone.id, CANONICAL_TEMPLATE_LENGTHS[bone.id]] as const))(
    "rejects a finite noncanonical %s template length",
    (boneId, canonicalLength) => {
      const directions = Object.fromEntries(KINEMATIC_TREE_V1.map((bone) => [
        bone.id,
        { x: 0.3, y: 0.8, z: 0.4 },
      ])) as BoneDirectionMapV1;
      const lengths: BoneLengthMapV1 = { ...CANONICAL_TEMPLATE_LENGTHS };
      lengths[boneId] = canonicalLength + 0.00002;

      expect(() => forwardKinematicsFrame(directions, lengths)).toThrowError(
        expect.objectContaining<Partial<ReconstructionError>>({
          reason: "bone_length_violation",
          boneId,
        }),
      );
    },
  );

  it("accepts an input within tolerance but still emits canonical lengths", () => {
    const directions = Object.fromEntries(KINEMATIC_TREE_V1.map((bone) => [
      bone.id,
      { x: 0.3, y: 0.8, z: 0.4 },
    ])) as BoneDirectionMapV1;
    const lengths: BoneLengthMapV1 = { ...CANONICAL_TEMPLATE_LENGTHS };
    lengths.left_forearm += 0.000005;

    const joints = forwardKinematicsFrame(directions, lengths);

    expect(distance(joints.leftElbow, joints.leftWrist)).toBeCloseTo(0.60, 12);
  });
});

describe("buildRepresentativeSequence", () => {
  it("builds the strict 101-frame golden profile from one stable 2-of-3 subset per view", () => {
    const result = buildRepresentativeSequence(syntheticDualViewSession({
      mode: "high_accuracy_3_plus_3",
      corruptTake: true,
    }));

    expect(result.status, JSON.stringify(result)).toBe("complete");
    if (result.status !== "complete") return;
    expect(result.selectedAttemptsByView).toEqual({
      front: ["front-0", "front-1"],
      shooting_side: ["shooting_side-1", "shooting_side-2"],
    });
    expect(Object.isFrozen(result.selectedAttemptsByView)).toBe(true);
    expect(Object.isFrozen(result.selectedAttemptsByView.front)).toBe(true);
    expect(Object.isFrozen(result.selectedAttemptsByView.shooting_side)).toBe(true);
    expect(result.profile.frames).toHaveLength(101);
    expect(result.profile.frames.map((frame) => frame.phase)).toEqual(
      Array.from({ length: 101 }, (_, index) => index / 100),
    );
    expect(result.profile).toMatchObject({
      schemaVersion: 2,
      boundary: "representative_phase_fused_4d_estimate_not_actual_3d",
      mode: "high_accuracy_3_plus_3",
      timeBasis: "normalized_shot_phase",
      units: "template_shoulder_breadths",
      phaseAnchors: [
        { id: "ready", phase: 0 },
        { id: "deepestDip", phase: 0.25 },
        { id: "rise", phase: 0.5 },
        { id: "releaseProxy", phase: 0.75 },
        { id: "followThrough", phase: 1 },
      ],
      quality: { passed: true, reasons: [] },
    });
    expect(parseRepresentativePose4D(result.profile)).toEqual(result.profile);
    expect(result.profile.frames.every((frame) => (
      Object.keys(frame.joints).sort().join("|") === [...PERSISTED_JOINT_NAMES_V2].sort().join("|")
      && Object.values(frame.joints).flatMap((point) => [point.x, point.y, point.z]).every(Number.isFinite)
      && Object.values(frame.uncertainty).every((uncertainty) => (
        uncertainty.model === "heuristic_v1"
        && uncertainty.covariance.every(Number.isFinite)
        && Number.isFinite(uncertainty.directionalConeDegrees)
      ))
    ))).toBe(true);
    expect(maxTemplateBoneLengthError(result.profile.frames)).toBeLessThan(1e-5);
    let maximumAngularError = 0;
    result.profile.frames.forEach((frame, frameIndex) => {
      const truth = syntheticTruthDirectionsAtPhase(frameIndex / 100);
      KINEMATIC_TREE_V1.forEach((bone) => {
        const parent = bone.parent === "pelvis" ? { x: 0, y: 0, z: 0 } : frame.joints[bone.parent];
        maximumAngularError = Math.max(
          maximumAngularError,
          angleBetweenDirections(direction(parent, frame.joints[bone.child]), truth[bone.id]),
        );
      });
    });
    expect(maximumAngularError).toBeLessThan(0.08);
    expect(result.confidence).toBeGreaterThan(ENGINEERING_THRESHOLDS_V1.basicConfidenceCap);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("excludes one phase-40 corrupted take using one deterministic all-phase subset per view", () => {
    const result = buildRepresentativeSequence(syntheticDualViewSession({
      mode: "high_accuracy_3_plus_3",
      phaseSpikeAtPhaseIndex: 40,
      phaseSpikeRadiansByTake: {
        front: [0, 0, 0.50],
        shooting_side: [0, 0, 0.50],
      },
    }));

    expect(result.status, JSON.stringify(result)).toBe("complete");
    if (result.status !== "complete") return;
    expect(result.selectedAttemptsByView).toEqual({
      front: ["front-0", "front-1"],
      shooting_side: ["shooting_side-0", "shooting_side-1"],
    });
    expect(result.profile.frames).toHaveLength(101);
  });

  it("recaptures without a partial profile when phase-40 corruptions leave no complete pair", () => {
    const result = buildRepresentativeSequence(syntheticDualViewSession({
      mode: "high_accuracy_3_plus_3",
      phaseSpikeAtPhaseIndex: 40,
      phaseSpikeRadiansByTake: {
        front: [0, 0.30, 0.60],
        shooting_side: [0, 0.30, 0.60],
      },
    }));

    expectRecaptureWithoutTrajectory(result);
    expect(result).toMatchObject({ reason: "no_complete_agreeing_subset" });
  });

  it("raises heuristic uncertainty and lowers confidence when an accepted third take is more dispersed", () => {
    const tight = buildRepresentativeSequence(syntheticDualViewSession({
      mode: "high_accuracy_3_plus_3",
      thirdTakeRotationRadians: 0.03,
    }));
    const dispersed = buildRepresentativeSequence(syntheticDualViewSession({
      mode: "high_accuracy_3_plus_3",
      thirdTakeRotationRadians: 0.045,
    }));

    expect(tight.status, JSON.stringify(tight)).toBe("complete");
    expect(dispersed.status, JSON.stringify(dispersed)).toBe("complete");
    if (tight.status !== "complete" || dispersed.status !== "complete") return;
    expect(tight.selectedAttemptsByView.front).toHaveLength(3);
    expect(dispersed.selectedAttemptsByView.front).toHaveLength(3);
    expect(dispersed.confidence).toBeLessThan(tight.confidence);
    expect(dispersed.profile.frames[50].uncertainty.leftWrist.directionalConeDegrees).toBeGreaterThan(
      tight.profile.frames[50].uncertainty.leftWrist.directionalConeDegrees,
    );
    expect(dispersed.profile.frames[50].uncertainty.leftWrist.covariance[0]).toBeGreaterThan(
      tight.profile.frames[50].uncertainty.leftWrist.covariance[0],
    );
  });

  it("caps Basic single-take confidence at 0.65", () => {
    const result = buildRepresentativeSequence(syntheticDualViewSession({ mode: "basic_1_plus_1" }));

    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    expect(result.profile.mode).toBe("basic_1_plus_1");
    expect(result.confidence).toBeLessThanOrEqual(0.65);
    expect(result.confidence).toBeLessThanOrEqual(ENGINEERING_THRESHOLDS_V1.basicConfidenceCap);
    expect(result.selectedAttemptsByView).toEqual({
      front: ["front-0"],
      shooting_side: ["shooting_side-0"],
    });
  });

  it("keeps root motion explicitly unavailable and rejects unsupported reconstruction requests", () => {
    const session = syntheticDualViewSession({ mode: "basic_1_plus_1" });
    const implicit = buildRepresentativeSequence(session);
    const explicit = buildRepresentativeSequence({ ...session, rootMotion: { status: "unavailable" } });
    const unsupported = buildRepresentativeSequence({
      ...session,
      rootMotion: { signal: "pelvis_center_2d_v1" },
    });

    expect(implicit.status).toBe("complete");
    expect(explicit.status).toBe("complete");
    if (implicit.status !== "complete" || explicit.status !== "complete") return;
    for (const result of [implicit, explicit]) {
      expect(result.rootMotion).toEqual({ status: "unavailable" });
      expect(result.profile.frames.every((frame) => !("root" in frame))).toBe(true);
      expect(parseRepresentativePose4D(result.profile)).toEqual(result.profile);
    }
    expectRecaptureWithoutTrajectory(unsupported);
    expect(unsupported).toMatchObject({ reason: "invalid_root_motion_signal" });
  });

  it("never lets image-relative input z influence reconstructed output", () => {
    const baseSession = syntheticDualViewSession({ mode: "basic_1_plus_1" });
    const negativeZ = buildRepresentativeSequence(cloneWithInputZ(baseSession, -999));
    const positiveZ = buildRepresentativeSequence(cloneWithInputZ(baseSession, 999));

    expect(negativeZ).toEqual(positiveZ);
  });

  it("applies left/right shooting-side conventions by mirroring depth only", () => {
    const right = buildRepresentativeSequence(syntheticDualViewSession({
      mode: "basic_1_plus_1",
      shootingHand: "right",
    }));
    const left = buildRepresentativeSequence(syntheticDualViewSession({
      mode: "basic_1_plus_1",
      shootingHand: "left",
    }));

    expect(right.status).toBe("complete");
    expect(left.status).toBe("complete");
    if (right.status !== "complete" || left.status !== "complete") return;
    const rightUpperArm = direction(
      right.profile.frames[50].joints.rightShoulder,
      right.profile.frames[50].joints.rightElbow,
    );
    const leftConventionUpperArm = direction(
      left.profile.frames[50].joints.rightShoulder,
      left.profile.frames[50].joints.rightElbow,
    );
    expect(leftConventionUpperArm.x).toBeCloseTo(rightUpperArm.x, 10);
    expect(leftConventionUpperArm.y).toBeCloseTo(rightUpperArm.y, 10);
    expect(leftConventionUpperArm.z).toBeCloseTo(-rightUpperArm.z, 10);
  });

  it("smooths unit bone directions over phase and renormalizes before kinematics", () => {
    const result = buildRepresentativeSequence(syntheticDualViewSession({
      mode: "basic_1_plus_1",
      directionSpikeAtPhaseIndex: 51,
    }));

    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    const armDirections = result.profile.frames.slice(46, 57).map((frame) => direction(
      frame.joints.leftShoulder,
      frame.joints.leftElbow,
    ));
    const maximumAdjacentAngle = Math.max(...armDirections.slice(1).map((current, index) => (
      angleBetweenDirections(armDirections[index], current)
    )));
    expect(maximumAdjacentAngle).toBeLessThan(0.25);
    expect(maxTemplateBoneLengthError(result.profile.frames)).toBeLessThan(1e-5);
  });

  it.each([
    {
      label: "phase-boundary antipodal pair",
      startFrameIndex: 0,
      directions: [
        { x: Math.SQRT1_2, y: 0.5, z: 0.5 },
        { x: -Math.SQRT1_2, y: -0.5, z: -0.5 },
        { x: 0, y: 1, z: 0 },
      ],
    },
    {
      label: "phase-boundary near cancellation",
      startFrameIndex: 0,
      directions: [
        { x: Math.SQRT1_2, y: 0.5, z: 0.5 },
        { x: -Math.SQRT1_2, y: 0.5, z: -0.5 },
        { x: 0.02, y: -0.9998, z: 0 },
      ],
    },
    {
      label: "interior exact cancellation",
      startFrameIndex: 48,
      directions: [
        { x: Math.SQRT1_2, y: 0.5, z: 0.5 },
        { x: -Math.SQRT1_2, y: 0.5, z: -0.5 },
        { x: 0, y: -1, z: 0 },
        { x: 0.3, y: 0.8, z: 0.5196152422706632 },
        { x: -0.3, y: -0.8, z: -0.5196152422706632 },
      ],
    },
  ])("recaptures unstable $label smoothing with the affected bone", ({ startFrameIndex, directions }) => {
    const session = withProjectedBoneDirections(
      syntheticDualViewSession({ mode: "basic_1_plus_1" }),
      startFrameIndex,
      directions,
    );

    const result = buildRepresentativeSequence(session);

    expectRecaptureWithoutTrajectory(result);
    expect(result).toMatchObject({
      reason: "unstable_direction_smoothing",
      affectedBones: ["left_forearm"],
    });
  });

  it("runtime-validates the entire input boundary before dereferencing", () => {
    const valid = syntheticDualViewSession({ mode: "basic_1_plus_1" });
    const malformedInputs: unknown[] = [
      null,
      undefined,
      [],
      {},
      { ...valid, mode: "basic" },
      { ...valid, frontAttempts: null },
      { ...valid, shootingSideAttempts: {} },
      { ...valid, rootMotion: null },
      { ...valid, rootMotion: [] },
      { ...valid, rootMotion: {} },
      { ...valid, rootMotion: { status: "preserved" } },
    ];

    malformedInputs.forEach((input) => {
      let result: RepresentativeSequenceResultV1 | undefined;
      expect(() => {
        result = buildRepresentativeSequence(input);
      }).not.toThrow();
      expectRecaptureWithoutTrajectory(result as RepresentativeSequenceResultV1);
    });
  });

  it("propagates worst-case edge uncertainty through every kinematic ancestor", () => {
    const session = withLandmarkVisibility(
      syntheticDualViewSession({ mode: "basic_1_plus_1" }),
      [23, 24],
      0.70,
    );

    const result = buildRepresentativeSequence(session);

    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    const chains = [
      ["leftHip", "leftShoulder", "leftElbow", "leftWrist"],
      ["rightHip", "rightShoulder", "rightElbow", "rightWrist"],
      ["leftHip", "leftKnee", "leftAnkle"],
      ["rightHip", "rightKnee", "rightAnkle"],
    ] as const;
    result.profile.frames.forEach((frame) => {
      chains.forEach((chain) => {
        chain.slice(1).forEach((joint, index) => {
          expect(frame.uncertainty[joint].directionalConeDegrees).toBeGreaterThanOrEqual(
            frame.uncertainty[chain[index]].directionalConeDegrees,
          );
          expect(frame.uncertainty[joint].covariance[0]).toBeGreaterThanOrEqual(
            frame.uncertainty[chain[index]].covariance[0],
          );
        });
      });
    });
  });

  it("recaptures when any accepted direction exceeds the 25-degree uncertainty cone cap", () => {
    const frameIndex = 40;
    let session = withProjectedBoneDirections(
      syntheticDualViewSession({ mode: "basic_1_plus_1" }),
      frameIndex,
      [{ x: 0.12, y: 0.012, z: 1 }],
    );
    session = withLandmarkVisibility(session, [13, 15], 0.5, frameIndex);

    const result = buildRepresentativeSequence(session);

    expectRecaptureWithoutTrajectory(result);
    expect(result).toMatchObject({
      status: "recapture_required",
      reason: "uncertainty_exceeds_limit",
      affectedBones: expect.arrayContaining(["left_forearm"]),
    });
  });

  it("applies the 25-degree cone admission gate to the critical shoulder line", () => {
    const session = withLandmarkVisibility(
      syntheticDualViewSession({ mode: "basic_1_plus_1" }),
      [11, 12],
      0.5,
      40,
    );

    const result = buildRepresentativeSequence(session);

    expectRecaptureWithoutTrajectory(result);
    expect(result).toMatchObject({
      status: "recapture_required",
      reason: "uncertainty_exceeds_limit",
      affectedBones: expect.arrayContaining(["shoulder_line"]),
    });
  });

  it.each([
    { front: 0.140, shooting_side: -0.139 },
    { front: 0.139, shooting_side: -0.140 },
  ])("recaptures paired unreliable raw-sign disagreement $front/$shooting_side", (reliabilities) => {
    const session = withProjectedVerticalReliabilities(
      syntheticDualViewSession({ mode: "basic_1_plus_1" }),
      40,
      reliabilities,
    );

    const result = buildRepresentativeSequence(session);

    expectRecaptureWithoutTrajectory(result);
    expect(result).toMatchObject({
      status: "recapture_required",
      reason: "vertical_sign_disagreement",
      affectedBones: ["left_forearm"],
    });
  });

  it("never rewrites an observed unreliable vertical sign to force agreement", () => {
    const session = syntheticDualViewSession({ mode: "basic_1_plus_1" });
    const frameIndex = 40;
    const sideFrame = session.shootingSideAttempts[0].frames[frameIndex];
    const elbow = sideFrame.sourceLandmarks[13];
    const wrist = sideFrame.sourceLandmarks[15];
    const horizontal = wrist.x - elbow.x;
    const unreliableDisagreement: SyntheticDualViewSession = {
      ...session,
      shootingSideAttempts: session.shootingSideAttempts.map((attempt) => ({
        ...attempt,
        frames: attempt.frames.map((frame, index) => index === frameIndex ? {
          ...frame,
          sourceLandmarks: frame.sourceLandmarks.map((point, landmarkIndex) => (
            landmarkIndex === 15
              ? { ...point, x: elbow.x + horizontal, y: elbow.y + Math.abs(horizontal) * 0.05 }
              : point
          )),
        } : frame),
      })),
    };

    const result = buildRepresentativeSequence(unreliableDisagreement);

    expectRecaptureWithoutTrajectory(result);
    expect(result).toMatchObject({
      reason: "vertical_sign_disagreement",
      affectedBones: ["left_forearm"],
    });
  });

  it("returns recapture with no profile or frames for protocol, view, hand, consensus, and critical-bone failures", () => {
    const basic = syntheticDualViewSession({ mode: "basic_1_plus_1" });
    const wrongCount: SyntheticDualViewSession = {
      ...basic,
      mode: "high_accuracy_3_plus_3",
    };
    const wrongView: SyntheticDualViewSession = {
      ...basic,
      shootingSideAttempts: basic.shootingSideAttempts.map((attempt) => ({
        ...attempt,
        frames: attempt.frames.map((frame) => ({ ...frame, view: "front" as const })),
      })),
    };
    const wrongHand: SyntheticDualViewSession = {
      ...basic,
      shootingSideAttempts: basic.shootingSideAttempts.map((attempt) => ({
        ...attempt,
        frames: attempt.frames.map((frame) => ({ ...frame, shootingHand: "left" as const })),
      })),
    };
    const noConsensus = syntheticDualViewSession({
      mode: "high_accuracy_3_plus_3",
      noAgreeingSubset: true,
    });
    let collapsed = basic;
    for (let frameIndex = 0; frameIndex < 101; frameIndex += 1) {
      collapsed = replaceLandmark(collapsed, "frontAttempts", frameIndex, 15, 13);
      collapsed = replaceLandmark(collapsed, "shootingSideAttempts", frameIndex, 15, 13);
    }

    [wrongCount, wrongView, wrongHand, noConsensus, collapsed]
      .map(buildRepresentativeSequence)
      .forEach(expectRecaptureWithoutTrajectory);
  });

  it("returns the Task 3 vertical-sign rejection and affected bone without partial output", () => {
    const basic = syntheticDualViewSession({ mode: "basic_1_plus_1" });
    const frameIndex = 40;
    const sideFrame = basic.shootingSideAttempts[0].frames[frameIndex];
    const elbow = sideFrame.sourceLandmarks[13];
    const wrist = sideFrame.sourceLandmarks[15];
    const signMismatch: SyntheticDualViewSession = {
      ...basic,
      shootingSideAttempts: basic.shootingSideAttempts.map((attempt) => ({
        ...attempt,
        frames: attempt.frames.map((frame, index) => index === frameIndex ? {
          ...frame,
          sourceLandmarks: frame.sourceLandmarks.map((point, landmarkIndex) => (
            landmarkIndex === 15
              ? { ...wrist, y: elbow.y - (wrist.y - elbow.y) }
              : point
          )),
        } : frame),
      })),
    };

    const result = buildRepresentativeSequence(signMismatch);

    expectRecaptureWithoutTrajectory(result);
    expect(result).toMatchObject({
      status: "recapture_required",
      reason: "vertical_sign_disagreement",
      affectedBones: ["left_forearm"],
    });
  });
});
