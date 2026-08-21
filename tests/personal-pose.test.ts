import { describe, expect, it } from "vitest";

import { createPersonalPoseCandidate, personalPoseToCorrectedMotion, personalPoseToMotion, type MediaPipeLandmark, type PersonalPoseFrame } from "../lib/personal-pose";

function frame(timestampMs: number, wristY: number): PersonalPoseFrame {
  const landmarks: MediaPipeLandmark[] = Array.from({ length: 33 }, (_, index) => ({ x: 0.45 + (index % 3) * 0.04, y: 0.35 + (index % 5) * 0.05, z: 0.02 * (index % 4), visibility: 0.9 }));
  landmarks[11] = { x: 0.4, y: 0.4, z: 0, visibility: 0.95 };
  landmarks[12] = { x: 0.6, y: 0.4, z: 0, visibility: 0.95 };
  landmarks[23] = { x: 0.43, y: 0.7, z: 0, visibility: 0.95 };
  landmarks[24] = { x: 0.57, y: 0.7, z: 0, visibility: 0.95 };
  landmarks[13] = { x: 0.45, y: 0.48, z: 0.04, visibility: 0.9 };
  landmarks[14] = { x: 0.55, y: 0.48, z: 0.04, visibility: 0.9 };
  landmarks[15] = { x: 0.42, y: wristY + 0.03, z: 0.06, visibility: 0.9 };
  landmarks[16] = { x: 0.58, y: wristY, z: 0.06, visibility: 0.9 };
  landmarks[25] = { x: 0.43, y: 0.88, z: 0, visibility: 0.9 };
  landmarks[26] = { x: 0.57, y: 0.88, z: 0, visibility: 0.9 };
  landmarks[27] = { x: 0.43, y: 1, z: 0, visibility: 0.9 };
  landmarks[28] = { x: 0.57, y: 1, z: 0, visibility: 0.9 };
  return { timestampMs, landmarks };
}

describe("personal pose candidate", () => {
  it("rejects incomplete frame sequences before storage", () => {
    const candidate = createPersonalPoseCandidate([{ timestampMs: 0, landmarks: [] }]);
    expect(candidate.quality.passed).toBe(false);
    expect(candidate.quality.reasons).toContain("too_few_frames");
    expect(candidate.quality.reasons).toContain("insufficient_full_body_landmarks");
    expect(personalPoseToMotion(candidate)).toBeNull();
  });

  it("creates a private monocular relative five-phase motion only after visibility gates pass", () => {
    const candidate = createPersonalPoseCandidate([
      frame(0, 0.62), frame(120, 0.66), frame(240, 0.55), frame(360, 0.38), frame(480, 0.3), frame(600, 0.34),
    ]);
    const motion = personalPoseToMotion(candidate, "test-personal-pose");
    expect(candidate.quality.passed).toBe(true);
    expect(candidate.boundary).toBe("monocular_relative_pose_not_metric_3d");
    expect(motion?.frames.map((item) => item.label)).toEqual(["준비", "딥", "상승", "릴리스", "팔로우스루"]);
    expect(motion?.frames[3].joints.rightWrist.y).toBeGreaterThan(motion?.frames[0].joints.rightWrist.y ?? 0);
  });

  it("roots corrected user phases at the pelvis with timestamped, analysis-only fluid source anchors", () => {
    const candidate = createPersonalPoseCandidate([
      frame(0, 0.62), frame(120, 0.66), frame(240, 0.55), frame(360, 0.38), frame(480, 0.3), frame(600, 0.34),
    ]);
    const corrected = personalPoseToCorrectedMotion(candidate, "test-corrected-personal-pose");
    expect(corrected?.motion.boundary).toBe("monocular_relative_pose_not_metric_3d");
    expect(corrected?.correction.boundary).toBe("analysis_only_not_actual_3d");
    expect(corrected?.correction.sourcePhaseTimestampsMs).toEqual([0, 120, 360, 480, 600]);
    expect(corrected?.motion.frames).toHaveLength(5);
    corrected?.motion.frames.forEach((phase) => expect(phase.joints.pelvis).toEqual({ x: 0, y: 0, z: 0 }));
    const upperArmLengths = corrected?.motion.frames.map((phase) => Math.hypot(
      phase.joints.rightElbow.x - phase.joints.rightShoulder.x,
      phase.joints.rightElbow.y - phase.joints.rightShoulder.y,
      phase.joints.rightElbow.z - phase.joints.rightShoulder.z,
    )) ?? [];
    expect(new Set(upperArmLengths.map((length) => length.toFixed(6)))).toHaveLength(1);
  });
});
