import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ANONYMOUS_POSE_REFERENCES, PLAYER_MONOCULAR_3D_ANALYSES } from "@/lib/anonymous-pose-library";
import { validatePoseMotion } from "@/lib/pose-motion";

describe("fixed product motion boundary", () => {
  it("keeps one approved optical reference separate from the two analysis-only player motions", () => {
    expect(ANONYMOUS_POSE_REFERENCES).toHaveLength(1);
    expect(ANONYMOUS_POSE_REFERENCES[0]).toMatchObject({ id: "cmu-shoot-01", modelBoundary: "actual_optical_mocap_3d" });
    expect(validatePoseMotion(ANONYMOUS_POSE_REFERENCES[0].motion)).toMatchObject({ passed: true, failures: [] });
    expect(PLAYER_MONOCULAR_3D_ANALYSES.map((analysis) => analysis.id)).toEqual([
      "curry-front-side-auto-corrected-analysis-01",
      "paul-george-side-auto-corrected-analysis-01",
    ]);
    PLAYER_MONOCULAR_3D_ANALYSES.forEach((analysis) => {
      expect(analysis.boundary).toBe("monocular_relative_pose_not_metric_3d");
      expect(analysis.state).toMatch(/estimate_not_actual_3d$/);
      expect(analysis.sourcePhaseTimestampsMs).toHaveLength(5);
      expect(analysis.sourcePhaseTimestampsMs.every((timestamp, index, all) => index === 0 || timestamp > all[index - 1])).toBe(true);
      expect(analysis.formMatch?.find((check) => check.id === "form_details_unavailable")?.status).toBe("unavailable");
    });
    expect(PLAYER_MONOCULAR_3D_ANALYSES.find((analysis) => analysis.id === "curry-front-side-auto-corrected-analysis-01")).toMatchObject({
      shootingHand: "left",
      sourcePhaseTimestampsMs: [0, 1153, 1657, 2162, 2738],
    });
  });

  it("keeps Curry source-faithful 2D depth-free and Paul George's adult-ratio correction analysis-only", () => {
    for (const filename of ["curry-front-side-auto-corrected-analysis-01.json", "paul-george-side-auto-corrected-analysis-01.json"]) {
      const asset = JSON.parse(readFileSync(resolve(process.cwd(), "lib/motions", filename), "utf8")) as {
        boundary: string;
        state: string;
        productAdmission?: string;
        imageTo3DLift?: { method: string; externalModelExecution: string };
        autoCorrection: { boneLength: string; templateId: string; trajectory: string; targetBoneLengths: Record<string, number> };
        motion: { frames: { joints: Record<string, { x: number; y: number; z: number }> }[] };
      };
      expect(asset.boundary).toBe("monocular_relative_pose_not_metric_3d");
      if (filename.startsWith("curry")) {
        expect(asset.autoCorrection).toMatchObject({
          boneLength: "median_motionbert_lifted_3d_bone_length",
          templateId: "curry_motionbert_h36m_temporal_lift_v1",
          trajectory: "retained_source_2d_xy_with_motionbert_temporal_depth_and_median_3d_bone_stabilization",
        });
        expect(asset.state).toBe("image_lifted_pose_estimate_not_actual_3d");
        expect(asset.productAdmission).toBe("forbidden_for_recommendation_and_actual_3d_library");
        expect(asset.imageTo3DLift).toMatchObject({ method: "motionbert_h36m_finetuned_temporal_2d_to_3d_lift_v1", externalModelExecution: "executed_cpu" });
        expect(asset.motion.frames.some((frame) => Object.values(frame.joints).some((joint) => Math.abs(joint.z) > 0.01))).toBe(true);
      } else {
        expect(asset.autoCorrection).toMatchObject({
          boneLength: "adult_joint_center_ratio_scaled_to_median_shoulder_breadth",
          templateId: "adult_joint_center_shoulder_scaled_v1",
          trajectory: "source_joint_directions_and_phase_order_preserved",
        });
      }
      for (const frame of asset.motion.frames) {
        for (const [bone, target] of Object.entries(asset.autoCorrection.targetBoneLengths)) {
          const [parent, child] = bone.split("->");
          const a = frame.joints[parent]; const b = frame.joints[child];
          expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeCloseTo(target, 5);
        }
      }
    }
  });

  it("does not promote Curry to actual 3D when the independent fixed-F gate rejects the source pair", () => {
    const admission = JSON.parse(readFileSync(resolve(process.cwd(), "artifacts/curry-actual-3d-reevaluation/front-side-admission.json"), "utf8")) as {
      boundary: string; state: string; fixedF: { inlierRatio: number; minimumInlierRatio: number }; quality: { reasons: string[] }; productAdmission: string;
    };
    expect(admission).toMatchObject({
      boundary: "uncalibrated_projective_3d_review_only",
      state: "rejected",
      productAdmission: "forbidden_without_calibrated_multi_view_3d",
    });
    expect(admission.fixedF.inlierRatio).toBeLessThan(admission.fixedF.minimumInlierRatio);
    expect(admission.quality.reasons).toContain("fixed_f_inlier_ratio_below_threshold");
    expect(ANONYMOUS_POSE_REFERENCES.map((reference) => reference.modelBoundary)).toEqual(["actual_optical_mocap_3d"]);
  });

  it("does not retain withdrawn player analysis assets or expose intermediate reviews in the product Library", () => {
    const root = resolve(process.cwd(), "lib/motions");
    expect(existsSync(resolve(root, "curry-front-constrained-analysis-01.json"))).toBe(false);
    expect(existsSync(resolve(root, "curry-front-side-dual-view-analysis-01.json"))).toBe(false);
    const libraryScreen = readFileSync(resolve(process.cwd(), "app/(tabs)/library.tsx"), "utf8");
    expect(libraryScreen).not.toContain("PLAYER_SOURCE_SKELETON_REVIEWS");
    expect(libraryScreen).not.toContain("PLAYER_VIDEO_REVIEW_RECORDS");
  });
});
