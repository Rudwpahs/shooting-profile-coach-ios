import { NativeModules, Platform } from "react-native";

import { buildPoseDetectionResult, isNativePoseDetectorPayload, type NativePoseDetectorPayload } from "@/lib/pose-detection-contract";
import type { PoseDetectionProgress, PoseDetectionResult } from "@/lib/pose-detection-types";

export type { PoseDetectionProgress, PoseDetectionResult } from "@/lib/pose-detection-types";

type NativePoseDetector = {
  analyzeVideo: (uri: string) => Promise<NativePoseDetectorPayload>;
};

function nativeDetector(): NativePoseDetector | null {
  const candidate = NativeModules.FormPathPoseDetector as Partial<NativePoseDetector> | undefined;
  return candidate && typeof candidate.analyzeVideo === "function" ? candidate as NativePoseDetector : null;
}

/**
 * Receives only sampled landmark frames from a custom on-device detector. Raw video is never
 * persisted or uploaded. A detector result is independently re-gated here before it can enter
 * the correction and private-storage flow.
 */
export async function detectPoseFromSelectedVideo(uri: string, onProgress?: (progress: PoseDetectionProgress) => void): Promise<PoseDetectionResult> {
  if (Platform.OS === "web") {
    return { status: "native_build_required", reason: "웹 미리보기에서는 on-device pose detection을 실행하지 않습니다. iPhone custom development build에서 영상을 선택하세요." };
  }
  const detector = nativeDetector();
  if (!detector) {
    return {
      status: "native_build_required",
      reason: "FormPathPoseDetector native module이 없습니다. MediaPipe Tasks Vision을 포함한 iPhone custom development build가 필요하며 Expo Go에서는 실행할 수 없습니다.",
    };
  }
  try {
    onProgress?.({ completed: 0, total: 1 });
    const payload: unknown = await detector.analyzeVideo(uri);
    if (!isNativePoseDetectorPayload(payload)) {
      return { status: "error", reason: "on-device detector 응답 형식이 올바르지 않습니다. frame landmark 배열을 확인하세요." };
    }
    onProgress?.({ completed: 1, total: 1 });
    return buildPoseDetectionResult(payload);
  } catch (error) {
    return { status: "error", reason: error instanceof Error ? `on-device pose detection 실패: ${error.message}` : "on-device pose detection을 완료하지 못했습니다." };
  }
}
