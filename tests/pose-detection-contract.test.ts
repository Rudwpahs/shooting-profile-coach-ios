import { describe, expect, it } from "vitest";

import { buildPoseDetectionResult, isNativePoseDetectorPayload } from "@/lib/pose-detection-contract";
import type { MediaPipeLandmark, PersonalPoseFrame } from "@/lib/personal-pose";

function validFrame(timestampMs: number): PersonalPoseFrame {
  const landmark = (): MediaPipeLandmark => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.91 });
  const landmarks = Array.from({ length: 33 }, landmark);
  landmarks[11] = { x: 0.4, y: 0.4, z: 0, visibility: 0.94 };
  landmarks[12] = { x: 0.6, y: 0.4, z: 0, visibility: 0.94 };
  landmarks[23] = { x: 0.43, y: 0.7, z: 0, visibility: 0.93 };
  landmarks[24] = { x: 0.57, y: 0.7, z: 0, visibility: 0.93 };
  return { timestampMs, landmarks };
}

describe("native pose detection contract", () => {
  it("recomputes quality from returned frames before accepting a native detector result", () => {
    const result = buildPoseDetectionResult({ frames: [0, 1, 2, 3, 4, 5].map((index) => validFrame(index * 100)), sampledFrames: 6 });
    expect(result.status).toBe("complete");
    expect(result.status === "complete" && result.candidate.quality.passed).toBe(true);
  });

  it("returns a quality rejection instead of allowing incomplete native landmark data to continue", () => {
    const result = buildPoseDetectionResult({ frames: [{ timestampMs: 0, landmarks: [] }] });
    expect(result.status).toBe("rejected");
    expect(result.status === "rejected" && result.reason).toContain("too_few_frames");
  });

  it("requires a frame array in a native bridge payload", () => {
    expect(isNativePoseDetectorPayload({ frames: [] })).toBe(true);
    expect(isNativePoseDetectorPayload({ candidate: {} })).toBe(false);
  });
});
