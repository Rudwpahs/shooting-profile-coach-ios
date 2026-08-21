import { createPersonalPoseCandidate, type PersonalPoseFrame } from "@/lib/personal-pose";
import type { PoseDetectionResult } from "@/lib/pose-detection-types";

export type NativePoseDetectorPayload = {
  frames: PersonalPoseFrame[];
  sampledFrames?: number;
};

export function buildPoseDetectionResult(payload: NativePoseDetectorPayload): PoseDetectionResult {
  if (!Array.isArray(payload.frames)) {
    return { status: "error", reason: "native pose detector가 frame 목록을 반환하지 않았습니다." };
  }
  const candidate = createPersonalPoseCandidate(payload.frames);
  const sampledFrames = Number.isFinite(payload.sampledFrames) ? Math.max(0, Math.round(payload.sampledFrames ?? 0)) : payload.frames.length;
  if (!candidate.quality.passed) {
    return {
      status: "rejected",
      candidate,
      sampledFrames,
      reason: `포즈 품질 기준을 통과하지 못했습니다: ${candidate.quality.reasons.join(", ")}`,
    };
  }
  return { status: "complete", candidate, sampledFrames };
}

export function isNativePoseDetectorPayload(value: unknown): value is NativePoseDetectorPayload {
  return typeof value === "object" && value !== null && "frames" in value && Array.isArray((value as { frames?: unknown }).frames);
}
