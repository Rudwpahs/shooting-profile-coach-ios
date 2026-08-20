import { describe, expect, it } from "vitest";

import { ANONYMOUS_POSE_REFERENCES, ANONYMOUS_POSE_LIBRARY_STATUS } from "@/lib/anonymous-pose-library";
import { applyGoalSelection, createDefaultProfile, getGoalApplicationSummary, recommendShotForms } from "@/lib/recommendation";

describe("actual optical-mocap model library", () => {
  it("keeps generated references withdrawn while exposing only the approved anonymous optical motion", () => {
    expect(ANONYMOUS_POSE_REFERENCES).toHaveLength(1);
    expect(ANONYMOUS_POSE_LIBRARY_STATUS.profileCount).toBe(1);
    expect(ANONYMOUS_POSE_LIBRARY_STATUS.legacyGeneratedReferences).toBe("withdrawn_not_product_eligible");
    expect(ANONYMOUS_POSE_REFERENCES[0]).toMatchObject({
      id: "cmu-shoot-01",
      evidenceState: "validated_actual_optical_mocap",
      modelBoundary: "actual_optical_mocap_3d",
      sourceSequenceStatus: "approved_actual_optical_mocap",
    });
  });
  it("uses the one selected goal to score only approved anonymous motions", () => {
    const releaseProfile = applyGoalSelection(createDefaultProfile(), "release");
    const rhythmProfile = applyGoalSelection(createDefaultProfile(), "rhythm");
    expect(releaseProfile.goal).toBe("release");
    expect(releaseProfile.preferredStyle).toBe("high-release");
    expect(recommendShotForms(releaseProfile)).toHaveLength(1);
    expect(recommendShotForms(releaseProfile)[0].id).toBe("cmu-shoot-01");
    expect(recommendShotForms(releaseProfile)[0].matchScore).toBeGreaterThan(recommendShotForms(rhythmProfile)[0].matchScore);
    expect(getGoalApplicationSummary("release")).toContain("높은 공의 출발점");
  });
});
