import { describe, expect, it } from "vitest";

import { ANONYMOUS_POSE_LIBRARY_STATUS, ANONYMOUS_POSE_REFERENCES, PLAYER_VIDEO_POSE_CANDIDATES } from "@/lib/anonymous-pose-library";
import { BONE_LINKS, clampPoseZoom, getPoseCameraPresets, POSE_ZOOM_MAX, POSE_ZOOM_MIN, projectPosePoint, validatePoseMotion } from "@/lib/pose-motion";

describe("approved actual optical-mocap pose motion", () => {
  it("uses a validated five-phase measured motion with a high follow-through", () => {
    const motion = ANONYMOUS_POSE_REFERENCES[0].motion;
    const quality = validatePoseMotion(motion);
    expect(ANONYMOUS_POSE_LIBRARY_STATUS.visiblePlayerIdentity).toBe(false);
    expect(ANONYMOUS_POSE_REFERENCES[0].prototypeDisplayName).toBeUndefined();
    expect(PLAYER_VIDEO_POSE_CANDIDATES).toHaveLength(2);
    expect(PLAYER_VIDEO_POSE_CANDIDATES[0]).toMatchObject({ playerDisplayName: "Stephen Curry", boundary: "monocular_relative_pose_not_metric_3d", state: "candidate_not_product_approved" });
    expect(PLAYER_VIDEO_POSE_CANDIDATES[0].sourcePhaseTimestampsMs).toEqual([0, 1002, 1503, 2088, 2422]);
    expect(PLAYER_VIDEO_POSE_CANDIDATES[1].sourcePhaseTimestampsMs).toEqual([2000, 2667, 2833, 3000, 3250]);
    expect(motion.boundary).toBe("actual_optical_mocap_3d");
    expect(motion.frames.map((frame) => frame.label)).toEqual(["준비", "딥", "상승", "릴리스", "팔로우스루"]);
    expect(ANONYMOUS_POSE_REFERENCES[0].sourcePhaseFrames).toEqual([269, 317, 335, 353, 385]);
    expect(quality).toMatchObject({ passed: true, failures: [] });
    const follow = motion.frames[4].joints;
    expect(follow.rightWrist.y).toBeGreaterThanOrEqual(follow.rightShoulder.y + 0.62);
    expect(follow.rightWrist.y).toBeGreaterThanOrEqual(follow.head.y - 0.08);
    expect(BONE_LINKS).toContainEqual(["rightElbow", "rightWrist"]);
  });
  it("derives front, oblique, and shooting-arm side views from the measured release shoulder line", () => {
    expect(clampPoseZoom(0.1)).toBe(POSE_ZOOM_MIN);
    expect(clampPoseZoom(4)).toBe(POSE_ZOOM_MAX);
    const motion = ANONYMOUS_POSE_REFERENCES[0].motion;
    const [frontView, obliqueView, sideView] = getPoseCameraPresets(motion, "right");
    expect([frontView.label, obliqueView.label, sideView.label]).toEqual(["정면", "사선", "측면"]);
    expect(frontView.yaw).toBeCloseTo(153.47, 1);
    expect(obliqueView.yaw).toBeCloseTo(108.47, 1);
    expect(sideView.yaw).toBeCloseTo(63.47, 1);
    const release = motion.frames.find((frame) => frame.label === "릴리스")!.joints;
    const frontLeftShoulder = projectPosePoint(release.leftShoulder, frontView.yaw, 0);
    const frontRightShoulder = projectPosePoint(release.rightShoulder, frontView.yaw, 0);
    expect(frontLeftShoulder.depth).toBeCloseTo(frontRightShoulder.depth, 3);
    const front = projectPosePoint({ x: 0.5, y: 1.2, z: 0.25 }, frontView.yaw, 8);
    const side = projectPosePoint({ x: 0.5, y: 1.2, z: 0.25 }, sideView.yaw, 8);
    expect(front.x).not.toBeCloseTo(side.x);
    const normal = projectPosePoint({ x: 0.5, y: 1.2, z: 0.25 }, frontView.yaw, 8, 330, 270, 1);
    const enlarged = projectPosePoint({ x: 0.5, y: 1.2, z: 0.25 }, frontView.yaw, 8, 330, 270, 1.3);
    expect(Math.abs(enlarged.x - 165)).toBeGreaterThan(Math.abs(normal.x - 165));
  });
});
