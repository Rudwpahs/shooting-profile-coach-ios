import { describe, expect, it } from "vitest";

import { ANONYMOUS_POSE_LIBRARY_STATUS, ANONYMOUS_POSE_REFERENCES, PLAYER_MONOCULAR_3D_ANALYSES, PLAYER_SOURCE_SKELETON_REVIEWS, PLAYER_VIDEO_REVIEW_RECORDS } from "@/lib/anonymous-pose-library";
import { BONE_LINKS, clampPoseZoom, getPoseCameraPresets, interpolatePoseFrame, POSE_ZOOM_MAX, POSE_ZOOM_MIN, projectPosePoint, validatePoseMotion } from "@/lib/pose-motion";

describe("approved actual optical-mocap pose motion", () => {
  it("uses a validated five-phase measured motion with a high follow-through", () => {
    const motion = ANONYMOUS_POSE_REFERENCES[0].motion;
    const quality = validatePoseMotion(motion);
    expect(ANONYMOUS_POSE_REFERENCES).toHaveLength(1);
    expect(ANONYMOUS_POSE_REFERENCES.map((reference) => reference.id)).toEqual(["cmu-shoot-01"]);
    expect(ANONYMOUS_POSE_LIBRARY_STATUS.visiblePlayerIdentity).toBe(false);
    expect(ANONYMOUS_POSE_REFERENCES[0].prototypeDisplayName).toBeUndefined();
    expect(PLAYER_VIDEO_REVIEW_RECORDS).toHaveLength(2);
    expect(ANONYMOUS_POSE_LIBRARY_STATUS.withdrawnVideoReviewCount).toBe(2);
    expect(PLAYER_VIDEO_REVIEW_RECORDS[0]).toMatchObject({ playerDisplayName: "Stephen Curry", boundary: "monocular_relative_pose_not_metric_3d", state: "withdrawn_unreconstructed_single_view" });
    expect(PLAYER_VIDEO_REVIEW_RECORDS[0]).not.toHaveProperty("motion");
    expect(PLAYER_VIDEO_REVIEW_RECORDS[0].sourcePhaseTimestampsMs).toEqual([0, 1002, 1503, 2088, 2422]);
    expect(PLAYER_VIDEO_REVIEW_RECORDS[1].sourcePhaseTimestampsMs).toEqual([2000, 2667, 2833, 3000, 3250]);
    expect(PLAYER_SOURCE_SKELETON_REVIEWS.map((review) => review.displayName)).toEqual(["Stephen Curry", "Paul George"]);
    expect(PLAYER_SOURCE_SKELETON_REVIEWS).toHaveLength(2);
    expect(PLAYER_MONOCULAR_3D_ANALYSES).toHaveLength(4);
    expect(PLAYER_MONOCULAR_3D_ANALYSES[0]).toMatchObject({
      id: "curry-front-constrained-analysis-01",
      displayName: "Stephen Curry",
      boundary: "monocular_relative_pose_not_metric_3d",
      state: "video_based_depth_limited_estimate_not_actual_3d",
      sourcePhaseTimestampsMs: [0, 1002, 1503, 2088, 2422],
    });
    expect(PLAYER_MONOCULAR_3D_ANALYSES[0].motion.frames[4].joints.rightWrist.y).toBeGreaterThan(PLAYER_MONOCULAR_3D_ANALYSES[0].motion.frames[4].joints.rightShoulder.y);
    expect(PLAYER_MONOCULAR_3D_ANALYSES[1]).toMatchObject({
      id: "curry-front-side-dual-view-analysis-01",
      displayName: "Stephen Curry",
      boundary: "monocular_relative_pose_not_metric_3d",
      state: "dual_view_phase_aligned_estimate_not_actual_3d",
      sourcePhaseTimestampsMs: [0, 1002, 1503, 2088, 2422],
    });
    expect(PLAYER_MONOCULAR_3D_ANALYSES[2]).toMatchObject({
      id: "curry-front-side-auto-corrected-analysis-01",
      state: "dual_view_auto_corrected_estimate_not_actual_3d",
      boundary: "monocular_relative_pose_not_metric_3d",
      sourcePhaseTimestampsMs: [0, 1002, 1503, 2088, 2422],
    });
    expect(PLAYER_MONOCULAR_3D_ANALYSES[2].formMatch?.find((check) => check.id === "release_wrist_height")?.status).toBe("match");
    expect(PLAYER_MONOCULAR_3D_ANALYSES[3]).toMatchObject({
      id: "paul-george-side-auto-corrected-analysis-01",
      displayName: "Paul George",
      state: "single_view_auto_corrected_estimate_not_actual_3d",
      boundary: "monocular_relative_pose_not_metric_3d",
      sourcePhaseTimestampsMs: [0, 65, 355, 645, 742],
    });
    expect(PLAYER_MONOCULAR_3D_ANALYSES[3].formMatch?.find((check) => check.id === "release_wrist_height")?.status).toBe("match");
    expect(PLAYER_MONOCULAR_3D_ANALYSES.map((analysis) => analysis.motion.boundary)).toEqual(["monocular_relative_pose_not_metric_3d", "monocular_relative_pose_not_metric_3d", "monocular_relative_pose_not_metric_3d", "monocular_relative_pose_not_metric_3d"]);
    for (const review of PLAYER_SOURCE_SKELETON_REVIEWS) {
      expect(review).toMatchObject({ boundary: "single_view_2d_skeleton_review", state: "review_only_not_3d" });
      expect(review.phases.map((phase) => phase.label)).toEqual(["준비", "딥", "상승", "릴리스", "팔로우스루"]);
      expect(review.phases).toHaveLength(5);
      expect(review.phases.every((phase) => phase.landmarks.length === 33 && phase.landmarks.every((landmark) => !Object.hasOwn(landmark, "z")))).toBe(true);
    }
    expect(motion.boundary).toBe("actual_optical_mocap_3d");
    expect(motion.frames.map((frame) => frame.label)).toEqual(["준비", "딥", "상승", "릴리스", "팔로우스루"]);
    expect(ANONYMOUS_POSE_REFERENCES[0].sourcePhaseFrames).toEqual([269, 317, 335, 353, 385]);
    expect(quality).toMatchObject({ passed: true, failures: [] });
    const follow = motion.frames[4].joints;
    expect(follow.rightWrist.y).toBeGreaterThanOrEqual(follow.rightShoulder.y + 0.62);
    expect(follow.rightWrist.y).toBeGreaterThanOrEqual(follow.head.y - 0.08);
    expect(BONE_LINKS).toContainEqual(["rightElbow", "rightWrist"]);
  });
  it("derives front, oblique, and shooting-arm side views only from the measured 3D release shoulder line", () => {
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
  it("renders fluid display interpolation without modifying audited phase endpoints", () => {
    const motion = ANONYMOUS_POSE_REFERENCES[0].motion;
    const start = interpolatePoseFrame(motion, 0);
    const midpoint = interpolatePoseFrame(motion, 0.125);
    const end = interpolatePoseFrame(motion, 1);
    expect(start.joints.rightWrist).toEqual(motion.frames[0].joints.rightWrist);
    expect(end.joints.rightWrist).toEqual(motion.frames[4].joints.rightWrist);
    expect(midpoint.startPhaseIndex).toBe(0);
    expect(midpoint.endPhaseIndex).toBe(1);
    expect(midpoint.joints.rightWrist.y).toBeGreaterThanOrEqual(Math.min(motion.frames[0].joints.rightWrist.y, motion.frames[1].joints.rightWrist.y));
    expect(midpoint.joints.rightWrist.y).toBeLessThanOrEqual(Math.max(motion.frames[0].joints.rightWrist.y, motion.frames[1].joints.rightWrist.y));
  });
});
