import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";

export type NativePoseFrame = {
  timestampMs: number;
  landmarks: { x: number; y: number; z: number; visibility?: number }[];
};

export type AnalyzeClipRequestV2 = {
  uri: string;
  requestId: string;
  view: "front" | "shooting_side";
  shootingHand: "left" | "right";
  takeIndex: 0 | 1 | 2;
  profile: "personal_v2";
};

export type NativePoseProgressV2 = {
  requestId: string;
  stage: "metadata" | "coarse_pose" | "dense_pose" | "quality" | "complete";
  completed: number;
  total: number;
};

export type NativePoseLandmarkV2 = {
  x: number;
  y: number;
  /** Raw MediaPipe image-relative z; this is not reconstructed or metric depth. */
  z: number;
  visibility?: number;
};

export type NativePoseAttemptV2 = {
  requestedTimestampMs: number;
  decodedTimestampMs: number | null;
  detectedTimestampMs: number | null;
};

export type NativeLandmarkSequenceV2 = {
  version: 2;
  view: AnalyzeClipRequestV2["view"];
  shootingHand: AnalyzeClipRequestV2["shootingHand"];
  takeIndex: AnalyzeClipRequestV2["takeIndex"];
  metadata: {
    durationMs: number;
    displayWidth: number;
    displayHeight: number;
    nominalFrameRate: number;
    frameRateMode: "constant" | "variable" | "unknown";
    locatorAttemptedFrames: number;
    locatorDecodedFrames: number;
    locatorDetectedFrames: number;
    attemptedFrames: number;
    decodedFrames: number;
    detectedFrames: number;
    rejectedFrames: number;
    releaseProxyTimestampMs: number;
    attempts: NativePoseAttemptV2[];
  };
  frames: {
    timestampMs: number;
    /** Landmarks normalized to the stable cropped model input, not the source image. */
    modelLandmarks: NativePoseLandmarkV2[];
    cropRectPx: { x: number; y: number; width: number; height: number };
    modelToSourcePx: number[];
  }[];
  transformConvention: "cropped_model_to_upright_source_v1";
  quality: {
    passed: boolean;
    reasons: (
      | "too_few_detected_frames"
      | "low_detection_ratio"
      | "low_critical_joint_coverage"
      | "critical_phase_gap"
    )[];
  };
};

export type FormpathPoseNativeModule = {
  analyzeVideoAsync(uri: string, sampleCount: number): Promise<{
    frames: NativePoseFrame[];
    sampledFrames: number;
  }>;
  analyzeClipAsync(request: AnalyzeClipRequestV2): Promise<NativeLandmarkSequenceV2>;
  cancelAnalysisAsync(requestId: string): Promise<void>;
  addListener(
    eventName: "onPoseAnalysisProgress",
    listener: (event: NativePoseProgressV2) => void,
  ): EventSubscription;
};

export default requireOptionalNativeModule<FormpathPoseNativeModule>("FormpathPose");
