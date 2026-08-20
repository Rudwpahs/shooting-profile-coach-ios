import type { PoseDetectionProgress, PoseDetectionResult } from "@/lib/pose-detection-types";

export type { PoseDetectionProgress, PoseDetectionResult } from "@/lib/pose-detection-types";

/** Native bridge placeholder. A custom MediaPipeTasksVision Expo module is required in the iOS development build. */
export async function detectPoseFromSelectedVideo(_uri: string, _onProgress?: (progress: PoseDetectionProgress) => void): Promise<PoseDetectionResult> {
  return {
    status: "native_build_required",
    reason: "iPhone pose detection requires the MediaPipeTasksVision native module in a custom development build. Expo Go cannot execute the browser-only detector.",
  };
}
