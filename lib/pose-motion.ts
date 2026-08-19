import type { AnonymousPoseReference } from "@/lib/anonymous-pose-library";

export type JointName = "head" | "neck" | "spine" | "pelvis" | "leftShoulder" | "leftElbow" | "leftWrist" | "rightShoulder" | "rightElbow" | "rightWrist" | "leftHip" | "leftKnee" | "leftAnkle" | "rightHip" | "rightKnee" | "rightAnkle";
export type Vector3 = { x: number; y: number; z: number };
export type PoseFrame = { label: string; progress: number; joints: Record<JointName, Vector3> };
export type PoseMotion = { id: string; frames: PoseFrame[]; boundary: "relative_trait_derived_pose" };

export const BONE_LINKS: Array<[JointName, JointName]> = [
  ["head", "neck"], ["neck", "spine"], ["spine", "pelvis"],
  ["neck", "leftShoulder"], ["leftShoulder", "leftElbow"], ["leftElbow", "leftWrist"],
  ["neck", "rightShoulder"], ["rightShoulder", "rightElbow"], ["rightElbow", "rightWrist"],
  ["pelvis", "leftHip"], ["leftHip", "leftKnee"], ["leftKnee", "leftAnkle"],
  ["pelvis", "rightHip"], ["rightHip", "rightKnee"], ["rightKnee", "rightAnkle"],
];

export const SHOT_PHASES = ["준비", "딥", "상승", "릴리스", "팔로우스루"] as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function buildPoseMotion(reference: AnonymousPoseReference): PoseMotion {
  const { releaseElevation, armExtension, lowerBodyDrive, rhythm } = reference.traits;
  const releaseLift = 0.65 + releaseElevation / 180;
  const extension = 0.38 + armExtension / 230;
  const drive = 0.25 + lowerBodyDrive / 250;
  const pace = 0.8 + rhythm / 250;
  const phaseProgress = [0, 0.23, 0.52, 0.76, 1];
  const frames = phaseProgress.map((progress, index) => {
    const lift = Math.sin(progress * Math.PI) * drive;
    const release = clamp((progress - 0.35) / 0.55, 0, 1);
    const follow = clamp((progress - 0.72) / 0.28, 0, 1);
    const kneeBend = Math.sin(progress * Math.PI) * (0.24 + drive * 0.45);
    const shoulderY = 1.9 + lift;
    const elbowY = 1.7 + lift + release * releaseLift * 0.35;
    const wristY = 1.48 + lift + release * releaseLift;
    const armForward = 0.18 + release * extension + follow * 0.12;
    const rightArmX = 0.3 + release * 0.08;
    const joints: Record<JointName, Vector3> = {
      head: { x: 0, y: 2.55 + lift * 0.72, z: 0 }, neck: { x: 0, y: 2.2 + lift * 0.78, z: 0 }, spine: { x: 0, y: 1.55 + lift * 0.45, z: 0 }, pelvis: { x: 0, y: 0.92 + lift * 0.14, z: 0 },
      leftShoulder: { x: -0.3, y: shoulderY, z: 0.03 }, leftElbow: { x: -0.46, y: elbowY - 0.24, z: 0.08 + release * 0.1 }, leftWrist: { x: -0.36, y: wristY - 0.34, z: 0.12 + release * 0.18 },
      rightShoulder: { x: rightArmX, y: shoulderY, z: -0.03 }, rightElbow: { x: 0.42 + release * 0.08, y: elbowY, z: armForward * 0.66 }, rightWrist: { x: 0.23 + release * 0.12, y: wristY, z: armForward },
      leftHip: { x: -0.18, y: 0.88 + lift * 0.12, z: 0 }, leftKnee: { x: -0.22, y: 0.43 + lift * 0.15 - kneeBend, z: 0.09 + kneeBend * 0.44 }, leftAnkle: { x: -0.22, y: 0, z: 0.02 },
      rightHip: { x: 0.18, y: 0.88 + lift * 0.12, z: 0 }, rightKnee: { x: 0.24, y: 0.43 + lift * 0.15 - kneeBend, z: -0.09 + kneeBend * 0.44 }, rightAnkle: { x: 0.24, y: 0, z: 0.02 },
    };
    return { label: SHOT_PHASES[index], progress: Number((progress * pace).toFixed(2)), joints };
  });
  return { id: reference.id, frames, boundary: "relative_trait_derived_pose" };
}

export function projectPosePoint(point: Vector3, yawDegrees: number, pitchDegrees: number, width = 330, height = 270) {
  const yaw = (yawDegrees * Math.PI) / 180;
  const pitch = (pitchDegrees * Math.PI) / 180;
  const rotatedX = point.x * Math.cos(yaw) - point.z * Math.sin(yaw);
  const depth = point.x * Math.sin(yaw) + point.z * Math.cos(yaw);
  const rotatedY = point.y * Math.cos(pitch) - depth * Math.sin(pitch);
  const zoom = 1 + depth * 0.16;
  return { x: width / 2 + (rotatedX * 76) / zoom, y: height - 28 - (rotatedY * 82) / zoom, depth };
}
