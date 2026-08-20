import { requireOptionalNativeModule } from "expo-modules-core";

export type NativePoseFrame = {
  timestampMs: number;
  landmarks: Array<{ x: number; y: number; z: number; visibility?: number }>;
};

export type FormpathPoseNativeModule = {
  analyzeVideoAsync(uri: string, sampleCount: number): Promise<{ frames: NativePoseFrame[]; sampledFrames: number }>;
};

export default requireOptionalNativeModule<FormpathPoseNativeModule>("FormpathPose");
