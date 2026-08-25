import type { Vector3 } from "@/lib/pose-motion";
import { parseRepresentativePose4D } from "@/lib/shooting-profile/codec";
import {
  angleBetweenDirections,
  reconstructBoneDirection,
  type DirectionRejectionReason,
  type DirectionSign,
} from "@/lib/shooting-profile/direction-reconstruction";
import { ENGINEERING_THRESHOLDS_V1 } from "@/lib/shooting-profile/engineering-thresholds";
import {
  KINEMATIC_TREE_V1,
  ReconstructionError,
  forwardKinematicsFrame,
  type BoneDirectionMapV1,
  type KinematicBoneIdV1,
  type ReconstructionErrorReasonV1,
} from "@/lib/shooting-profile/kinematics";
import { PRODUCTION_PHASE_SAMPLE_COUNT } from "@/lib/shooting-profile/phase-normalization";
import {
  aggregateViewAttempts,
  CONSENSUS_V1,
  type AggregatedPhaseSampleFrameV1,
  type AggregatedProjectedBoneV1,
  type AggregatedViewAttemptsResult,
  type NormalizedViewAttemptV2,
} from "@/lib/shooting-profile/repeated-shot";
import {
  PERSISTED_JOINT_NAMES_V2,
  type CaptureProtocolV2,
  type JointUncertaintyV2,
  type PersistedJointMapV2,
  type PersistedJointNameV2,
  type RepresentativePose4DV2,
  type ShootingHandV2,
} from "@/lib/shooting-profile/types";
import {
  buildDeterministicUncertaintyScenarioPlan,
  perturbSourceObservation2D,
  sampleCovarianceWithIsotropicFloor,
  type DeterministicPerturbationPatternV1,
} from "@/lib/shooting-profile/uncertainty";

const CANONICAL_PHASE_ANCHORS = Object.freeze([
  Object.freeze({ id: "ready", phase: 0 }),
  Object.freeze({ id: "deepestDip", phase: 0.25 }),
  Object.freeze({ id: "rise", phase: 0.5 }),
  Object.freeze({ id: "releaseProxy", phase: 0.75 }),
  Object.freeze({ id: "followThrough", phase: 1 }),
]);

const OBSERVED_BONES_V1 = Object.freeze([
  { id: "shoulder_line", proximalLandmarkIndex: 11, distalLandmarkIndex: 12 },
  { id: "left_upper_arm", proximalLandmarkIndex: 11, distalLandmarkIndex: 13 },
  { id: "left_forearm", proximalLandmarkIndex: 13, distalLandmarkIndex: 15 },
  { id: "right_upper_arm", proximalLandmarkIndex: 12, distalLandmarkIndex: 14 },
  { id: "right_forearm", proximalLandmarkIndex: 14, distalLandmarkIndex: 16 },
  { id: "hip_line", proximalLandmarkIndex: 23, distalLandmarkIndex: 24 },
  { id: "left_torso", proximalLandmarkIndex: 23, distalLandmarkIndex: 11 },
  { id: "right_torso", proximalLandmarkIndex: 24, distalLandmarkIndex: 12 },
  { id: "left_thigh", proximalLandmarkIndex: 23, distalLandmarkIndex: 25 },
  { id: "left_shin", proximalLandmarkIndex: 25, distalLandmarkIndex: 27 },
  { id: "right_thigh", proximalLandmarkIndex: 24, distalLandmarkIndex: 26 },
  { id: "right_shin", proximalLandmarkIndex: 26, distalLandmarkIndex: 28 },
] as const);

type ObservedBoneIdV1 = (typeof OBSERVED_BONES_V1)[number]["id"];

type DirectionEvidenceV1 = {
  direction: Vector3;
  conditioning: number;
  availability: number;
  retainedSpreadRadians: number;
};

type DirectionEvidenceMapV1 = Record<ObservedBoneIdV1, DirectionEvidenceV1>;

export type RepresentativeSequenceInputV1 = {
  mode: CaptureProtocolV2;
  frontAttempts: readonly NormalizedViewAttemptV2[];
  shootingSideAttempts: readonly NormalizedViewAttemptV2[];
  rootMotion?: { status: "unavailable" };
};

export type SelectedAttemptsByViewV1 = Readonly<{
  front: readonly string[];
  shooting_side: readonly string[];
}>;

export type RootMotionStatusV1 = { status: "unavailable" };

export type RepresentativeSequenceRecaptureReasonV1 =
  | "protocol_mismatch"
  | "view_mismatch"
  | "shooting_hand_mismatch"
  | "no_complete_agreeing_subset"
  | "invalid_attempt"
  | "invalid_root_motion_signal"
  | "invalid_profile"
  | "uncertainty_exceeds_limit"
  | "perturbation_scenario_shortfall"
  | "inconsistent_skeleton_closure"
  | DirectionRejectionReason
  | ReconstructionErrorReasonV1;

export type RepresentativeSequenceResultV1 =
  | {
    status: "complete";
    profile: RepresentativePose4DV2;
    confidence: number;
    selectedAttemptsByView: SelectedAttemptsByViewV1;
    rootMotion: RootMotionStatusV1;
  }
  | {
    status: "recapture_required";
    reason: RepresentativeSequenceRecaptureReasonV1;
    affectedBones: readonly string[];
  };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function sign(value: number): DirectionSign | undefined {
  if (value === 0) return undefined;
  return value < 0 ? -1 : 1;
}

function reliableVerticalSign(vertical: number, projectionLength: number): DirectionSign | undefined {
  if (!Number.isFinite(projectionLength) || projectionLength <= 0) return undefined;
  if (Math.abs(vertical) / projectionLength < ENGINEERING_THRESHOLDS_V1.minimumVerticalSignReliability) {
    return undefined;
  }
  return sign(vertical);
}

