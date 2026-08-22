import FormpathPose, { type NativePoseFrame } from "@/modules/formpath-pose/src/FormpathPoseModule";
import { createPersonalPoseCandidate } from "@/lib/personal-pose";
import type { PoseDetectionProgress, PoseDetectionResult } from "@/lib/pose-detection-types";

export type { PoseDetectionProgress, PoseDetectionResult } from "@/lib/pose-detection-types";
export {
  cancelPoseClipV2,
  createPoseClipDetectorV2,
  detectPoseClipV2,
  parseLandmarkSequenceV2,
} from "@/lib/pose-detection-v2";
export type {
  AnalyzeClipRequestV2,
  PoseClipDetectionV2Result,
  PoseProgressV2,
} from "@/lib/pose-detection-v2";

export async function detectPoseFromSelectedVideo(uri: string, onProgress?: (progress: PoseDetectionProgress) => void): Promise<PoseDetectionResult> {
  if (!FormpathPose) {
    return { status: "native_build_required", reason: "iPhone pose detection bridge가 현재 실행 파일에 포함되어 있지 않습니다. MediaPipeTasksVision을 포함한 custom development build에서 활성화됩니다." };
  }
  try {
    const output = await FormpathPose.analyzeVideoAsync(uri, 24);
    onProgress?.({ completed: output.sampledFrames, total: output.sampledFrames });
    const frames = output.frames.map((frame: NativePoseFrame) => ({ timestampMs: frame.timestampMs, landmarks: frame.landmarks }));
    const candidate = createPersonalPoseCandidate(frames);
    if (!candidate.quality.passed) return { status: "rejected", candidate, sampledFrames: output.sampledFrames, reason: candidate.quality.reasons.join(", ") || "pose_quality_failed" };
    return { status: "complete", candidate, sampledFrames: output.sampledFrames };
  } catch (error) {
    return { status: "error", reason: error instanceof Error ? error.message : "pose_detection_failed" };
  }
}
