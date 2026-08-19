import { describe, expect, it } from "vitest";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { BONE_LINKS, buildPoseMotion, clampPoseZoom, POSE_ZOOM_MAX, POSE_ZOOM_MIN, projectPosePoint, validatePoseMotion } from "@/lib/pose-motion";

describe("relative pose motion viewer model", () => {
  it("creates five ordered shooting phases for an anonymous reference", () => {
    const motion = buildPoseMotion(ANONYMOUS_POSE_REFERENCES[0]);
    expect(motion.frames.map((frame) => frame.label)).toEqual(["준비", "딥", "상승", "릴리스", "팔로우스루"]);
    expect(motion.boundary).toBe("biomechanical_reference_animation_not_metric_3d");
    expect(BONE_LINKS).toContainEqual(["rightElbow", "rightWrist"]);
  });
  it("changes projected pose coordinates when the camera angle changes", () => {
    const front = projectPosePoint({ x: 0.5, y: 1.2, z: 0.25 }, 0, 8);
    const side = projectPosePoint({ x: 0.5, y: 1.2, z: 0.25 }, 82, 8);
    expect(front.x).not.toBeCloseTo(side.x);
  });
  it("keeps pinch zoom within stable limits and changes the projected scale", () => {
    expect(clampPoseZoom(0.1)).toBe(POSE_ZOOM_MIN);
    expect(clampPoseZoom(4)).toBe(POSE_ZOOM_MAX);
    const normal = projectPosePoint({ x: 0.5, y: 1.2, z: 0.25 }, 38, 8, 330, 270, 1);
    const zoomed = projectPosePoint({ x: 0.5, y: 1.2, z: 0.25 }, 38, 8, 330, 270, 1.5);
    expect(Math.abs(zoomed.x - 165)).toBeGreaterThan(Math.abs(normal.x - 165));
  });
  it("keeps every anonymous reference inside the biomechanical phase quality gate", () => {
    ANONYMOUS_POSE_REFERENCES.forEach((reference) => {
      const quality = validatePoseMotion(buildPoseMotion(reference));
      expect(quality.passed, `${reference.id}: ${quality.failures.join(",")}`).toBe(true);
      expect(quality.maxJointStep).toBeLessThanOrEqual(1.1);
    });
  });
  it("keeps the full library anonymous and explicitly non-metric", () => {
    expect(ANONYMOUS_POSE_REFERENCES).toHaveLength(16);
    ANONYMOUS_POSE_REFERENCES.forEach((reference) => {
      expect(reference.evidenceState).toBe("summary_derived_biomechanical_reference_animation");
      expect(reference.modelBoundary).toBe("non_metric_reference_animation");
      expect(["needs_manual_clip_selection", "rejected_for_direct_sequence_use"]).toContain(reference.sourceSequenceStatus);
    });
    const serialized = JSON.stringify(ANONYMOUS_POSE_REFERENCES).toLowerCase();
    ["curry", "booker", "durant", "youtube", "http"].forEach((token) => expect(serialized).not.toContain(token));
  });
  it("does not add player identity or source URL to viewable motion data", () => {
    const serialized = JSON.stringify(buildPoseMotion(ANONYMOUS_POSE_REFERENCES[0])).toLowerCase();
    ["curry", "booker", "youtube", "http"].forEach((token) => expect(serialized).not.toContain(token));
  });
});
