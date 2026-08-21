import type { JointName } from "@/lib/pose-motion";

export const SKELETON_BONES: readonly (readonly [JointName, JointName])[] = [
  ["pelvis", "spine"], ["spine", "neck"], ["neck", "head"],
  ["neck", "leftShoulder"], ["leftShoulder", "leftElbow"], ["leftElbow", "leftWrist"],
  ["neck", "rightShoulder"], ["rightShoulder", "rightElbow"], ["rightElbow", "rightWrist"],
  ["pelvis", "leftHip"], ["leftHip", "leftKnee"], ["leftKnee", "leftAnkle"],
  ["pelvis", "rightHip"], ["rightHip", "rightKnee"], ["rightKnee", "rightAnkle"],
] as const;

/**
 * Generic adult joint-centre display template, expressed relative to bi-acromial
 * shoulder breadth. It deliberately provides only a readable silhouette: without
 * a measured stature and calibrated cameras it is not a subject-specific body model.
 */
export const ADULT_BONE_RATIO_TO_SHOULDER_BREADTH: Readonly<Record<string, number>> = {
  "pelvis->spine": 0.54,
  "spine->neck": 0.56,
  "neck->head": 0.58,
  "neck->leftShoulder": 0.5,
  "leftShoulder->leftElbow": 0.86,
  "leftElbow->leftWrist": 0.88,
  "neck->rightShoulder": 0.5,
  "rightShoulder->rightElbow": 0.86,
  "rightElbow->rightWrist": 0.88,
  "pelvis->leftHip": 0.44,
  "leftHip->leftKnee": 1.1,
  "leftKnee->leftAnkle": 0.96,
  "pelvis->rightHip": 0.44,
  "rightHip->rightKnee": 1.1,
  "rightKnee->rightAnkle": 0.96,
};

export const ADULT_PROPORTION_TEMPLATE = {
  id: "adult_joint_center_shoulder_scaled_v1",
  scaleBasis: "median_source_biacromial_shoulder_breadth",
  reference: "de Leva 1996 joint-centre segment convention; generic display ratios",
  boundary: "generic_display_proportion_not_subject_measurement",
} as const;

export function boneKey(parent: JointName, child: JointName) {
  return `${parent}->${child}`;
}
