import type { Vector3 } from "@/lib/pose-motion";
import { ENGINEERING_THRESHOLDS_V1 } from "@/lib/shooting-profile/engineering-thresholds";
import type { PersistedJointMapV2, PersistedJointNameV2 } from "@/lib/shooting-profile/types";

export const KINEMATIC_TREE_V1 = Object.freeze([
  { id: "pelvis_to_left_hip", parent: "pelvis", child: "leftHip" },
  { id: "pelvis_to_right_hip", parent: "pelvis", child: "rightHip" },
  { id: "left_torso", parent: "leftHip", child: "leftShoulder" },
  { id: "right_torso", parent: "rightHip", child: "rightShoulder" },
  { id: "left_upper_arm", parent: "leftShoulder", child: "leftElbow" },
  { id: "left_forearm", parent: "leftElbow", child: "leftWrist" },
  { id: "right_upper_arm", parent: "rightShoulder", child: "rightElbow" },
  { id: "right_forearm", parent: "rightElbow", child: "rightWrist" },
  { id: "left_thigh", parent: "leftHip", child: "leftKnee" },
  { id: "left_shin", parent: "leftKnee", child: "leftAnkle" },
  { id: "right_thigh", parent: "rightHip", child: "rightKnee" },
  { id: "right_shin", parent: "rightKnee", child: "rightAnkle" },
] as const);

export type KinematicBoneIdV1 = (typeof KINEMATIC_TREE_V1)[number]["id"];
export type BoneDirectionMapV1 = Record<KinematicBoneIdV1, Vector3>;
export type BoneLengthMapV1 = Record<KinematicBoneIdV1, number>;

export type ReconstructionErrorReasonV1 =
  | "missing_critical_bone"
  | "non_finite_direction"
  | "zero_direction"
  | "non_finite_length"
  | "invalid_length"
  | "non_finite_coordinate"
  | "bone_length_violation"
  | "unstable_direction_smoothing";

export class ReconstructionError extends Error {
  readonly reason: ReconstructionErrorReasonV1;
  readonly boneId?: KinematicBoneIdV1;

  constructor(reason: ReconstructionErrorReasonV1, boneId?: KinematicBoneIdV1) {
    super(reason);
    this.name = "ReconstructionError";
    this.reason = reason;
    this.boneId = boneId;
  }
}

function finiteVector(vector: Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function normalizedDirection(
  direction: Vector3 | undefined,
  boneId: KinematicBoneIdV1,
): Vector3 {
  if (!direction) throw new ReconstructionError("missing_critical_bone", boneId);
  if (!finiteVector(direction)) throw new ReconstructionError("non_finite_direction", boneId);
  const maximumComponent = Math.max(Math.abs(direction.x), Math.abs(direction.y), Math.abs(direction.z));
  if (maximumComponent === 0) throw new ReconstructionError("zero_direction", boneId);
  const scaled = {
    x: direction.x / maximumComponent,
    y: direction.y / maximumComponent,
    z: direction.z / maximumComponent,
  };
  const magnitude = Math.hypot(scaled.x, scaled.y, scaled.z);
  const normalized = {
    x: scaled.x / magnitude,
    y: scaled.y / magnitude,
    z: scaled.z / magnitude,
  };
  if (!finiteVector(normalized)) throw new ReconstructionError("non_finite_direction", boneId);
  return normalized;
}

function templateLength(length: number | undefined, boneId: KinematicBoneIdV1): number {
  if (length === undefined) throw new ReconstructionError("missing_critical_bone", boneId);
  if (!Number.isFinite(length)) throw new ReconstructionError("non_finite_length", boneId);
  if (length <= 0) throw new ReconstructionError("invalid_length", boneId);
  const canonical = ENGINEERING_THRESHOLDS_V1.templateBoneLengths[boneId];
  if (Math.abs(length - canonical) > ENGINEERING_THRESHOLDS_V1.templateBoneLengthTolerance) {
    throw new ReconstructionError("bone_length_violation", boneId);
  }
  return canonical;
}

function addScaled(origin: Vector3, direction: Vector3, length: number): Vector3 {
  return {
    x: origin.x + direction.x * length,
    y: origin.y + direction.y * length,
    z: origin.z + direction.z * length,
  };
}

function distance(a: Vector3, b: Vector3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/**
 * Runs a fixed tree from a nonpersisted pelvis origin and returns only the
 * twelve V2 persistence-allowlisted joints. Display-only head/neck/spine
 * joints are deliberately absent.
 */
export function forwardKinematicsFrame(
  directions: BoneDirectionMapV1,
  lengths: BoneLengthMapV1,
): PersistedJointMapV2 {
  const joints: Partial<Record<PersistedJointNameV2 | "pelvis", Vector3>> = {
    pelvis: { x: 0, y: 0, z: 0 },
  };
  for (const bone of KINEMATIC_TREE_V1) {
    const origin = joints[bone.parent];
    if (!origin) throw new ReconstructionError("missing_critical_bone", bone.id);
    const direction = normalizedDirection(directions[bone.id], bone.id);
    const length = templateLength(lengths[bone.id], bone.id);
    const point = addScaled(origin, direction, length);
    if (!finiteVector(point)) throw new ReconstructionError("non_finite_coordinate", bone.id);
    if (Math.abs(distance(origin, point) - length) > ENGINEERING_THRESHOLDS_V1.templateBoneLengthTolerance) {
      throw new ReconstructionError("bone_length_violation", bone.id);
    }
    joints[bone.child] = point;
  }
  const { pelvis: _pelvis, ...persisted } = joints;
  if (Object.keys(persisted).length !== KINEMATIC_TREE_V1.length) {
    throw new ReconstructionError("missing_critical_bone");
  }
  return persisted as PersistedJointMapV2;
}
