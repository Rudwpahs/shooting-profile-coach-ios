import type { AnonymousPoseReference } from "@/lib/anonymous-pose-library";

export type JointName = "head" | "neck" | "spine" | "pelvis" | "leftShoulder" | "leftElbow" | "leftWrist" | "rightShoulder" | "rightElbow" | "rightWrist" | "leftHip" | "leftKnee" | "leftAnkle" | "rightHip" | "rightKnee" | "rightAnkle";
export type Vector3 = { x: number; y: number; z: number };
export type PoseFrame = { label: string; progress: number; joints: Record<JointName, Vector3> };
export type PoseMotion = {
  id: string;
  frames: PoseFrame[];
  boundary: "biomechanical_reference_animation_not_metric_3d" | "monocular_relative_pose_not_metric_3d" | "calibrated_multi_view_3d";
};
export type MotionQualityGate = { passed: boolean; failures: string[]; maxJointStep: number };

export const BONE_LINKS: Array<[JointName, JointName]> = [
  ["head", "neck"], ["neck", "spine"], ["spine", "pelvis"],
  ["neck", "leftShoulder"], ["leftShoulder", "leftElbow"], ["leftElbow", "leftWrist"],
  ["neck", "rightShoulder"], ["rightShoulder", "rightElbow"], ["rightElbow", "rightWrist"],
  ["pelvis", "leftHip"], ["leftHip", "leftKnee"], ["leftKnee", "leftAnkle"],
  ["pelvis", "rightHip"], ["rightHip", "rightKnee"], ["rightKnee", "rightAnkle"],
];

export const SHOT_PHASES = ["준비", "딥", "상승", "릴리스", "팔로우스루"] as const;
export const POSE_ZOOM_MIN = 0.78;
export const POSE_ZOOM_MAX = 1.65;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

export function clampPoseZoom(value: number) {
  return clamp(value, POSE_ZOOM_MIN, POSE_ZOOM_MAX);
}

/**
 * Builds a biomechanically ordered reference animation. It is intentionally not
 * a reconstructed athlete or a calibrated 3D pose sequence: the source inputs
 * only modulate a conservative visual range around the same validated phase order.
 */
export function buildPoseMotion(reference: AnonymousPoseReference): PoseMotion {
  const releaseBias = (reference.traits.releaseElevation - 50) / 100;
  const extensionBias = (reference.traits.armExtension - 50) / 100;
  const driveBias = (reference.traits.lowerBodyDrive - 50) / 100;
  const rhythmBias = (reference.traits.rhythm - 50) / 100;
  const dipDepth = 0.16 + driveBias * 0.045;
  const riseHeight = 0.22 + driveBias * 0.045;
  // Keep the shooting hand high through both release and follow-through.
  // The former value allowed a wrist barely above the shoulder, which is not
  // an acceptable basketball follow-through reference.
  const releaseWristLift = 0.98 + releaseBias * 0.1;
  const followWristLift = 0.42 + extensionBias * 0.08;
  const armExtension = 0.5 + extensionBias * 0.08;
  const phaseProgress = [0, 0.23, 0.5, 0.74, 1].map((value, index) => Number((value + (index > 1 ? rhythmBias * 0.012 : 0)).toFixed(2)));

  const frames = SHOT_PHASES.map((label, index) => {
    const phase = index / (SHOT_PHASES.length - 1);
    const dip = index === 1 ? 1 : index === 2 ? 0.45 : 0;
    const rise = index === 2 ? 0.56 : index === 3 ? 1 : index === 4 ? 0.72 : 0;
    const follow = index === 4 ? 1 : 0;
    const pelvisY = 0.92 - dip * dipDepth + rise * riseHeight;
    const shoulderY = 1.9 - dip * dipDepth * 0.75 + rise * riseHeight * 0.85;
    const spineTilt = dip * 0.12 - rise * 0.025;
    const kneeY = 0.43 - dip * (0.13 + driveBias * 0.03) + rise * 0.08;
    const shootingElbowY = shoulderY - 0.2 + rise * (0.52 + releaseBias * 0.06) + follow * (0.22 + extensionBias * 0.04);
    const shootingWristY = shoulderY - 0.33 + rise * releaseWristLift + follow * followWristLift;
    const shootingForward = 0.1 + rise * armExtension + follow * 0.17;
    const supportArmY = shoulderY - 0.26 + rise * 0.12;

    const joints: Record<JointName, Vector3> = {
      head: { x: 0, y: shoulderY + 0.66, z: -spineTilt * 0.15 },
      neck: { x: 0, y: shoulderY + 0.32, z: -spineTilt * 0.12 },
      spine: { x: 0, y: pelvisY + 0.64, z: spineTilt },
      pelvis: { x: 0, y: pelvisY, z: 0 },
      leftShoulder: { x: -0.3, y: shoulderY, z: 0.03 },
      leftElbow: { x: -0.48, y: supportArmY, z: 0.08 + rise * 0.08 },
      leftWrist: { x: -0.34, y: supportArmY - 0.15 + rise * 0.12, z: 0.17 + rise * 0.13 },
      rightShoulder: { x: 0.3, y: shoulderY, z: -0.03 },
      rightElbow: { x: 0.44 + rise * 0.11, y: shootingElbowY, z: 0.12 + shootingForward * 0.52 },
      rightWrist: { x: 0.25 + rise * 0.12 - follow * 0.05, y: shootingWristY, z: shootingForward },
      leftHip: { x: -0.19, y: pelvisY - 0.04, z: 0.02 },
      leftKnee: { x: -0.24, y: kneeY, z: 0.08 + dip * 0.16 - rise * 0.04 },
      leftAnkle: { x: -0.23, y: 0, z: 0.03 },
      rightHip: { x: 0.19, y: pelvisY - 0.04, z: -0.02 },
      rightKnee: { x: 0.25, y: kneeY, z: -0.08 + dip * 0.16 - rise * 0.04 },
      rightAnkle: { x: 0.24, y: 0, z: 0.03 },
    };
    return { label, progress: phaseProgress[index], joints };
  });
  return { id: reference.id, frames, boundary: "biomechanical_reference_animation_not_metric_3d" };
}

