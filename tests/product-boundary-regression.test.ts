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
      expect(analysis.state).toMatch(/auto_corrected_estimate_not_actual_3d$/);
      expect(analysis.sourcePhaseTimestampsMs).toHaveLength(5);
      expect(analysis.sourcePhaseTimestampsMs.every((timestamp, index, all) => index === 0 || timestamp > all[index - 1])).toBe(true);
      expect(analysis.formMatch?.find((check) => check.id === "form_details_unavailable")?.status).toBe("unavailable");
    });
  });

  it("uses the adult-ratio display template without changing the analysis-only boundary", () => {
    for (const filename of ["curry-front-side-auto-corrected-analysis-01.json", "paul-george-side-auto-corrected-analysis-01.json"]) {
      const asset = JSON.parse(readFileSync(resolve(process.cwd(), "lib/motions", filename), "utf8")) as {
        boundary: string;
        autoCorrection: { boneLength: string; templateId: string; trajectory: string; targetBoneLengths: Record<string, number> };
        motion: { frames: { joints: Record<string, { x: number; y: number; z: number }> }[] };
      };
      expect(asset.boundary).toBe("monocular_relative_pose_not_metric_3d");
      expect(asset.autoCorrection).toMatchObject({
        boneLength: "adult_joint_center_ratio_scaled_to_median_shoulder_breadth",
        templateId: "adult_joint_center_shoulder_scaled_v1",
        trajectory: "source_joint_directions_and_phase_order_preserved",
      });
      for (const frame of asset.motion.frames) {
        for (const [bone, target] of Object.entries(asset.autoCorrection.targetBoneLengths)) {
          const [parent, child] = bone.split("->");
          const a = frame.joints[parent]; const b = frame.joints[child];
          expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeCloseTo(target, 5);
        }
      }
    }
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
