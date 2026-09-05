import { describe, expect, it } from "vitest";

import { ENGINEERING_THRESHOLDS_V1 } from "@/lib/shooting-profile/engineering-thresholds";
import { parseRepresentativePose4D } from "@/lib/shooting-profile/codec";
import {
  buildSyntheticSweepPlan,
  checkSyntheticSweepInvariants,
  summariseSyntheticSweep,
  SYNTHETIC_SWEEP_DISPLAY_SIZES,
  SYNTHETIC_SWEEP_VERSION,
  syntheticSweepReportSchema,
  type SyntheticSweepOutcomeV1,
} from "@/lib/shooting-profile/synthetic-sweep";
import { buildTwoViewRepresentativeProfile } from "@/lib/shooting-profile/two-view-pipeline";
import type { LandmarkSequenceV2 } from "@/lib/shooting-profile/types";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

function attemptsOf(session: { front: LandmarkSequenceV2[]; shootingSide: LandmarkSequenceV2[] }) {
  return [...session.front, ...session.shootingSide].map((sequence) => ({
    id: `${sequence.view}-${sequence.takeIndex}`,
    sequence,
  }));
}

describe("synthetic sweep plan", () => {
  it("leads with the fixed contract scenarios and covers every axis value", () => {
    const plan = buildSyntheticSweepPlan(200);

    expect(plan).toHaveLength(200);
    expect(new Set(plan.map((scenario) => scenario.id)).size).toBe(200);
    expect(plan.slice(0, 5).map((scenario) => scenario.id)).toEqual([
      "fixed-clean-basic",
      "fixed-clean-high",
      "fixed-clean-left",
      "fixed-clean-landscape",
      "fixed-clean-square",
    ]);
    for (const axis of ["mode", "shootingHand", "display", "degeneracy"] as const) {
      expect(new Set(plan.map((scenario) => scenario[axis])).size, axis).toBeGreaterThan(1);
    }
    expect(new Set(plan.map((scenario) => scenario.display))).toEqual(
      new Set(["portrait", "landscape", "square"]),
    );
    expect(new Set(plan.map((scenario) => scenario.degeneracy))).toContain("duplicate_view");
  });

  it("is deterministic and refuses an out-of-range session count", () => {
    expect(buildSyntheticSweepPlan(40)).toEqual(buildSyntheticSweepPlan(40));
    expect(buildSyntheticSweepPlan(40).slice(0, 12)).toEqual(buildSyntheticSweepPlan(12));
    expect(() => buildSyntheticSweepPlan(0)).toThrow();
    expect(() => buildSyntheticSweepPlan(1.5)).toThrow();
  });
});

describe("synthetic sweep invariants", () => {
  it("passes a genuine profile and reports every violated promise on a damaged one", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const result = buildTwoViewRepresentativeProfile({
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: attemptsOf(session),
    });
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;

    const clean = checkSyntheticSweepInvariants(result.profile, "basic_1_plus_1", result.confidence);
    expect(clean.violations).toEqual([]);
    expect(clean.boneLengthDrift).toBeLessThanOrEqual(ENGINEERING_THRESHOLDS_V1.templateBoneLengthTolerance);
    expect(clean.maximumConeDegrees).toBeGreaterThan(0);

    // A profile the codec would refuse, with a joint moved off its bone length.
    const damaged = {
      ...result.profile,
      frames: result.profile.frames.map((frame, index) => (
        index === 3
          ? { ...frame, joints: { ...frame.joints, leftKnee: { x: 9, y: 9, z: 9 } } }
          : frame
      )),
    };
    const dirty = checkSyntheticSweepInvariants(damaged, "basic_1_plus_1", 0.99);
    expect(dirty.violations).toContain("bone_length_drift");
    expect(dirty.violations).toContain("basic_confidence_cap");
    expect(dirty.boneLengthDrift).toBeGreaterThan(ENGINEERING_THRESHOLDS_V1.templateBoneLengthTolerance);
    expect(() => parseRepresentativePose4D(damaged)).not.toThrow();
  });

  it("reports a non-canonical profile as a codec rejection", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const result = buildTwoViewRepresentativeProfile({
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts: attemptsOf(session),
    });
    if (result.status !== "complete") throw new Error("fixture must reconstruct");

    const truncated = { ...result.profile, frames: result.profile.frames.slice(0, 100) };
    const checked = checkSyntheticSweepInvariants(truncated, "basic_1_plus_1", result.confidence);
    expect(checked.violations).toContain("codec_rejected");
    expect(checked.violations).toContain("frame_count");
  });
});

