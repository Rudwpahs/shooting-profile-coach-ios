import { describe, expect, it } from "vitest";

import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { BONE_LINKS, clampPoseZoom, POSE_ZOOM_MAX, POSE_ZOOM_MIN, projectPosePoint } from "@/lib/pose-motion";

describe("pose motion infrastructure after generated-reference withdrawal", () => {
  it("does not expose generated reference motion data", () => {
    expect(ANONYMOUS_POSE_REFERENCES).toEqual([]);
    expect(BONE_LINKS).toContainEqual(["rightElbow", "rightWrist"]);
  });
  it("keeps camera projection and pinch zoom stable for approved future and personal pose motion", () => {
    expect(clampPoseZoom(0.1)).toBe(POSE_ZOOM_MIN);
    expect(clampPoseZoom(4)).toBe(POSE_ZOOM_MAX);
    const front = projectPosePoint({ x: 0.5, y: 1.2, z: 0.25 }, 0, 8);
    const side = projectPosePoint({ x: 0.5, y: 1.2, z: 0.25 }, 82, 8);
    expect(front.x).not.toBeCloseTo(side.x);
  });
});
