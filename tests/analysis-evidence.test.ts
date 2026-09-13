import { describe, expect, it } from "vitest";

import {
  anchorPositions,
  confidenceBandCopy,
  jointConeSummary,
  primaryFinding,
} from "@/lib/skeleton/analysis-evidence";
import { buildTwoViewRepresentativeProfile } from "@/lib/shooting-profile/two-view-pipeline";
import { PERSISTED_JOINT_NAMES_V2, type RepresentativePose4DV2 } from "@/lib/shooting-profile/types";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

function syntheticProfile(mode: "basic_1_plus_1" | "high_accuracy_3_plus_3" = "basic_1_plus_1"): RepresentativePose4DV2 {
  const session = syntheticLandmarkSession({ mode, shootingHand: "right" });
  const result = buildTwoViewRepresentativeProfile({
    mode,
    shootingHand: "right",
    attempts: [...session.front, ...session.shootingSide].map((sequence) => ({
      id: `${sequence.view}-${sequence.takeIndex}`,
      sequence,
    })),
  });
  if (result.status !== "complete") throw new Error("fixture must reconstruct");
  return result.profile;
}

const profile = syntheticProfile();

describe("analysis evidence", () => {
  it("summarises the stored heuristic_v1 cones per joint, largest first, without recomputing them", () => {
    const cones = jointConeSummary(profile);

    expect(cones.map((cone) => cone.joint).sort()).toEqual([...PERSISTED_JOINT_NAMES_V2].sort());
    for (let index = 1; index < cones.length; index += 1) {
      expect(cones[index - 1].maxConeDegrees).toBeGreaterThanOrEqual(cones[index].maxConeDegrees);
    }
    for (const cone of cones) {
      const stored = profile.frames.map((frame) => frame.uncertainty[cone.joint].directionalConeDegrees);
      expect(cone.maxConeDegrees).toBe(Math.max(...stored));
      expect(cone.meanConeDegrees).toBeCloseTo(stored.reduce((sum, value) => sum + value, 0) / stored.length, 9);
      expect(cone.label.length).toBeGreaterThan(0);
    }
  });

  it("states the one finding the record supports: the least certain joint and its cone", () => {
    const finding = primaryFinding(profile);
    const [largest] = jointConeSummary(profile);

    expect(finding.joint).toBe(largest.joint);
    expect(finding.line).toContain(largest.label);
    expect(finding.line).toContain(`${Math.round(largest.maxConeDegrees)}°`);
    expect(finding.line).not.toMatch(/실측|actual|정확/);
  });

  it("reports the five anchors as percentages of the normalized shot", () => {
    const anchors = anchorPositions(profile);
    expect(anchors.map((anchor) => anchor.id)).toEqual(["ready", "deepestDip", "rise", "releaseProxy", "followThrough"]);
    expect(anchors.map((anchor) => anchor.percent)).toEqual([0, 25, 50, 75, 100]);
    expect(anchors.map((anchor) => anchor.label)).toEqual(["준비", "딥", "상승", "릴리스 추정", "팔로우스루"]);
  });

  it("maps mode and quality to a band and never to a score", () => {
    expect(confidenceBandCopy(profile)).toEqual({ band: "basic", title: "Basic · 대표 스냅샷", quality: "품질 통과" });
    expect(confidenceBandCopy(syntheticProfile("high_accuracy_3_plus_3")).band).toBe("high");
    expect(confidenceBandCopy({ ...profile, quality: { passed: false, reasons: ["x"] } }).quality).toBe("재촬영 필요");
    expect(JSON.stringify(confidenceBandCopy(profile))).not.toMatch(/%/);
  });
});
