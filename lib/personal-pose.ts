import { SHOT_PHASES, type JointName, type PoseMotion, type Vector3 } from "@/lib/pose-motion";

export type MediaPipeLandmark = { x: number; y: number; z: number; visibility?: number };
export type PersonalPoseFrame = { timestampMs: number; landmarks: MediaPipeLandmark[] };
export type PersonalPoseQuality = {
  passed: boolean;
  source: "mediapipe_pose_landmarker";
  landmarkFrameRatio: number;
  meanVisibility: number;
  reasons: string[];
};
export type PersonalPoseCandidate = {
  version: 1;
  boundary: "monocular_relative_pose_not_metric_3d" | "calibrated_multi_view_3d";
  frames: PersonalPoseFrame[];
  quality: PersonalPoseQuality;
};

const MAP: Record<JointName, number> = {
  head: 0, neck: 0, spine: 23, pelvis: 23,
  leftShoulder: 11, leftElbow: 13, leftWrist: 15,
  rightShoulder: 12, rightElbow: 14, rightWrist: 16,
  leftHip: 23, leftKnee: 25, leftAnkle: 27,
  rightHip: 24, rightKnee: 26, rightAnkle: 28,
};

const midpoint = (a: MediaPipeLandmark, b: MediaPipeLandmark): MediaPipeLandmark => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, visibility: ((a.visibility ?? 1) + (b.visibility ?? 1)) / 2 });
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function assessPersonalPoseFrames(frames: PersonalPoseFrame[]): PersonalPoseQuality {
  const complete = frames.filter((frame) => frame.landmarks.length >= 33);
  const landmarkFrameRatio = frames.length ? complete.length / frames.length : 0;
  const visibilityValues = complete.flatMap((frame) => frame.landmarks.slice(11, 29).map((landmark) => landmark.visibility ?? 1));
  const meanVisibility = visibilityValues.length ? visibilityValues.reduce((sum, value) => sum + value, 0) / visibilityValues.length : 0;
  const reasons: string[] = [];
  if (frames.length < 5) reasons.push("too_few_frames");
  if (landmarkFrameRatio < 0.72) reasons.push("insufficient_full_body_landmarks");
  if (meanVisibility < 0.55) reasons.push("low_landmark_visibility");
  return { passed: reasons.length === 0, source: "mediapipe_pose_landmarker", landmarkFrameRatio: Number(landmarkFrameRatio.toFixed(3)), meanVisibility: Number(meanVisibility.toFixed(3)), reasons };
}

export function createPersonalPoseCandidate(frames: PersonalPoseFrame[]): PersonalPoseCandidate {
  return { version: 1, boundary: "monocular_relative_pose_not_metric_3d", frames, quality: assessPersonalPoseFrames(frames) };
}

function normalizeJoint(landmark: MediaPipeLandmark, origin: MediaPipeLandmark, scale: number): Vector3 {
  return { x: (landmark.x - origin.x) / scale, y: -(landmark.y - origin.y) / scale, z: landmark.z / scale };
}

function frameToJoints(frame: PersonalPoseFrame): Record<JointName, Vector3> {
  const landmarks = frame.landmarks;
  const shoulderMid = midpoint(landmarks[11], landmarks[12]);
  const hipMid = midpoint(landmarks[23], landmarks[24]);
  const shoulderWidth = Math.max(0.08, Math.hypot(landmarks[11].x - landmarks[12].x, landmarks[11].y - landmarks[12].y));
  const resolved: Partial<Record<JointName, MediaPipeLandmark>> = { neck: shoulderMid, spine: midpoint(shoulderMid, hipMid), pelvis: hipMid };
  return Object.fromEntries((Object.keys(MAP) as JointName[]).map((joint) => [joint, normalizeJoint(resolved[joint] ?? landmarks[MAP[joint]], shoulderMid, shoulderWidth)])) as Record<JointName, Vector3>;
}

/** Compresses a detected timeline into the five display phases without claiming calibrated 3D. */
export function personalPoseToMotion(candidate: PersonalPoseCandidate, id = "my-pose"): PoseMotion | null {
  if (!candidate.quality.passed) return null;
  const frames = candidate.frames.filter((frame) => frame.landmarks.length >= 33);
  if (frames.length < 5) return null;
  const releaseIndex = frames.reduce((best, frame, index) => frame.landmarks[16].y < frames[best].landmarks[16].y ? index : best, 0);
  const dipIndex = frames.slice(0, Math.max(1, releaseIndex)).reduce((best, frame, index) => frame.landmarks[24].y > frames[best].landmarks[24].y ? index : best, 0);
  const indexes = [0, dipIndex, Math.round((dipIndex + releaseIndex) / 2), releaseIndex, frames.length - 1]
    .map((index, position) => clamp(index, position === 0 ? 0 : 1, frames.length - 1));
  return {
    id,
    boundary: candidate.boundary === "calibrated_multi_view_3d" ? "calibrated_multi_view_3d" : "monocular_relative_pose_not_metric_3d",
    frames: SHOT_PHASES.map((label, index) => ({ label, progress: index / (SHOT_PHASES.length - 1), joints: frameToJoints(frames[indexes[index]]) })),
  };
}
