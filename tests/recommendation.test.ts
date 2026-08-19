import { describe, expect, it } from "vitest";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { applyGoalSelection, createDefaultProfile, getGoalApplicationSummary, recommendShotForms, type UserShotProfile } from "@/lib/recommendation";

describe("anonymous sixteen-form recommendation", () => {
  it("contains sixteen source-free and player-name-free pose references", () => {
    expect(ANONYMOUS_POSE_REFERENCES).toHaveLength(16);
    const serialized = JSON.stringify(ANONYMOUS_POSE_REFERENCES).toLowerCase();
    ["curry", "booker", "durant", "lebron", "http", "player_key"].forEach((token) => expect(serialized).not.toContain(token));
  });
  it("changes the ranked recommendation from one directly applied goal selection", () => {
    const profile: UserShotProfile = { ...createDefaultProfile(), goal: "release", preferredStyle: "high-release", body: { stature: "extended", reach: "extended", lowerBodyPower: "balanced", shoulderMobility: "extended" } };
    const results = recommendShotForms(profile);
    expect(results).toHaveLength(16);
    expect(results[0].fitScore).toBeGreaterThanOrEqual(results[1].fitScore);
    expect(results[0].bodyFitScore).toBeGreaterThanOrEqual(28);
    expect(results[0].reasons).toHaveLength(3);
  });
  it("uses different score targets for range and release rather than storing an unused preference", () => {
    const rangeProfile = applyGoalSelection(createDefaultProfile(), "range");
    const releaseProfile = applyGoalSelection(createDefaultProfile(), "release");
    const rangeResults = recommendShotForms(rangeProfile);
    const releaseResults = recommendShotForms(releaseProfile);
    expect(rangeResults[0].reference.id).not.toBe(releaseResults[0].reference.id);
    expect(rangeResults[0].reasons[0]).toContain("거리");
    expect(getGoalApplicationSummary("release")).toContain("높은 공의 출발점");
  });
  it("keeps all results bounded and explicitly non-metric", () => {
    const results = recommendShotForms(createDefaultProfile());
    results.forEach((result) => {
      expect(result.fitScore).toBeGreaterThanOrEqual(35);
      expect(result.fitScore).toBeLessThanOrEqual(96);
      expect(result.confidence).toBe("youtube_pose_candidate");
      expect(result.reference.modelBoundary).toBe("single_view_camera_relative_pose");
    });
  });
});
