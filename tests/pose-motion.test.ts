import { describe, expect, it } from "vitest";

import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { BONE_LINKS, clampPoseZoom, getPoseCameraPresets, POSE_ZOOM_MAX, POSE_ZOOM_MIN, projectPosePoint, validatePoseMotion } from "@/lib/pose-motion";

describe("approved actual optical-mocap pose motion", () => {
  it("uses a validated five-phase measured motion with a high follow-through", () => {
    const motion = ANONYMOUS_POSE_REFERENCES[0].motion;
    const quality = validatePoseMotion(motion);
    expect(motion.boundary).toBe("actual_optical_mocap_3d");
    expect(motion.frames.map((frame) => frame.label)).toEqual(["준비", "딥", "상승", "릴리스", "팔로우스루"]);
    expect(quality).toMatchObject({ passed: true, failures: [] });
    const follow = motion.frames[4].joints;
    expect(follow.rightWrist.y).toBeGreaterThanOrEqual(follow.rightShoulder.y + 0.62);
    expect(follow.rightWrist.y).toBeGreaterThanOrEqual(follow.head.y - 0.08);
    expect(BONE_LINKS).toContainEqual(["rightElbow", "rightWrist"]);
  });
  it("derives front, oblique, and shooting-arm side views from the actual shot direction", () => {
    expect(clampPoseZoom(0.1)).toBe(POSE_ZOOM_MIN);
    expect(clampPoseZoom(4)).toBe(POSE_ZOOM_MAX);
    const motion = ANONYMOUS_POSE_REFERENCES[0].motion;
    const [frontView, obliqueView, sideView] = getPoseCameraPresets(motion, "right");
    expect([frontView.label, obliqueView.label, sideView.label]).toEqual(["정면", "사선", "측면"]);
    expect(frontView.yaw).toBeCloseTo(180, 0);
    expect(obliqueView.yaw).toBeCloseTo(135, 0);
    expect(sideView.yaw).toBeCloseTo(90, 0);
    const front = projectPosePoint({ x: 0.5, y: 1.2, z: 0.25 }, frontView.yaw, 8);
    const side = projectPosePoint({ x: 0.5, y: 1.2, z: 0.25 }, sideView.yaw, 8);
    expect(front.x).not.toBeCloseTo(side.x);
    const normal = projectPosePoint({ x: 0.5, y: 1.2, z: 0.25 }, frontView.yaw, 8, 330, 270, 1);
    const enlarged = projectPosePoint({ x: 0.5, y: 1.2, z: 0.25 }, frontView.yaw, 8, 330, 270, 1.3);
    expect(Math.abs(enlarged.x - 165)).toBeGreaterThan(Math.abs(normal.x - 165));
  });
});
