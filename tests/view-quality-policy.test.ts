import { describe, expect, it } from "vitest";

import {
  getCriticalLandmarkIndices,
  getRequiredShootingArmLandmarks,
} from "@/lib/shooting-profile/view-quality-policy";

const LOWER_BODY_CRITICAL = [23, 24, 25, 26, 27, 28] as const;

describe("view-aware pose quality policy", () => {
  it("preserves the legacy front critical-joint policy exactly", () => {
    const expected = [11, 12, 15, 16, ...LOWER_BODY_CRITICAL];
    expect(getCriticalLandmarkIndices("front", "right")).toEqual(expected);
    expect(getCriticalLandmarkIndices("front", "left")).toEqual(expected);
  });

  it("requires the anatomical right shooting arm but not the far left wrist in right-handed side view", () => {
    expect(getRequiredShootingArmLandmarks("right")).toEqual([12, 14, 16]);
    expect(getCriticalLandmarkIndices("shooting_side", "right")).toEqual([
      12,
      14,
      16,
      ...LOWER_BODY_CRITICAL,
    ]);
    expect(getCriticalLandmarkIndices("shooting_side", "right")).not.toContain(15);
  });

  it("mirrors the shooting-arm policy for left-handed side view", () => {
    expect(getRequiredShootingArmLandmarks("left")).toEqual([11, 13, 15]);
    expect(getCriticalLandmarkIndices("shooting_side", "left")).toEqual([
      11,
      13,
      15,
      ...LOWER_BODY_CRITICAL,
    ]);
    expect(getCriticalLandmarkIndices("shooting_side", "left")).not.toContain(16);
  });
});