function validProjectedEvidence(evidence: AggregatedProjectedBoneV1 | undefined): evidence is AggregatedProjectedBoneV1 {
  return evidence !== undefined
    && Number.isFinite(evidence.direction.x)
    && Number.isFinite(evidence.direction.y)
    && Number.isFinite(evidence.projectedLength)
    && evidence.projectedLength > 0
    && Number.isFinite(evidence.availability)
    && evidence.availability >= 0
    && evidence.availability <= 1
    && Number.isFinite(evidence.retainedSpreadRadians)
    && evidence.retainedSpreadRadians >= 0;
}

function reconstructObservedBone(
  frontFrame: AggregatedPhaseSampleFrameV1,
  sideFrame: AggregatedPhaseSampleFrameV1,
  bone: (typeof OBSERVED_BONES_V1)[number],
  shootingHand: ShootingHandV2,
): DirectionEvidenceV1 | { rejected: DirectionRejectionReason } {
  const front = frontFrame.bones[bone.id];
  const side = sideFrame.bones[bone.id];
  if (!validProjectedEvidence(front) || !validProjectedEvidence(side)) {
    return { rejected: "non_finite_input" };
  }
  const frontHorizontal = front.direction.x;
  const frontVertical = -front.direction.y;
  const sideHorizontal = side.direction.x;
  const sideVertical = -side.direction.y;
  const frontLength = front.projectedLength;
  const sideLength = side.projectedLength;
  const rawFrontVerticalSign = sign(frontVertical);
  const rawSideVerticalSign = sign(sideVertical);
  // Aggregated directions are unit vectors; reliability is their vertical
  // component ratio. Projected physical length remains separate solver input.
  const frontVerticalSign = reliableVerticalSign(frontVertical, 1);
  const sideVerticalSign = reliableVerticalSign(sideVertical, 1);
  if (frontVerticalSign !== undefined
    && sideVerticalSign !== undefined
    && frontVerticalSign !== sideVerticalSign) {
    const rejected = reconstructBoneDirection({
      alpha: Math.atan2(frontHorizontal, frontVertical),
      beta: Math.atan2(sideHorizontal, sideVertical),
      verticalSign: frontVerticalSign,
      sideAxisSign: shootingHand === "right" ? 1 : -1,
      frontVerticalSign,
      sideVerticalSign,
      frontProjectionLength: frontLength,
      sideProjectionLength: sideLength,
    });
    return rejected.status === "rejected"
      ? { rejected: rejected.reason }
      : { rejected: "vertical_sign_disagreement" };
  }
  if (frontVerticalSign === undefined
    && sideVerticalSign === undefined
    && rawFrontVerticalSign !== undefined
    && rawSideVerticalSign !== undefined
    && rawFrontVerticalSign !== rawSideVerticalSign) {
    return { rejected: "vertical_sign_disagreement" };
  }
  const frontReliability = Math.abs(frontVertical);
  const sideReliability = Math.abs(sideVertical);
  const verticalSign = frontVerticalSign
    ?? sideVerticalSign
    ?? (frontReliability >= sideReliability ? sign(frontVertical) : sign(sideVertical))
    ?? 1;
  const result = reconstructBoneDirection({
    alpha: Math.atan2(frontHorizontal, frontVertical),
    beta: Math.atan2(sideHorizontal, sideVertical),
    verticalSign,
    sideAxisSign: shootingHand === "right" ? 1 : -1,
    frontVerticalSign,
    sideVerticalSign,
    frontProjectionLength: frontLength,
    sideProjectionLength: sideLength,
  });
  if (result.status === "rejected") return { rejected: result.reason };
  return {
    direction: result.direction,
    conditioning: result.conditioning,
    availability: Math.min(front.availability, side.availability),
    retainedSpreadRadians: Math.max(front.retainedSpreadRadians, side.retainedSpreadRadians),
  };
}

function negate(vector: Vector3): Vector3 {
  return { x: -vector.x, y: -vector.y, z: -vector.z };
}

function toKinematicDirections(evidence: DirectionEvidenceMapV1): BoneDirectionMapV1 {
  return {
    pelvis_to_left_hip: negate(evidence.hip_line.direction),
    pelvis_to_right_hip: evidence.hip_line.direction,
    left_torso: evidence.left_torso.direction,
    right_torso: evidence.right_torso.direction,
    left_upper_arm: evidence.left_upper_arm.direction,
    left_forearm: evidence.left_forearm.direction,
    right_upper_arm: evidence.right_upper_arm.direction,
    right_forearm: evidence.right_forearm.direction,
    left_thigh: evidence.left_thigh.direction,
    left_shin: evidence.left_shin.direction,
    right_thigh: evidence.right_thigh.direction,
    right_shin: evidence.right_shin.direction,
  };
}

function normalizedVector(vector: Vector3): Vector3 | undefined {
  const magnitude = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(magnitude) || magnitude === 0) return undefined;
  return { x: vector.x / magnitude, y: vector.y / magnitude, z: vector.z / magnitude };
}

