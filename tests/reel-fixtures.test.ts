import { describe, expect, it } from "vitest";

import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { reelLabFixtures, representativeFixtureFromMotion } from "@/lib/feed/reel-fixtures";
import { reelAccessibilityName, reelLabel, reelLine } from "@/lib/feed/reel-model";
import { parseRepresentativePose4D } from "@/lib/shooting-profile/codec";
import { PERSISTED_JOINT_NAMES_V2 } from "@/lib/shooting-profile/types";

const reference = ANONYMOUS_POSE_REFERENCES[0];

describe("representativeFixtureFromMotion", () => {
  const profile = representativeFixtureFromMotion(reference.motion, "right");

  it("is a schema-valid representative profile with the boundary literal intact", () => {
    expect(() => parseRepresentativePose4D(JSON.parse(JSON.stringify(profile)))).not.toThrow();
    expect(profile.boundary).toBe("representative_phase_fused_4d_estimate_not_actual_3d");
    expect(profile.schemaVersion).toBe(2);
    expect(profile.mode).toBe("basic_1_plus_1");
    expect(profile.units).toBe("template_shoulder_breadths");
    expect(profile.quality).toEqual({ passed: true, reasons: [] });
  });

  it("stores 101 phases of the 12 persisted joints, pelvis-centred, in shoulder breadths", () => {
    expect(profile.frames).toHaveLength(101);
    expect(profile.frames[0].phase).toBe(0);
    expect(profile.frames[100].phase).toBe(1);
    expect(profile.phaseAnchors.map((anchor) => anchor.id)).toEqual(["ready", "deepestDip", "rise", "releaseProxy", "followThrough"]);
    for (const frame of profile.frames) {
      expect(Object.keys(frame.joints).sort()).toEqual([...PERSISTED_JOINT_NAMES_V2].sort());
      const pelvis = {
        x: (frame.joints.leftHip.x + frame.joints.rightHip.x) / 2,
        y: (frame.joints.leftHip.y + frame.joints.rightHip.y) / 2,
        z: (frame.joints.leftHip.z + frame.joints.rightHip.z) / 2,
      };
      expect(Math.abs(pelvis.x) + Math.abs(pelvis.y) + Math.abs(pelvis.z)).toBeLessThan(1e-9);
      for (const joint of PERSISTED_JOINT_NAMES_V2) {
        expect(frame.uncertainty[joint].model).toBe("heuristic_v1");
        expect(frame.uncertainty[joint].directionalConeDegrees).toBeGreaterThan(0);
      }
    }
    const ready = profile.frames[0].joints;
    const breadth = Math.hypot(
      ready.leftShoulder.x - ready.rightShoulder.x,
      ready.leftShoulder.y - ready.rightShoulder.y,
      ready.leftShoulder.z - ready.rightShoulder.z,
    );
    expect(breadth).toBeCloseTo(1, 6);
  });

  it("is deterministic", () => {
    expect(representativeFixtureFromMotion(reference.motion, "right")).toEqual(profile);
  });
});

describe("reelLabFixtures", () => {
  const items = reelLabFixtures();

  it("gives the harness one of each Reel family with unique ids", () => {
    expect(items.map((item) => item.kind)).toEqual(["user", "coach", "reference"]);
    expect(new Set(items.map((item) => item.id)).size).toBe(3);
    expect(items[2].motion.source).toBe("reference");
    expect(items[0].motion.source).toBe("representative");
  });

  it("keeps the text budget: one short line each, no numbers or dashboards on the coach reel", () => {
    for (const item of items) {
      expect(reelLine(item)).not.toContain("\n");
      expect(reelLine(item).length).toBeLessThanOrEqual(40);
      expect(reelLabel(item)).not.toContain("\n");
      expect(reelAccessibilityName(item).length).toBeGreaterThan(0);
    }
    const coach = items[1];
    expect(coach.kind).toBe("coach");
    expect(reelLine(coach)).not.toMatch(/[0-9%]/);
    // The label is the cue label the frozen Coach contract resolved, never fixture prose.
    expect(reelLabel(coach)).toBe("코치 · 릴리스 팔꿈치 정렬");
  });

  it("never names a real athlete", () => {
    const text = JSON.stringify(items.map((item) => [reelLabel(item), reelLine(item), reelAccessibilityName(item)]));
    expect(text).not.toMatch(/Curry|Paul George|PLAYER_/);
  });
});
