import { describe, expect, it } from "vitest";

import { ANONYMOUS_POSE_REFERENCES, ANONYMOUS_POSE_LIBRARY_STATUS } from "@/lib/anonymous-pose-library";
import { applyGoalSelection, createDefaultProfile, getGoalApplicationSummary, recommendShotForms } from "@/lib/recommendation";

describe("real-video model rebuild state", () => {
  it("withdraws all generated reference motions from the active product library", () => {
    expect(ANONYMOUS_POSE_REFERENCES).toHaveLength(0);
    expect(ANONYMOUS_POSE_LIBRARY_STATUS.profileCount).toBe(0);
    expect(ANONYMOUS_POSE_LIBRARY_STATUS.legacyGeneratedReferences).toBe("withdrawn_not_product_eligible");
  });
  it("keeps the user goal as a private practice preference without inventing a model rank", () => {
    const releaseProfile = applyGoalSelection(createDefaultProfile(), "release");
    expect(releaseProfile.goal).toBe("release");
    expect(releaseProfile.preferredStyle).toBe("high-release");
    expect(recommendShotForms(releaseProfile)).toEqual([]);
    expect(getGoalApplicationSummary("release")).toContain("높은 공의 출발점");
  });
});