function smoothVectorSeries(
  directions: readonly Vector3[],
): Vector3[] | undefined {
  const radius = ENGINEERING_THRESHOLDS_V1.smoothingWindowRadius;
  const smoothed: Vector3[] = [];
  for (let frameIndex = 0; frameIndex < directions.length; frameIndex += 1) {
    const start = Math.max(0, frameIndex - radius);
    const end = Math.min(directions.length - 1, frameIndex + radius);
    const sum = { x: 0, y: 0, z: 0 };
    for (let index = start; index <= end; index += 1) {
      const direction = normalizedVector(directions[index]);
      if (!direction) return undefined;
      sum.x += direction.x;
      sum.y += direction.y;
      sum.z += direction.z;
    }
    const sampleCount = end - start + 1;
    const resultantStrength = Math.hypot(sum.x, sum.y, sum.z) / sampleCount;
    if (!Number.isFinite(resultantStrength)
      || resultantStrength < ENGINEERING_THRESHOLDS_V1.minimumSmoothingResultantStrength) {
      return undefined;
    }
    const direction = normalizedVector(sum);
    if (!direction) return undefined;
    smoothed.push(direction);
  }
  return smoothed;
}

function smoothDirectionSeries(
  directions: readonly Vector3[],
  boneId: KinematicBoneIdV1,
): Vector3[] {
  const smoothed = smoothVectorSeries(directions);
  if (!smoothed) throw new ReconstructionError("unstable_direction_smoothing", boneId);
  return smoothed;
}

function smoothDirections(
  frames: readonly BoneDirectionMapV1[],
): BoneDirectionMapV1[] {
  const series = Object.fromEntries(KINEMATIC_TREE_V1.map((bone) => [
    bone.id,
    smoothDirectionSeries(frames.map((frame) => frame[bone.id]), bone.id),
  ])) as Record<KinematicBoneIdV1, Vector3[]>;
  return frames.map((_, frameIndex) => Object.fromEntries(KINEMATIC_TREE_V1.map((bone) => [
    bone.id,
    series[bone.id][frameIndex],
  ])) as BoneDirectionMapV1);
}

type ObservedDirectionMapV1 = Record<ObservedBoneIdV1, Vector3>;

function smoothObservedDirections(
  frames: readonly DirectionEvidenceMapV1[],
): ObservedDirectionMapV1[] | undefined {
  const series = {} as Record<ObservedBoneIdV1, Vector3[]>;
  for (const bone of OBSERVED_BONES_V1) {
    const smoothed = smoothVectorSeries(frames.map((frame) => frame[bone.id].direction));
    if (!smoothed) return undefined;
    series[bone.id] = smoothed;
  }
  return frames.map((_, frameIndex) => Object.fromEntries(OBSERVED_BONES_V1.map((bone) => [
    bone.id,
    series[bone.id][frameIndex],
  ])) as ObservedDirectionMapV1);
}

function recapture(
  reason: RepresentativeSequenceRecaptureReasonV1,
  affectedBones: readonly string[] = [],
): RepresentativeSequenceResultV1 {
  return {
    status: "recapture_required",
    reason,
    affectedBones: Object.freeze([...affectedBones]),
  };
}

