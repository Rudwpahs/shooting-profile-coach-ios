import type { JointName, Vector3 } from "@/lib/pose-motion";

export type CaptureProtocolV2 = "basic_1_plus_1" | "high_accuracy_3_plus_3";
export type CaptureViewV2 = "front" | "shooting_side";
export type ShootingHandV2 = "left" | "right";
export type EvidenceBoundaryV2 = "representative_phase_fused_4d_estimate_not_actual_3d";

export type CaptureSlotV2 = {
  id: string;
  view: CaptureViewV2;
  takeIndex: 0 | 1 | 2;
  required: true;
};

export const PERSISTED_JOINT_NAMES_V2 = [
  "leftShoulder", "leftElbow", "leftWrist",
  "rightShoulder", "rightElbow", "rightWrist",
  "leftHip", "leftKnee", "leftAnkle",
  "rightHip", "rightKnee", "rightAnkle",
] as const satisfies readonly JointName[];

export type PersistedJointNameV2 = (typeof PERSISTED_JOINT_NAMES_V2)[number];
export type PersistedJointMapV2 = Record<PersistedJointNameV2, Vector3>;

export type JointUncertaintyV2 = {
  model: "heuristic_v1";
  covariance: [number, number, number, number, number, number];
  directionalConeDegrees: number;
};

export type PhaseAnchorV2 = {
  id: string;
  phase: number;
};

export type ReconstructionQualityV2 = {
  passed: boolean;
  reasons: string[];
};

export type RepresentativePoseFrameV2 = {
  phase: number;
  root?: Vector3;
  joints: PersistedJointMapV2;
  uncertainty: Record<PersistedJointNameV2, JointUncertaintyV2>;
};

export type RepresentativePose4DV2 = {
  schemaVersion: 2;
  boundary: EvidenceBoundaryV2;
  mode: CaptureProtocolV2;
  timeBasis: "normalized_shot_phase";
  units: "template_shoulder_breadths";
  frames: RepresentativePoseFrameV2[];
  phaseAnchors: PhaseAnchorV2[];
  quality: ReconstructionQualityV2;
};

export type SourceLandmarkV2 = Vector3 & { visibility?: number };

export type LandmarkSequenceFrameV2 = {
  timestampMs: number;
  sourceLandmarks: SourceLandmarkV2[];
  cropRectPx: { x: number; y: number; width: number; height: number };
  modelToSourcePx: number[];
};

export type LandmarkSequenceV2 = {
  version: 2;
  view: CaptureViewV2;
  shootingHand: ShootingHandV2;
  takeIndex: 0 | 1 | 2;
  metadata: {
    durationMs: number;
    displayWidth: number;
    displayHeight: number;
    nominalFrameRate: number;
    frameRateMode: "constant" | "variable" | "unknown";
    attemptedFrames: number;
    decodedFrames: number;
    detectedFrames: number;
    rejectedFrames: number;
  };
  frames: LandmarkSequenceFrameV2[];
  transformConvention: "upright_source_top_left_v1";
  quality: ReconstructionQualityV2;
};