export function validatePoseMotion(motion: PoseMotion): MotionQualityGate {
  const failures: string[] = [];
  const [ready, dip, rise, release, follow] = motion.frames;
  if (motion.frames.map((frame) => frame.label).join("|") !== SHOT_PHASES.join("|")) failures.push("shot_phase_order");
  if (!(dip.joints.pelvis.y < ready.joints.pelvis.y && rise.joints.pelvis.y > dip.joints.pelvis.y)) failures.push("lower_body_sequence");
  if (!(release.joints.rightWrist.y >= release.joints.rightShoulder.y + 0.58 && release.joints.rightElbow.y >= release.joints.rightShoulder.y + 0.22)) failures.push("release_height_sequence");
  if (!(follow.joints.rightWrist.z > release.joints.rightWrist.z && follow.joints.rightWrist.y >= follow.joints.rightShoulder.y + 0.66 && follow.joints.rightElbow.y >= follow.joints.rightShoulder.y + 0.22 && follow.joints.rightWrist.y >= follow.joints.head.y - 0.08)) failures.push("follow_through_height_sequence");
  let maxJointStep = 0;
  for (let index = 1; index < motion.frames.length; index += 1) {
    for (const joint of Object.keys(motion.frames[index].joints) as JointName[]) {
      const previous = motion.frames[index - 1].joints[joint];
      const current = motion.frames[index].joints[joint];
      maxJointStep = Math.max(maxJointStep, Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z));
    }
  }
  if (maxJointStep > 1.1) failures.push("frame_discontinuity");
  return { passed: failures.length === 0, failures, maxJointStep };
}

export function projectPosePoint(point: Vector3, yawDegrees: number, pitchDegrees: number, width = 330, height = 270, cameraZoom = 1) {
  const yaw = (yawDegrees * Math.PI) / 180;
  const pitch = (pitchDegrees * Math.PI) / 180;
  const rotatedX = point.x * Math.cos(yaw) - point.z * Math.sin(yaw);
  const depth = point.x * Math.sin(yaw) + point.z * Math.cos(yaw);
  const rotatedY = point.y * Math.cos(pitch) - depth * Math.sin(pitch);
  const zoom = Math.max(0.62, 1 + depth * 0.16) / clampPoseZoom(cameraZoom);
  return { x: width / 2 + (rotatedX * 76) / zoom, y: height - 28 - (rotatedY * 82) / zoom, depth };
}