function acceptedAggregation(
  result: AggregatedViewAttemptsResult,
): result is Extract<AggregatedViewAttemptsResult, { status: "accepted" }> {
  return result.status === "accepted";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSequenceInput(
  value: unknown,
): RepresentativeSequenceInputV1 | RepresentativeSequenceResultV1 {
  if (!isRecord(value)) return recapture("invalid_attempt");
  if (value.mode !== "basic_1_plus_1" && value.mode !== "high_accuracy_3_plus_3") {
    return recapture("protocol_mismatch");
  }
  if (!Array.isArray(value.frontAttempts) || !Array.isArray(value.shootingSideAttempts)) {
    return recapture("invalid_attempt");
  }
  if (value.rootMotion !== undefined) {
    if (!isRecord(value.rootMotion)
      || value.rootMotion.status !== "unavailable"
      || Object.keys(value.rootMotion).length !== 1) {
      return recapture("invalid_root_motion_signal");
    }
  }
  return {
    mode: value.mode,
    frontAttempts: value.frontAttempts as NormalizedViewAttemptV2[],
    shootingSideAttempts: value.shootingSideAttempts as NormalizedViewAttemptV2[],
    ...(value.rootMotion === undefined ? {} : { rootMotion: { status: "unavailable" } }),
  };
}

function aggregateSessionViews(input: RepresentativeSequenceInputV1):
  | {
    front: Extract<AggregatedViewAttemptsResult, { status: "accepted" }>;
    side: Extract<AggregatedViewAttemptsResult, { status: "accepted" }>;
  }
  | RepresentativeSequenceResultV1 {
  const requiredCount = input.mode === "basic_1_plus_1" ? 1 : input.mode === "high_accuracy_3_plus_3" ? 3 : 0;
  if (requiredCount === 0
    || input.frontAttempts.length !== requiredCount
    || input.shootingSideAttempts.length !== requiredCount) {
    return recapture("protocol_mismatch");
  }
  let front: AggregatedViewAttemptsResult;
  let side: AggregatedViewAttemptsResult;
  try {
    front = aggregateViewAttempts(input.frontAttempts, CONSENSUS_V1);
    side = aggregateViewAttempts(input.shootingSideAttempts, CONSENSUS_V1);
  } catch {
    return recapture("invalid_attempt", OBSERVED_BONES_V1.map((bone) => bone.id));
  }
  if (!acceptedAggregation(front) || !acceptedAggregation(side)) {
    return recapture("no_complete_agreeing_subset", OBSERVED_BONES_V1.map((bone) => bone.id));
  }
  if (front.view !== "front" || side.view !== "shooting_side") {
    return recapture("view_mismatch");
  }
  if (front.shootingHand !== side.shootingHand) {
    return recapture("shooting_hand_mismatch");
  }
  return { front, side };
}

function selectedAttempts(
  attempts: readonly NormalizedViewAttemptV2[],
  selectedIds: readonly string[],
): NormalizedViewAttemptV2[] {
  const selected = new Set(selectedIds);
  return [...attempts]
    .filter((attempt) => selected.has(attempt.id))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function normalizedAnchorPositions(attempt: NormalizedViewAttemptV2): number[] {
  const first = attempt.phaseAnchors[0].timestampMs;
  const last = attempt.phaseAnchors[attempt.phaseAnchors.length - 1].timestampMs;
  const duration = last - first;
  return attempt.phaseAnchors.map((anchor) => (anchor.timestampMs - first) / duration);
}

function maximumRetainedAnchorDispersion(
  attemptsByView: readonly (readonly NormalizedViewAttemptV2[])[],
): number {
  let maximum = 0;
  attemptsByView.forEach((attempts) => {
    const positions = attempts.map(normalizedAnchorPositions);
    for (let first = 0; first < positions.length - 1; first += 1) {
      for (let second = first + 1; second < positions.length; second += 1) {
        positions[first].forEach((position, anchorIndex) => {
          maximum = Math.max(maximum, Math.abs(position - positions[second][anchorIndex]));
        });
      }
    }
  });
  return maximum;
}

function phaseIndexRadiusFor(
  frontAttempts: readonly NormalizedViewAttemptV2[],
  sideAttempts: readonly NormalizedViewAttemptV2[],
): number {
  const config = ENGINEERING_THRESHOLDS_V1.uncertaintyPerturbation;
  const dispersion = maximumRetainedAnchorDispersion([frontAttempts, sideAttempts]);
  return clamp(
    config.minimumPhaseIndexRadius
      + Math.ceil(dispersion * config.anchorDispersionPhaseIndexGain),
    config.minimumPhaseIndexRadius,
    config.maximumPhaseIndexRadius,
  );
}

type ProjectedScenarioFrameResultV1 =
  | { status: "accepted"; frame: AggregatedPhaseSampleFrameV1 }
  | { status: "rejected"; boneId: ObservedBoneIdV1 };

function projectedScenarioFrame(
  attempt: NormalizedViewAttemptV2,
  sourceFrameIndex: number,
  outputFrameIndex: number,
  pattern: DeterministicPerturbationPatternV1,
): ProjectedScenarioFrameResultV1 {
  const frame = attempt.frames[sourceFrameIndex];
  const bones = {} as Record<ObservedBoneIdV1, AggregatedProjectedBoneV1>;
  for (const bone of OBSERVED_BONES_V1) {
    const proximal = frame.sourceLandmarks[bone.proximalLandmarkIndex];
    const distal = frame.sourceLandmarks[bone.distalLandmarkIndex];
    const originalLength = Math.hypot(distal.x - proximal.x, distal.y - proximal.y);
    const perturbedProximal = perturbSourceObservation2D(
      proximal,
      bone.proximalLandmarkIndex,
      frame.view,
      pattern,
    );
    const perturbedDistal = perturbSourceObservation2D(
      distal,
      bone.distalLandmarkIndex,
      frame.view,
      pattern,
    );
    const config = ENGINEERING_THRESHOLDS_V1.uncertaintyPerturbation;
    if (
      !Number.isFinite(originalLength)
      || !perturbedProximal
      || !perturbedDistal
      || Math.max(perturbedProximal.offsetMagnitude, perturbedDistal.offsetMagnitude)
        > originalLength * config.maximumLandmarkOffsetFractionOfProjectedBone
    ) {
      return { status: "rejected", boneId: bone.id };
    }
    const x = perturbedDistal.point.x - perturbedProximal.point.x;
    const y = perturbedDistal.point.y - perturbedProximal.point.y;
    const projectedLength = Math.hypot(x, y);
    const availability = Math.min(
      perturbedProximal.point.visibility ?? 0,
      perturbedDistal.point.visibility ?? 0,
    );
    if (
      !Number.isFinite(projectedLength)
      || projectedLength < CONSENSUS_V1.minimumProjectedBoneLength
      || !Number.isFinite(availability)
    ) {
      return { status: "rejected", boneId: bone.id };
    }
    bones[bone.id] = Object.freeze({
      direction: Object.freeze({ x: x / projectedLength, y: y / projectedLength }),
      projectedLength,
      availability,
      angularMadRadians: 0,
      retainedSpreadRadians: 0,
      medoidAttemptId: attempt.id,
      supportAttemptIds: Object.freeze([attempt.id]),
    });
  }
  return {
    status: "accepted",
    frame: Object.freeze({
      phase: outputFrameIndex / (PRODUCTION_PHASE_SAMPLE_COUNT - 1),
      view: frame.view,
      shootingHand: frame.shootingHand,
      bones: Object.freeze(bones),
    }),
  };
}

function shoulderClosureIsValid(
  jointsByFrame: readonly PersistedJointMapV2[],
  observedDirectionsByFrame: readonly ObservedDirectionMapV1[],
): boolean {
  const config = ENGINEERING_THRESHOLDS_V1.shoulderClosure;
  if (jointsByFrame.length !== observedDirectionsByFrame.length) return false;
  return jointsByFrame.every((joints, frameIndex) => {
    const implied = {
      x: joints.rightShoulder.x - joints.leftShoulder.x,
      y: joints.rightShoulder.y - joints.leftShoulder.y,
      z: joints.rightShoulder.z - joints.leftShoulder.z,
    };
    const length = Math.hypot(implied.x, implied.y, implied.z);
    const normalizedLengthResidual = Math.abs(length - config.templateShoulderBreadth)
      / config.templateShoulderBreadth;
    let angularResidual: number;
    try {
      angularResidual = angleBetweenDirections(
        implied,
        observedDirectionsByFrame[frameIndex].shoulder_line,
      );
    } catch {
      return false;
    }
    return Number.isFinite(length)
      && Number.isFinite(normalizedLengthResidual)
      && Number.isFinite(angularResidual)
      && normalizedLengthResidual <= config.maximumNormalizedLengthResidual
      && angularResidual <= config.maximumAngularResidualRadians;
  });
}

type AcceptedScenarioTrajectoryV1 = Readonly<{
  jointsByFrame: readonly PersistedJointMapV2[];
  observedDirectionsByFrame: readonly ObservedDirectionMapV1[];
}>;

type ScenarioTrajectoryResultV1 =
  | { status: "accepted"; trajectory: AcceptedScenarioTrajectoryV1 }
  | { status: "rejected"; affectedBone: string }
  | { status: "closure_rejected" };

function reconstructScenarioTrajectory(
  frontAttempt: NormalizedViewAttemptV2,
  sideAttempt: NormalizedViewAttemptV2,
  frontPhaseIndexShift: number,
  shootingSidePhaseIndexShift: number,
  pattern: DeterministicPerturbationPatternV1,
  shootingHand: ShootingHandV2,
): ScenarioTrajectoryResultV1 {
  const evidenceFrames: DirectionEvidenceMapV1[] = [];
  const rawDirections: BoneDirectionMapV1[] = [];
  for (let outputFrameIndex = 0;
    outputFrameIndex < PRODUCTION_PHASE_SAMPLE_COUNT;
    outputFrameIndex += 1) {
    const frontSourceFrameIndex = clamp(
      outputFrameIndex + frontPhaseIndexShift,
      0,
      PRODUCTION_PHASE_SAMPLE_COUNT - 1,
    );
    const sideSourceFrameIndex = clamp(
      outputFrameIndex + shootingSidePhaseIndexShift,
      0,
      PRODUCTION_PHASE_SAMPLE_COUNT - 1,
    );
    const front = projectedScenarioFrame(
      frontAttempt,
      frontSourceFrameIndex,
      outputFrameIndex,
      pattern,
    );
    if (front.status === "rejected") return { status: "rejected", affectedBone: front.boneId };
    const side = projectedScenarioFrame(
      sideAttempt,
      sideSourceFrameIndex,
      outputFrameIndex,
      pattern,
    );
    if (side.status === "rejected") return { status: "rejected", affectedBone: side.boneId };
    const evidence = {} as DirectionEvidenceMapV1;
    for (const bone of OBSERVED_BONES_V1) {
      const reconstructed = reconstructObservedBone(front.frame, side.frame, bone, shootingHand);
      if ("rejected" in reconstructed) return { status: "rejected", affectedBone: bone.id };
      evidence[bone.id] = reconstructed;
    }
    evidenceFrames.push(evidence);
    rawDirections.push(toKinematicDirections(evidence));
  }
  try {
    const directionsByFrame = smoothDirections(rawDirections);
    const observedDirectionsByFrame = smoothObservedDirections(evidenceFrames);
    if (!observedDirectionsByFrame) return { status: "rejected", affectedBone: "shoulder_line" };
    const jointsByFrame = directionsByFrame.map((directions) => forwardKinematicsFrame(
      directions,
      ENGINEERING_THRESHOLDS_V1.templateBoneLengths,
    ));
    if (!shoulderClosureIsValid(jointsByFrame, observedDirectionsByFrame)) {
      return { status: "closure_rejected" };
    }
    return {
      status: "accepted",
      trajectory: Object.freeze({
        jointsByFrame: Object.freeze(jointsByFrame),
        observedDirectionsByFrame: Object.freeze(observedDirectionsByFrame),
      }),
    };
  } catch (error) {
    return {
      status: "rejected",
      affectedBone: error instanceof ReconstructionError && error.boneId
        ? error.boneId
        : "missing_critical_bone",
    };
  }
}

function coordinateRoughnessSquaredByBone(
  attemptsByView: readonly (readonly NormalizedViewAttemptV2[])[],
): Record<ObservedBoneIdV1, number> {
  return Object.fromEntries(OBSERVED_BONES_V1.map((bone) => {
    let squaredSum = 0;
    let sampleCount = 0;
    attemptsByView.forEach((attempts) => attempts.forEach((attempt) => {
      [bone.proximalLandmarkIndex, bone.distalLandmarkIndex].forEach((landmarkIndex) => {
        for (let frameIndex = 1;
          frameIndex < PRODUCTION_PHASE_SAMPLE_COUNT - 1;
          frameIndex += 1) {
          const previous = attempt.frames[frameIndex - 1].sourceLandmarks[landmarkIndex];
          const current = attempt.frames[frameIndex].sourceLandmarks[landmarkIndex];
          const next = attempt.frames[frameIndex + 1].sourceLandmarks[landmarkIndex];
          const secondDifferenceX = previous.x - 2 * current.x + next.x;
          const secondDifferenceY = previous.y - 2 * current.y + next.y;
          squaredSum += secondDifferenceX ** 2 + secondDifferenceY ** 2;
          sampleCount += 1;
        }
      });
    }));
    return [bone.id, sampleCount === 0 ? 0 : squaredSum / sampleCount];
  })) as Record<ObservedBoneIdV1, number>;
}

const JOINT_EVIDENCE_PATH: Record<PersistedJointNameV2, readonly ObservedBoneIdV1[]> = {
  leftShoulder: ["hip_line", "left_torso", "shoulder_line"],
  leftElbow: ["hip_line", "left_torso", "shoulder_line", "left_upper_arm"],
  leftWrist: ["hip_line", "left_torso", "shoulder_line", "left_upper_arm", "left_forearm"],
  rightShoulder: ["hip_line", "right_torso", "shoulder_line"],
  rightElbow: ["hip_line", "right_torso", "shoulder_line", "right_upper_arm"],
  rightWrist: ["hip_line", "right_torso", "shoulder_line", "right_upper_arm", "right_forearm"],
  leftHip: ["hip_line"],
  leftKnee: ["hip_line", "left_thigh"],
  leftAnkle: ["hip_line", "left_thigh", "left_shin"],
  rightHip: ["hip_line"],
  rightKnee: ["hip_line", "right_thigh"],
  rightAnkle: ["hip_line", "right_thigh", "right_shin"],
};

const JOINT_PARENT_V1: Readonly<Partial<Record<PersistedJointNameV2, PersistedJointNameV2>>> = Object.freeze({
  leftShoulder: "leftHip",
  leftElbow: "leftShoulder",
  leftWrist: "leftElbow",
  rightShoulder: "rightHip",
  rightElbow: "rightShoulder",
  rightWrist: "rightElbow",
  leftKnee: "leftHip",
  leftAnkle: "leftKnee",
  rightKnee: "rightHip",
  rightAnkle: "rightKnee",
});

function uncertaintyFor(
  evidence: DirectionEvidenceV1,
): JointUncertaintyV2 {
  const config = ENGINEERING_THRESHOLDS_V1.uncertainty;
  const normalizedDispersion = clamp(
    evidence.retainedSpreadRadians / CONSENSUS_V1.maxAngularDistanceRadians,
    0,
    1,
  );
  const conditioningPenalty = 1 - clamp(evidence.conditioning, 0, 1);
  const availabilityPenalty = 1 - clamp(evidence.availability, 0, 1);
  const directionalConeDegrees = clamp(
    config.minimumDirectionalConeDegrees
      + normalizedDispersion * config.dispersionConeDegrees
      + conditioningPenalty * config.conditioningConeDegrees
      + availabilityPenalty * config.availabilityConeDegrees,
    config.minimumDirectionalConeDegrees,
    config.maximumDirectionalConeDegrees,
  );
  const variance = clamp(
    config.minimumVariance
      + normalizedDispersion * config.dispersionVariance
      + conditioningPenalty * config.conditioningVariance
      + availabilityPenalty * config.availabilityVariance,
    config.minimumVariance,
    config.maximumVariance,
  );
  return {
    model: "heuristic_v1",
    covariance: [variance, 0, 0, variance, 0, variance],
    directionalConeDegrees,
  };
}

function addIsotropicFloor(
  covariance: JointUncertaintyV2["covariance"],
  floor: number,
): JointUncertaintyV2["covariance"] {
  return [
    covariance[0] + floor,
    covariance[1],
    covariance[2],
    covariance[3] + floor,
    covariance[4],
    covariance[5] + floor,
  ];
}

type UncertaintyFramesResultV1 = Readonly<{
  frames: readonly Record<PersistedJointNameV2, JointUncertaintyV2>[];
  overLimitBones: readonly ObservedBoneIdV1[];
  maximumDirectionalSensitivityDegrees: number;
}>;

function buildPerturbationUncertaintyFrames(
  evidenceFrames: readonly DirectionEvidenceMapV1[],
  baselineObservedDirections: readonly ObservedDirectionMapV1[],
  scenarios: readonly AcceptedScenarioTrajectoryV1[],
  roughnessSquaredByBone: Record<ObservedBoneIdV1, number>,
  retainedAnchorDispersion: number,
): UncertaintyFramesResultV1 {
  const config = ENGINEERING_THRESHOLDS_V1.uncertaintyPerturbation;
  const evidenceUncertaintyByFrame = evidenceFrames.map((evidence) => Object.fromEntries(
    OBSERVED_BONES_V1.map((bone) => [bone.id, uncertaintyFor(evidence[bone.id])]),
  ) as Record<ObservedBoneIdV1, JointUncertaintyV2>);
  const overLimitBones = new Set<ObservedBoneIdV1>();
  let maximumDirectionalSensitivityDegrees = 0;
  const frames = evidenceFrames.map((_, frameIndex) => {
    const built = {} as Record<PersistedJointNameV2, JointUncertaintyV2>;
    const buildJoint = (joint: PersistedJointNameV2): JointUncertaintyV2 => {
      if (built[joint]) return built[joint];
      const path = JOINT_EVIDENCE_PATH[joint];
      const evidenceValues = path.map((boneId) => evidenceUncertaintyByFrame[frameIndex][boneId]);
      const evidenceVarianceFloor = Math.max(...evidenceValues.map((value) => value.covariance[0]));
      const evidenceConeFloor = Math.max(...evidenceValues.map((value) => value.directionalConeDegrees));
      const roughnessVarianceFloor = Math.max(...path.map((boneId) => roughnessSquaredByBone[boneId]))
        * config.coordinateRoughnessVarianceGain;
      const samples = scenarios.map((scenario) => scenario.jointsByFrame[frameIndex][joint]);
      const sampleCovariance = sampleCovarianceWithIsotropicFloor(samples, 0);
      let isotropicFloor = evidenceVarianceFloor
        + config.isotropicSampleCovarianceFloorVariance
        + roughnessVarianceFloor
        + retainedAnchorDispersion ** 2 * config.anchorDispersionVarianceGain;
      const parent = JOINT_PARENT_V1[joint];
      if (parent) {
        const parentCovariance = buildJoint(parent).covariance;
        const parentEnvelope = Math.max(
          parentCovariance[0],
          parentCovariance[3],
          parentCovariance[5],
        );
        const ownMinimumSampleVariance = Math.min(
          sampleCovariance[0],
          sampleCovariance[3],
          sampleCovariance[5],
        );
        isotropicFloor = Math.max(isotropicFloor, parentEnvelope - ownMinimumSampleVariance);
      }
      let directionalSensitivityDegrees = 0;
      path.forEach((boneId) => {
        scenarios.forEach((scenario) => {
          const degrees = angleBetweenDirections(
            baselineObservedDirections[frameIndex][boneId],
            scenario.observedDirectionsByFrame[frameIndex][boneId],
          ) * 180 / Math.PI;
          directionalSensitivityDegrees = Math.max(directionalSensitivityDegrees, degrees);
          maximumDirectionalSensitivityDegrees = Math.max(maximumDirectionalSensitivityDegrees, degrees);
          if (degrees > ENGINEERING_THRESHOLDS_V1.maximumAcceptedDirectionalConeDegrees) {
            overLimitBones.add(boneId);
          }
        });
      });
      const directionalConeDegrees = Math.max(evidenceConeFloor, directionalSensitivityDegrees);
      if (directionalConeDegrees > ENGINEERING_THRESHOLDS_V1.maximumAcceptedDirectionalConeDegrees) {
        path.forEach((boneId) => {
          if (evidenceUncertaintyByFrame[frameIndex][boneId].directionalConeDegrees
            > ENGINEERING_THRESHOLDS_V1.maximumAcceptedDirectionalConeDegrees) {
            overLimitBones.add(boneId);
          }
        });
      }
      const uncertainty: JointUncertaintyV2 = {
        model: "heuristic_v1",
        covariance: addIsotropicFloor(sampleCovariance, Math.max(0, isotropicFloor)),
        directionalConeDegrees,
      };
      built[joint] = uncertainty;
      return uncertainty;
    };
    PERSISTED_JOINT_NAMES_V2.forEach(buildJoint);
    return built;
  });
  return Object.freeze({
    frames: Object.freeze(frames),
    overLimitBones: Object.freeze([...overLimitBones].sort()),
    maximumDirectionalSensitivityDegrees,
  });
}

function representativeConfidence(
  mode: CaptureProtocolV2,
  evidenceFrames: readonly DirectionEvidenceMapV1[],
  maximumDirectionalSensitivityDegrees: number,
): number {
  const allEvidence = evidenceFrames.flatMap((frame) => Object.values(frame));
  const normalizedDispersion = allEvidence.reduce((sum, evidence) => (
    sum + clamp(evidence.retainedSpreadRadians / CONSENSUS_V1.maxAngularDistanceRadians, 0, 1)
  ), 0) / allEvidence.length;
  const meanConditioning = allEvidence.reduce((sum, evidence) => sum + evidence.conditioning, 0)
    / allEvidence.length;
  const meanAvailability = allEvidence.reduce((sum, evidence) => sum + evidence.availability, 0)
    / allEvidence.length;
  const weights = ENGINEERING_THRESHOLDS_V1.confidenceWeights;
  const evidenceOnly = clamp(1 - (
    weights.dispersion * normalizedDispersion
    + weights.conditioningPenalty * (1 - clamp(meanConditioning, 0, 1))
    + weights.availabilityPenalty * (1 - clamp(meanAvailability, 0, 1))
  ), 0, 1);
  const sensitivityPenalty = ENGINEERING_THRESHOLDS_V1.uncertaintyPerturbation
    .maximumConfidenceSensitivityPenalty * clamp(
      maximumDirectionalSensitivityDegrees
        / ENGINEERING_THRESHOLDS_V1.maximumAcceptedDirectionalConeDegrees,
      0,
      1,
    );
  const raw = Math.min(evidenceOnly, evidenceOnly * (1 - sensitivityPenalty));
  return mode === "basic_1_plus_1"
    ? Math.min(raw, ENGINEERING_THRESHOLDS_V1.basicConfidenceCap)
    : raw;
}

export function buildRepresentativeSequence(
  value: unknown,
): RepresentativeSequenceResultV1 {
  const input = validateSequenceInput(value);
  if ("status" in input) return input;
  const aggregated = aggregateSessionViews(input);
  if ("status" in aggregated) return aggregated;

  const evidenceFrames: DirectionEvidenceMapV1[] = [];
  const rawDirections: BoneDirectionMapV1[] = [];
  for (let frameIndex = 0; frameIndex < PRODUCTION_PHASE_SAMPLE_COUNT; frameIndex += 1) {
    const evidence = {} as DirectionEvidenceMapV1;
    for (const bone of OBSERVED_BONES_V1) {
      const result = reconstructObservedBone(
        aggregated.front.frames[frameIndex],
        aggregated.side.frames[frameIndex],
        bone,
        aggregated.front.shootingHand,
      );
      if ("rejected" in result) return recapture(result.rejected, [bone.id]);
      evidence[bone.id] = result;
    }
    evidenceFrames.push(evidence);
    rawDirections.push(toKinematicDirections(evidence));
  }

  let smoothedDirections: BoneDirectionMapV1[];
  let baselineObservedDirections: ObservedDirectionMapV1[];
  let baselineJoints: PersistedJointMapV2[];
  try {
    smoothedDirections = smoothDirections(rawDirections);
    const smoothedObserved = smoothObservedDirections(evidenceFrames);
    if (!smoothedObserved) return recapture("inconsistent_skeleton_closure", ["shoulder_line"]);
    baselineObservedDirections = smoothedObserved;
    baselineJoints = smoothedDirections.map((directions) => forwardKinematicsFrame(
      directions,
      ENGINEERING_THRESHOLDS_V1.templateBoneLengths,
    ));
  } catch (error) {
    if (error instanceof ReconstructionError) return recapture(error.reason, error.boneId ? [error.boneId] : []);
    return recapture("missing_critical_bone");
  }

  if (!shoulderClosureIsValid(baselineJoints, baselineObservedDirections)) {
    return recapture("inconsistent_skeleton_closure", ["shoulder_line"]);
  }

  const evidenceUncertaintyByFrame = evidenceFrames.map((evidence) => Object.fromEntries(
    OBSERVED_BONES_V1.map((bone) => [
      bone.id,
      uncertaintyFor(evidence[bone.id]),
    ]),
  ) as Record<ObservedBoneIdV1, JointUncertaintyV2>);
  const evidenceOverLimitBones = new Set<ObservedBoneIdV1>();
  evidenceUncertaintyByFrame.forEach((uncertainty) => {
    OBSERVED_BONES_V1.forEach((bone) => {
      if (uncertainty[bone.id].directionalConeDegrees
        > ENGINEERING_THRESHOLDS_V1.maximumAcceptedDirectionalConeDegrees) {
        evidenceOverLimitBones.add(bone.id);
      }
    });
  });
  if (evidenceOverLimitBones.size > 0) {
    return recapture("uncertainty_exceeds_limit", [...evidenceOverLimitBones]);
  }

  const retainedFrontAttempts = selectedAttempts(input.frontAttempts, aggregated.front.attemptIds);
  const retainedSideAttempts = selectedAttempts(
    input.shootingSideAttempts,
    aggregated.side.attemptIds,
  );
  if (
    retainedFrontAttempts.length !== aggregated.front.attemptIds.length
    || retainedSideAttempts.length !== aggregated.side.attemptIds.length
  ) {
    return recapture("invalid_attempt", OBSERVED_BONES_V1.map((bone) => bone.id));
  }

  try {
    const retainedAnchorDispersion = maximumRetainedAnchorDispersion([
      retainedFrontAttempts,
      retainedSideAttempts,
    ]);
    const phaseIndexRadius = phaseIndexRadiusFor(retainedFrontAttempts, retainedSideAttempts);
    const scenarioPlan = buildDeterministicUncertaintyScenarioPlan({
      frontAttemptIds: aggregated.front.attemptIds,
      shootingSideAttemptIds: aggregated.side.attemptIds,
      phaseIndexRadius,
    });
    const frontById = new Map(retainedFrontAttempts.map((attempt) => [attempt.id, attempt]));
    const sideById = new Map(retainedSideAttempts.map((attempt) => [attempt.id, attempt]));
    const acceptedScenarios: AcceptedScenarioTrajectoryV1[] = [];
    const rejectedScenarioBones = new Set<string>();
    for (const scenario of scenarioPlan) {
      const frontAttempt = frontById.get(scenario.frontAttemptId);
      const sideAttempt = sideById.get(scenario.shootingSideAttemptId);
      if (!frontAttempt || !sideAttempt) {
        return recapture("invalid_attempt", OBSERVED_BONES_V1.map((bone) => bone.id));
      }
      const result = reconstructScenarioTrajectory(
        frontAttempt,
        sideAttempt,
        scenario.frontPhaseIndexShift,
        scenario.shootingSidePhaseIndexShift,
        scenario.pattern,
        aggregated.front.shootingHand,
      );
      if (result.status === "closure_rejected") {
        return recapture("inconsistent_skeleton_closure", ["shoulder_line"]);
      }
      if (result.status === "rejected") {
        rejectedScenarioBones.add(result.affectedBone);
      } else {
        acceptedScenarios.push(result.trajectory);
      }
    }
    const perturbationConfig = ENGINEERING_THRESHOLDS_V1.uncertaintyPerturbation;
    const minimumAcceptedScenarios = Math.max(
      perturbationConfig.minimumAcceptedScenarioCount,
      Math.ceil(scenarioPlan.length * perturbationConfig.minimumAcceptedScenarioFraction),
    );
    if (acceptedScenarios.length < minimumAcceptedScenarios) {
      return recapture(
        "perturbation_scenario_shortfall",
        [...rejectedScenarioBones].sort(),
      );
    }
    const roughnessSquaredByBone = coordinateRoughnessSquaredByBone([
      retainedFrontAttempts,
      retainedSideAttempts,
    ]);
    const perturbationUncertainty = buildPerturbationUncertaintyFrames(
      evidenceFrames,
      baselineObservedDirections,
      acceptedScenarios,
      roughnessSquaredByBone,
      retainedAnchorDispersion,
    );
    if (perturbationUncertainty.overLimitBones.length > 0) {
      return recapture("uncertainty_exceeds_limit", perturbationUncertainty.overLimitBones);
    }
    const frames = baselineJoints.map((joints, frameIndex) => ({
      phase: frameIndex / (PRODUCTION_PHASE_SAMPLE_COUNT - 1),
      joints,
      uncertainty: perturbationUncertainty.frames[frameIndex],
    }));
    const profile = parseRepresentativePose4D({
      schemaVersion: 2,
      boundary: "representative_phase_fused_4d_estimate_not_actual_3d",
      mode: input.mode,
      timeBasis: "normalized_shot_phase",
      units: "template_shoulder_breadths",
      frames,
      phaseAnchors: CANONICAL_PHASE_ANCHORS,
      quality: { passed: true, reasons: [] },
    });
    const selectedAttemptsByView = Object.freeze({
      front: Object.freeze([...aggregated.front.attemptIds]),
      shooting_side: Object.freeze([...aggregated.side.attemptIds]),
    });
    return {
      status: "complete",
      profile,
      confidence: representativeConfidence(
        input.mode,
        evidenceFrames,
        perturbationUncertainty.maximumDirectionalSensitivityDegrees,
      ),
      selectedAttemptsByView,
      rootMotion: { status: "unavailable" },
    };
  } catch (error) {
    if (error instanceof ReconstructionError) return recapture(error.reason, error.boneId ? [error.boneId] : []);
    return recapture("invalid_profile");
  }
}
