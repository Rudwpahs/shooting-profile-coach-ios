import { describe, expect, it } from "vitest";

import { REFERENCE_ARCHETYPES } from "@/lib/reference-library";
import { createDefaultProfile, recommendArchetypes, type UserShotProfile } from "@/lib/recommendation";

describe("anonymous reference recommendation", () => {
  it("keeps player names and source links out of app-visible archetypes", () => {
    const serialized = JSON.stringify(REFERENCE_ARCHETYPES).toLowerCase();
    ["curry", "booker", "durant", "lebron", "youtube", "http"].forEach((token) => {
      expect(serialized).not.toContain(token);
    });
  });

  it("uses the stated training goal to prioritize a named-free archetype", () => {
    const profile: UserShotProfile = {
      ...createDefaultProfile(),
      goal: "range",
      traits: { releaseElevation: 50, armExtension: 50, lowerBodyDrive: 50, rhythm: 50 },
    };
    expect(recommendArchetypes(profile)[0].archetype.id).toBe("rhythm-drive");
  });

  it("never reports a provisional aggregate as verified", () => {
    const result = recommendArchetypes(createDefaultProfile())[0];
    expect(result.confidence).toBe("provisional");
    expect(result.archetype.evidenceState).toBe("provisional_legacy_aggregate");
  });

  it("keeps scores within a comprehensible bounded range", () => {
    const results = recommendArchetypes({
      ...createDefaultProfile(),
      traits: { releaseElevation: 100, armExtension: 0, lowerBodyDrive: 100, rhythm: 0 },
    });
    results.forEach((result) => expect(result.fitScore).toBeGreaterThanOrEqual(40));
    results.forEach((result) => expect(result.fitScore).toBeLessThanOrEqual(96));
  });
});
