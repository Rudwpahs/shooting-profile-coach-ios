import { describe, expect, it } from "vitest";

import {
  COACH_CONFIDENCE_CAPS,
  COACH_CONFIDENCE_CONE_THRESHOLDS_DEG,
  capConfidence,
  confidenceFromCone,
  jointConeDegrees,
  measurementConfidence,
  observationConfidence,
} from "@/lib/coach/confidence-map";
import { buildCoachObservations, representativeFrameAt } from "@/lib/coach/representative-profile-adapter";
import type { RepresentativePose4DV2, RepresentativePoseFrameV2 } from "@/lib/shooting-profile/types";
import { buildTwoViewRepresentativeProfile } from "@/lib/shooting-profile/two-view-pipeline";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

function profileFor(mode: "basic_1_plus_1" | "high_accuracy_3_plus_3"): RepresentativePose4DV2 {
  const session = syntheticLandmarkSession({ mode, shootingHand: "right" });
  const result = buildTwoViewRepresentativeProfile({
    mode,
    shootingHand: "right",
    attempts: [...session.front, ...session.shootingSide].map((sequence) => ({ id: `${sequence.view}-${sequence.takeIndex}`, sequence })),
  });
  if (result.status !== "complete") throw new Error(`fixture must reconstruct: ${result.status}`);
  return result.profile;
}

/** The same profile with every cone scaled, so a band can be forced without touching geometry. */
function withCones(profile: RepresentativePose4DV2, coneDegrees: number): RepresentativePose4DV2 {
  return {
    ...profile,
    frames: profile.frames.map((frame) => ({
      ...frame,
      uncertainty: Object.fromEntries(Object.entries(frame.uncertainty).map(([name, item]) => [name, { ...item, directionalConeDegrees: coneDegrees }])) as RepresentativePoseFrameV2["uncertainty"],
    })),
  };
}

describe("uncertainty -> measurement confidence", () => {
  it("maps the directional cone to five bands with published thresholds", () => {
    expect(COACH_CONFIDENCE_CONE_THRESHOLDS_DEG).toEqual({ very_high: 6, high: 10, medium: 16, low: 25 });
    expect(confidenceFromCone(0)).toBe("very_high");
    expect(confidenceFromCone(6)).toBe("very_high");
    expect(confidenceFromCone(6.01)).toBe("high");
    expect(confidenceFromCone(10)).toBe("high");
    expect(confidenceFromCone(16)).toBe("medium");
    expect(confidenceFromCone(25)).toBe("low");
    expect(confidenceFromCone(25.1)).toBe("very_low");
    expect(confidenceFromCone(90)).toBe("very_low");
  });

  it("treats a missing, non-finite or negative cone as the weakest band", () => {
    expect(confidenceFromCone(Number.NaN)).toBe("very_low");
    expect(confidenceFromCone(Number.POSITIVE_INFINITY)).toBe("very_low");
    expect(confidenceFromCone(-1)).toBe("very_low");
  });

  it("caps by capture mode and by the quality gate, never raising a band", () => {
    expect(COACH_CONFIDENCE_CAPS).toEqual({ basic_1_plus_1: "medium", high_accuracy_3_plus_3: "very_high", quality_failed: "low" });
    expect(capConfidence("very_high", "medium")).toBe("medium");
    expect(capConfidence("low", "medium")).toBe("low");
    expect(capConfidence("medium", "medium")).toBe("medium");
    expect(measurementConfidence({ coneDegrees: 2, mode: "basic_1_plus_1", qualityPassed: true })).toBe("medium");
    expect(measurementConfidence({ coneDegrees: 2, mode: "high_accuracy_3_plus_3", qualityPassed: true })).toBe("very_high");
    expect(measurementConfidence({ coneDegrees: 2, mode: "high_accuracy_3_plus_3", qualityPassed: false })).toBe("low");
    expect(measurementConfidence({ coneDegrees: 30, mode: "high_accuracy_3_plus_3", qualityPassed: false })).toBe("very_low");
    expect(measurementConfidence({ coneDegrees: 12, mode: "basic_1_plus_1", qualityPassed: true })).toBe("medium");
    expect(measurementConfidence({ coneDegrees: 20, mode: "basic_1_plus_1", qualityPassed: true })).toBe("low");
  });

  it("takes the weakest joint of a measurement and refuses a joint without uncertainty", () => {
    const frame = representativeFrameAt(profileFor("basic_1_plus_1"), "releaseProxy");
    const mixed: RepresentativePoseFrameV2 = {
      ...frame,
      uncertainty: { ...frame.uncertainty, rightWrist: { ...frame.uncertainty.rightWrist, directionalConeDegrees: 20 } },
    };
    expect(jointConeDegrees(mixed, ["rightShoulder", "rightElbow", "rightWrist"])).toBe(20);
    expect(jointConeDegrees(mixed, ["rightShoulder", "rightElbow"])).toBeCloseTo(frame.uncertainty.rightElbow.directionalConeDegrees, 9);
    const missing = { ...frame, uncertainty: { ...frame.uncertainty, rightWrist: undefined } } as unknown as RepresentativePoseFrameV2;
    expect(() => jointConeDegrees(missing, ["rightWrist"])).toThrow(/rightWrist/);
    expect(() => jointConeDegrees(frame, [])).toThrow(/joint/);
  });

  it("is what every measured observation of the adapter reports", () => {
    for (const profile of [profileFor("basic_1_plus_1"), profileFor("high_accuracy_3_plus_3")]) {
      for (const item of buildCoachObservations(profile, "right")) {
        if (item.metric === "capture_quality" || item.phase_anchor === null) continue;
        const frame = representativeFrameAt(profile, item.phase_anchor);
        expect(item.measurement_confidence, item.id).toBe(observationConfidence(profile, frame, item.joints));
      }
    }
  });

  it("moves with the cone, the mode and the gate on real profiles", () => {
    const basic = profileFor("basic_1_plus_1");
    const bands = (profile: RepresentativePose4DV2) => new Set(buildCoachObservations(profile, "right").filter((item) => item.metric !== "capture_quality").map((item) => item.measurement_confidence));
    expect(bands(withCones(basic, 3))).toEqual(new Set(["medium"]));
    expect(bands(withCones(profileFor("high_accuracy_3_plus_3"), 3))).toEqual(new Set(["very_high"]));
    expect(bands(withCones(basic, 30))).toEqual(new Set(["very_low"]));
    expect(bands({ ...withCones(basic, 3), quality: { passed: false, reasons: ["uncertainty_exceeds_limit"] } })).toEqual(new Set(["low"]));
    const quality = buildCoachObservations(withCones(basic, 30), "right").find((item) => item.metric === "capture_quality");
    expect(quality?.measurement_confidence).toBe("high");
  });
});