describe("synthetic sweep report", () => {
  const plan = buildSyntheticSweepPlan(12);

  function outcome(index: number, overrides: Partial<SyntheticSweepOutcomeV1>): SyntheticSweepOutcomeV1 {
    return {
      scenario: plan[index],
      status: "complete",
      confidence: 0.5,
      boneLengthDrift: 1e-16,
      maximumConeDegrees: 12,
      invariantViolations: [],
      elapsedMs: 10,
      ...overrides,
    };
  }

  it("summarises outcomes, expectations, invariants and axes into a strict schema", () => {
    const report = summariseSyntheticSweep([
      outcome(0, {}),
      outcome(5, { status: "recapture_required", reason: "cross_view_phase_mismatch", confidence: undefined }),
      outcome(7, { status: "recapture_required", reason: "phase_detection_failed", confidence: undefined }),
    ]);

    expect(syntheticSweepReportSchema.parse(report)).toEqual(report);
    expect(report.version).toBe(SYNTHETIC_SWEEP_VERSION);
    expect(report.sessionCount).toBe(3);
    expect(report.outcomes).toMatchObject({ complete: 1, recaptureRequired: 2 });
    expect(report.outcomes.byReason).toEqual({
      cross_view_phase_mismatch: 1,
      phase_detection_failed: 1,
    });
    expect(report.invariants.completedProfilesChecked).toBe(1);
    expect(report.invariants.boneLengthTolerance).toBe(ENGINEERING_THRESHOLDS_V1.templateBoneLengthTolerance);
    expect(Object.keys(report.perAxis)).toContain("display");
    expect(report.runtime.slowestSessionMs).toBe(10);
  });

  it("records an expectation violation with the reason the pipeline actually gave", () => {
    // fixed-frozen-arm promises a rejection, so completing is a contract failure.
    const frozenIndex = plan.findIndex((scenario) => scenario.id === "fixed-frozen-arm");
    const report = summariseSyntheticSweep([outcome(frozenIndex, {})]);

    expect(report.expectations.violated).toBe(1);
    expect(report.expectations.violations[0]).toMatchObject({
      scenarioId: "fixed-frozen-arm",
      expected: "rejects",
      actualStatus: "complete",
    });
  });

  it("counts the documented open gaps as unspecified rather than as passes", () => {
    const duplicateIndex = plan.findIndex((scenario) => scenario.id === "fixed-duplicate-view");
    const report = summariseSyntheticSweep([outcome(duplicateIndex, {})]);

    expect(report.expectations).toMatchObject({ satisfied: 0, violated: 0, unspecified: 1 });
  });

  it("keeps one display size per aspect so the isotropic conversion is exercised", () => {
    expect(SYNTHETIC_SWEEP_DISPLAY_SIZES.portrait.height).toBeGreaterThan(SYNTHETIC_SWEEP_DISPLAY_SIZES.portrait.width);
    expect(SYNTHETIC_SWEEP_DISPLAY_SIZES.landscape.width).toBeGreaterThan(SYNTHETIC_SWEEP_DISPLAY_SIZES.landscape.height);
    expect(SYNTHETIC_SWEEP_DISPLAY_SIZES.square.width).toBe(SYNTHETIC_SWEEP_DISPLAY_SIZES.square.height);
  });

  it("refuses to summarise an empty sweep", () => {
    expect(() => summariseSyntheticSweep([])).toThrow();
  });
});
