export type JointName = "head" | "neck" | "spine" | "pelvis" | "leftShoulder" | "leftElbow" | "leftWrist" | "rightShoulder" | "rightElbow" | "rightWrist" | "leftHip" | "leftKnee" | "leftAnkle" | "rightHip" | "rightKnee" | "rightAnkle";
export type Vector3 = { x: number; y: number; z: number };
export type PoseFrame = { label: string; progress: number; joints: Record<JointName, Vector3> };
export type PoseMotion = {
  id: string;
  frames: PoseFrame[];
  boundary: "actual_optical_mocap_3d" | "monocular_relative_pose_not_metric_3d" | "calibrated_multi_view_3d";
};
export type MotionQualityGate = { passed: boolean; failures: string[]; maxJointStep: number };
export type PoseCameraPreset = { id: "front" | "oblique" | "side"; label: "정면" | "사선" | "측면"; yaw: number };

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

export function normalizePoseYaw(value: number) {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return normalized === -180 ? 180 : normalized;
}

/**
 * Builds named camera views from the measured shoulder line at release.
 * A wrist's release-to-follow displacement is a motion vector, not the
 * athlete's facing direction, so it must not define front or side. Front
 * makes the measured shoulder line horizontal on screen; side is the
 * shooting-arm side. This works for optical-mocap and mirrors for a
 * left-handed viewer without changing the source joints.
 */
export function getPoseCameraPresets(motion: PoseMotion, hand: "auto" | "right" | "left" = "right"): PoseCameraPreset[] {
  const release = motion.frames.find((frame) => frame.label === "릴리스") ?? motion.frames[0];
  const shoulderLineX = (release?.joints.rightShoulder.x ?? 1) - (release?.joints.leftShoulder.x ?? 0);
  const shoulderLineZ = (release?.joints.rightShoulder.z ?? 0) - (release?.joints.leftShoulder.z ?? 0);
  const frontYaw = Math.hypot(shoulderLineX, shoulderLineZ) < 0.05
    ? 0
    : normalizePoseYaw((Math.atan2(-shoulderLineZ, shoulderLineX) * 180) / Math.PI);
  const shootingArmOffset = hand === "left" ? 90 : -90;
  return [
    { id: "front", label: "정면", yaw: frontYaw },
    { id: "oblique", label: "사선", yaw: normalizePoseYaw(frontYaw + shootingArmOffset / 2) },
    { id: "side", label: "측면", yaw: normalizePoseYaw(frontYaw + shootingArmOffset) },
  ];
}

export function validatePoseMotion(motion: PoseMotion): MotionQualityGate {
  const failures: string[] = [];
  const [ready, dip, rise, release, follow] = motion.frames;
  if (motion.frames.map((frame) => frame.label).join("|") !== SHOT_PHASES.join("|")) failures.push("shot_phase_order");
  if (!(dip.joints.pelvis.y < ready.joints.pelvis.y && rise.joints.pelvis.y > dip.joints.pelvis.y)) failures.push("lower_body_sequence");
  if (!(release.joints.rightWrist.y >= release.joints.rightShoulder.y + 0.58 && release.joints.rightElbow.y >= release.joints.rightShoulder.y + 0.22)) failures.push("release_height_sequence");
  if (!(follow.joints.rightWrist.z > release.joints.rightWrist.z && follow.joints.rightWrist.y >= follow.joints.rightShoulder.y + 0.62 && follow.joints.rightElbow.y >= follow.joints.rightShoulder.y + 0.15 && follow.joints.rightWrist.y >= follow.joints.head.y - 0.08)) failures.push("follow_through_height_sequence");
  let maxJointStep = 0;
  for (let index = 1; index < motion.frames.length; index += 1) {
    for (const joint of Object.keys(motion.frames[index].joints) as JointName[]) {
      const previous = motion.frames[index - 1].joints[joint];
      const current = motion.frames[index].joints[joint];
      maxJointStep = Math.max(maxJointStep, Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z));
    }
  }
  // Five keyframes intentionally span a fast release; source-frame continuity is audited separately.
  if (maxJointStep > 1.35) failures.push("frame_discontinuity");
  return { passed: failures.length === 0, failures, maxJointStep };
}

export function projectPosePoint(point: Vector3, yawDegrees: number, pitchDegrees: number, width = 330, height = 270, cameraZoom = 1) {
  const yaw = (yawDegrees * Math.PI) / 180;
  const pitch = (pitchDegrees * Math.PI) / 180;
  const rotatedX = point.x * Math.cos(yaw) - point.z * Math.sin(yaw);
  const depth = point.x * Math.sin(yaw) + point.z * Math.cos(yaw);
  const rotatedY = point.y * Math.cos(pitch) - depth * Math.sin(pitch);
  const perspective = Math.max(0.62, 1 + depth * 0.16);
  const zoom = clampPoseZoom(cameraZoom) / perspective;
  return { x: width / 2 + (rotatedX * 76) * zoom, y: height - 28 - (rotatedY * 82) * zoom, depth };
}
