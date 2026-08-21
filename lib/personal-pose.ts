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
export type PersonalPoseCorrection = {
  version: "pelvis_root_median_bone_length_v1";
  sourcePhaseIndexes: number[];
  sourcePhaseTimestampsMs: number[];
  correctedBoneCount: number;
  boundary: "analysis_only_not_actual_3d";
};
export type CorrectedPersonalPoseMotion = {
  motion: PoseMotion;
  correction: PersonalPoseCorrection;
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
const BONES: [JointName, JointName][] = [
  ["pelvis", "spine"], ["spine", "neck"], ["neck", "head"],
  ["neck", "leftShoulder"], ["leftShoulder", "leftElbow"], ["leftElbow", "leftWrist"],
  ["neck", "rightShoulder"], ["rightShoulder", "rightElbow"], ["rightElbow", "rightWrist"],
  ["pelvis", "leftHip"], ["leftHip", "leftKnee"], ["leftKnee", "leftAnkle"],
  ["pelvis", "rightHip"], ["rightHip", "rightKnee"], ["rightKnee", "rightAnkle"],
];

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

function vectorBetween(start: Vector3, end: Vector3): Vector3 {
  return { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
}

function vectorLength(vector: Vector3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function median(values: number[]) {
  const ordered = [...values].sort((first, second) => first - second);
  return ordered[Math.floor(ordered.length / 2)] ?? 0;
}

function unitVector(vector: Vector3): Vector3 {
  const length = vectorLength(vector);
  return length > 0.0001 ? { x: vector.x / length, y: vector.y / length, z: vector.z / length } : { x: 0, y: 1, z: 0 };
}

function selectShotPhaseIndexes(frames: PersonalPoseFrame[]) {
  const rawRelease = frames.reduce((best, frame, index) => frame.landmarks[16].y < frames[best].landmarks[16].y ? index : best, 0);
  const releaseIndex = clamp(rawRelease, 3, frames.length - 2);
  const rawDip = frames.slice(0, releaseIndex + 1).reduce((best, frame, index) => frame.landmarks[16].y > frames[best].landmarks[16].y ? index : best, 0);
  const dipIndex = clamp(rawDip, 1, releaseIndex - 2);
  const riseIndex = clamp(Math.round((dipIndex + releaseIndex) / 2), dipIndex + 1, releaseIndex - 1);
  return [0, dipIndex, riseIndex, releaseIndex, frames.length - 1];
}

function pelvisRootAndNormalizeBones(phaseJoints: Record<JointName, Vector3>[]): Record<JointName, Vector3>[] {
  const medianLengths = new Map(BONES.map(([start, end]) => {
    const lengths = phaseJoints.map((joints) => vectorLength(vectorBetween(joints[start], joints[end]))).filter((length) => length > 0.0001);
    return [`${start}-${end}`, median(lengths)] as const;
  }));
  return phaseJoints.map((original) => {
    const root = original.pelvis;
    const rooted = Object.fromEntries((Object.keys(original) as JointName[]).map((joint) => [joint, vectorBetween(root, original[joint])])) as Record<JointName, Vector3>;
    const corrected: Partial<Record<JointName, Vector3>> = { pelvis: { x: 0, y: 0, z: 0 } };
    for (const [parent, child] of BONES) {
      const parentPosition = corrected[parent] ?? rooted[parent];
      const direction = unitVector(vectorBetween(rooted[parent], rooted[child]));
      const length = medianLengths.get(`${parent}-${child}`) ?? vectorLength(vectorBetween(rooted[parent], rooted[child]));
      corrected[child] = { x: parentPosition.x + direction.x * length, y: parentPosition.y + direction.y * length, z: parentPosition.z + direction.z * length };
    }
    return corrected as Record<JointName, Vector3>;
  });
}

/**
 * Applies the same conservative display correction used by player analysis: pelvis root
 * recentering plus per-bone median-length normalization. It preserves each source phase's
 * observed directions and does not turn a monocular upload into calibrated or metric 3D.
 */
export function personalPoseToCorrectedMotion(candidate: PersonalPoseCandidate, id = "my-pose"): CorrectedPersonalPoseMotion | null {
  if (!candidate.quality.passed) return null;
  const frames = candidate.frames.filter((frame) => frame.landmarks.length >= 33);
  if (frames.length < 5) return null;
  const indexes = selectShotPhaseIndexes(frames);
  const correctedJoints = pelvisRootAndNormalizeBones(indexes.map((index) => frameToJoints(frames[index])));
  return {
    motion: {
      id,
      boundary: candidate.boundary === "calibrated_multi_view_3d" ? "calibrated_multi_view_3d" : "monocular_relative_pose_not_metric_3d",
      frames: SHOT_PHASES.map((label, index) => ({ label, progress: index / (SHOT_PHASES.length - 1), joints: correctedJoints[index] })),
    },
    correction: {
      version: "pelvis_root_median_bone_length_v1",
      sourcePhaseIndexes: indexes,
      sourcePhaseTimestampsMs: indexes.map((index) => frames[index].timestampMs),
      correctedBoneCount: BONES.length,
      boundary: "analysis_only_not_actual_3d",
    },
  };
}

/** Compresses a detected timeline into the five display phases without claiming calibrated 3D. */
export function personalPoseToMotion(candidate: PersonalPoseCandidate, id = "my-pose"): PoseMotion | null {
  return personalPoseToCorrectedMotion(candidate, id)?.motion ?? null;
}
