import type { Vector3 } from "@/lib/pose-motion";
import { parseRepresentativePose4D } from "@/lib/shooting-profile/codec";
import {
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
  type PersistedJointNameV2,
  type RepresentativePose4DV2,
  type ShootingHandV2,
} from "@/lib/shooting-profile/types";

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

function normalize(vector: Vector3, boneId: KinematicBoneIdV1): Vector3 {
  const magnitude = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(magnitude)) throw new ReconstructionError("non_finite_direction", boneId);
  if (magnitude === 0) throw new ReconstructionError("zero_direction", boneId);
  return { x: vector.x / magnitude, y: vector.y / magnitude, z: vector.z / magnitude };
}

function smoothDirectionSeries(
  directions: readonly Vector3[],
  boneId: KinematicBoneIdV1,
): Vector3[] {
  const radius = ENGINEERING_THRESHOLDS_V1.smoothingWindowRadius;
  return directions.map((_, frameIndex) => {
    const start = Math.max(0, frameIndex - radius);
    const end = Math.min(directions.length - 1, frameIndex + radius);
    const sum = { x: 0, y: 0, z: 0 };
    for (let index = start; index <= end; index += 1) {
      const direction = normalize(directions[index], boneId);
      sum.x += direction.x;
      sum.y += direction.y;
      sum.z += direction.z;
    }
    const sampleCount = end - start + 1;
    const resultantStrength = Math.hypot(sum.x, sum.y, sum.z) / sampleCount;
    if (!Number.isFinite(resultantStrength)
      || resultantStrength < ENGINEERING_THRESHOLDS_V1.minimumSmoothingResultantStrength) {
      throw new ReconstructionError("unstable_direction_smoothing", boneId);
    }
    return normalize(sum, boneId);
  });
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

const JOINT_EVIDENCE_PATH: Record<PersistedJointNameV2, readonly ObservedBoneIdV1[]> = {
  leftShoulder: ["hip_line", "left_torso"],
  leftElbow: ["hip_line", "left_torso", "left_upper_arm"],
  leftWrist: ["hip_line", "left_torso", "left_upper_arm", "left_forearm"],
  rightShoulder: ["hip_line", "right_torso"],
  rightElbow: ["hip_line", "right_torso", "right_upper_arm"],
  rightWrist: ["hip_line", "right_torso", "right_upper_arm", "right_forearm"],
  leftHip: ["hip_line"],
  leftKnee: ["hip_line", "left_thigh"],
  leftAnkle: ["hip_line", "left_thigh", "left_shin"],
  rightHip: ["hip_line"],
  rightKnee: ["hip_line", "right_thigh"],
  rightAnkle: ["hip_line", "right_thigh", "right_shin"],
};

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

function propagatedUncertainty(
  path: readonly ObservedBoneIdV1[],
  uncertaintyByBone: Record<ObservedBoneIdV1, JointUncertaintyV2>,
): JointUncertaintyV2 {
  const values = path.map((boneId) => uncertaintyByBone[boneId]);
  const variance = Math.max(...values.map((value) => value.covariance[0]));
  return {
    model: "heuristic_v1",
    covariance: [variance, 0, 0, variance, 0, variance],
    directionalConeDegrees: Math.max(...values.map((value) => value.directionalConeDegrees)),
  };
}

function representativeConfidence(
  mode: CaptureProtocolV2,
  evidenceFrames: readonly DirectionEvidenceMapV1[],
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
  const raw = clamp(1 - (
    weights.dispersion * normalizedDispersion
    + weights.conditioningPenalty * (1 - clamp(meanConditioning, 0, 1))
    + weights.availabilityPenalty * (1 - clamp(meanAvailability, 0, 1))
  ), 0, 1);
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
  for (let frameIndex = 0; frameIndex < 101; frameIndex += 1) {
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
  try {
    smoothedDirections = smoothDirections(rawDirections);
  } catch (error) {
    if (error instanceof ReconstructionError) return recapture(error.reason, error.boneId ? [error.boneId] : []);
    return recapture("missing_critical_bone");
  }

  const uncertaintyByFrame = evidenceFrames.map((evidence) => Object.fromEntries(
    OBSERVED_BONES_V1.map((bone) => [
      bone.id,
      uncertaintyFor(evidence[bone.id]),
    ]),
  ) as Record<ObservedBoneIdV1, JointUncertaintyV2>);
  const overLimitBones = new Set<ObservedBoneIdV1>();
  uncertaintyByFrame.forEach((uncertainty) => {
    OBSERVED_BONES_V1.forEach((bone) => {
      if (uncertainty[bone.id].directionalConeDegrees
        > ENGINEERING_THRESHOLDS_V1.maximumAcceptedDirectionalConeDegrees) {
        overLimitBones.add(bone.id);
      }
    });
  });
  if (overLimitBones.size > 0) {
    return recapture("uncertainty_exceeds_limit", [...overLimitBones]);
  }
  try {
    const frames = smoothedDirections.map((directions, frameIndex) => {
      const uncertainty = Object.fromEntries(PERSISTED_JOINT_NAMES_V2.map((joint) => [
        joint,
        propagatedUncertainty(JOINT_EVIDENCE_PATH[joint], uncertaintyByFrame[frameIndex]),
      ])) as Record<PersistedJointNameV2, JointUncertaintyV2>;
      return {
        phase: frameIndex / 100,
        joints: forwardKinematicsFrame(
          directions,
          ENGINEERING_THRESHOLDS_V1.templateBoneLengths,
        ),
        uncertainty,
      };
    });
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
      confidence: representativeConfidence(input.mode, evidenceFrames),
      selectedAttemptsByView,
      rootMotion: { status: "unavailable" },
    };
  } catch (error) {
    if (error instanceof ReconstructionError) return recapture(error.reason, error.boneId ? [error.boneId] : []);
    return recapture("invalid_profile");
  }
}
