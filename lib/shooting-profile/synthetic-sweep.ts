import { z } from "zod";

import { parseRepresentativePose4D } from "@/lib/shooting-profile/codec";
import { ENGINEERING_THRESHOLDS_V1 } from "@/lib/shooting-profile/engineering-thresholds";
import { KINEMATIC_TREE_V1 } from "@/lib/shooting-profile/kinematics";
import { CONSENSUS_V1 } from "@/lib/shooting-profile/repeated-shot";
import {
  PERSISTED_JOINT_NAMES_V2,
  type CaptureProtocolV2,
  type RepresentativePose4DV2,
  type ShootingHandV2,
} from "@/lib/shooting-profile/types";

/**
 * Deterministic synthetic known-geometry sweep, the first dataset in
 * `docs/representative-4d-validation-protocol.md`. It exercises the frozen
 * pipeline across hand, capture mode, aspect ratio, observation noise, landmark
 * visibility, cross-view phase shift, and the deliberately degenerate inputs the
 * admission gates exist to refuse.
 *
 * The plan carries no data of its own - the caller supplies the fixture - so
 * this module stays free of any test import and can be summarised, versioned,
 * and schema-checked like the other derived evidence in this repository.
 */
export const SYNTHETIC_SWEEP_VERSION = "synthetic_known_geometry_sweep_v1" as const;

export type SyntheticSweepDisplayV1 = "portrait" | "landscape" | "square";

export type SyntheticSweepDegeneracyV1 =
  | "none"
  | "duplicate_view"
  | "mirrored_view"
  | "slow_first_half"
  | "frozen_shooting_arm"
  | "stalled_clip";

/** What the contract promises for a scenario. `unspecified` records without judging. */
export type SyntheticSweepExpectationV1 = "accepts" | "rejects" | "unspecified";

export type SyntheticSweepScenarioV1 = Readonly<{
  id: string;
  mode: CaptureProtocolV2;
  shootingHand: ShootingHandV2;
  display: SyntheticSweepDisplayV1;
  sideAnchorShift: number;
  noiseAmplitude: number;
  visibility: number;
  degeneracy: SyntheticSweepDegeneracyV1;
  expectation: SyntheticSweepExpectationV1;
}>;

export const SYNTHETIC_SWEEP_DISPLAY_SIZES: Readonly<Record<SyntheticSweepDisplayV1, Readonly<{ width: number; height: number }>>> = Object.freeze({
  portrait: Object.freeze({ width: 1080, height: 1920 }),
  landscape: Object.freeze({ width: 1920, height: 1080 }),
  square: Object.freeze({ width: 1440, height: 1440 }),
});

const MODES: readonly CaptureProtocolV2[] = ["basic_1_plus_1", "high_accuracy_3_plus_3"];
const HANDS: readonly ShootingHandV2[] = ["right", "left"];
const DISPLAYS: readonly SyntheticSweepDisplayV1[] = ["portrait", "landscape", "square"];
/** Well inside the 0.10 cross-view limit, so a clean scenario must still fuse. */
const CLEAN_SHIFTS = [0, 0.02, 0.04] as const;
const CLEAN_NOISE = [0.000002, 0.000008, 0.00002, 0.00004] as const;
/** Comfortably above the consensus visibility floor. */
const CLEAN_VISIBILITY = [0.95, 0.85, 0.7] as const;

/**
 * Scenarios whose outcome the contract fixes. They always lead the plan so a
 * short sweep still covers every gate.
 */
function fixedScenarios(): SyntheticSweepScenarioV1[] {
  const base = {
    mode: "basic_1_plus_1" as const,
    shootingHand: "right" as const,
    display: "portrait" as const,
    sideAnchorShift: 0,
    noiseAmplitude: 0.000003,
    visibility: 0.95,
  };
  const scenarios: SyntheticSweepScenarioV1[] = [
    { ...base, id: "fixed-clean-basic", degeneracy: "none", expectation: "accepts" },
    { ...base, id: "fixed-clean-high", mode: "high_accuracy_3_plus_3", degeneracy: "none", expectation: "accepts" },
    { ...base, id: "fixed-clean-left", shootingHand: "left", degeneracy: "none", expectation: "accepts" },
    { ...base, id: "fixed-clean-landscape", display: "landscape", degeneracy: "none", expectation: "accepts" },
    { ...base, id: "fixed-clean-square", display: "square", degeneracy: "none", expectation: "accepts" },
    // OPEN GAP: `assessCrossViewGeometry` is wired into the private evaluation
    // path only, so the profile-building path still fuses two views that are the
    // same projection. Recorded as `unspecified` because the pipeline makes no
    // promise here today; the sweep report shows them completing.
    { ...base, id: "fixed-duplicate-view", degeneracy: "duplicate_view", expectation: "unspecified" },
    { ...base, id: "fixed-mirrored-view", degeneracy: "mirrored_view", expectation: "unspecified" },
    { ...base, id: "fixed-frozen-arm", degeneracy: "frozen_shooting_arm", expectation: "rejects" },
    { ...base, id: "fixed-stalled-clip", degeneracy: "stalled_clip", expectation: "rejects" },
    {
      ...base,
      id: "fixed-occluded",
      // Below the repeated-shot visibility floor, so admission must refuse it.
      visibility: CONSENSUS_V1.minimumLandmarkVisibility / 2,
      degeneracy: "none",
      expectation: "rejects",
    },
    // The detector re-finds anchors from the motion itself, so shifting the
    // generator's schedule barely moves the normalized anchor positions. A real
    // rhythm change is needed to exercise the cross-view alignment gate.
    { ...base, id: "fixed-phase-mismatch", degeneracy: "slow_first_half", expectation: "rejects" },
    { ...base, id: "fixed-phase-borderline", sideAnchorShift: 0.09, degeneracy: "none", expectation: "unspecified" },
  ];
  return scenarios.map((scenario) => Object.freeze(scenario));
}

/**
 * Cycles each axis on a distinct stride so every value recurs and the
 * combinations differ, without the cost of a full cross product.
 */
export function buildSyntheticSweepPlan(sessionCount: number): readonly SyntheticSweepScenarioV1[] {
  if (!Number.isInteger(sessionCount) || sessionCount < 1 || sessionCount > 10_000) {
    throw new Error("sweep session count must be an integer in [1, 10000]");
  }
  const fixed = fixedScenarios();
  const plan: SyntheticSweepScenarioV1[] = fixed.slice(0, sessionCount);
  for (let index = plan.length; index < sessionCount; index += 1) {
    const step = index - fixed.length;
    plan.push(Object.freeze({
      id: `sweep-${String(index).padStart(4, "0")}`,
      mode: MODES[step % MODES.length],
      shootingHand: HANDS[Math.floor(step / 2) % HANDS.length],
      display: DISPLAYS[step % DISPLAYS.length],
      sideAnchorShift: CLEAN_SHIFTS[Math.floor(step / 3) % CLEAN_SHIFTS.length],
      noiseAmplitude: CLEAN_NOISE[step % CLEAN_NOISE.length],
      visibility: CLEAN_VISIBILITY[Math.floor(step / 5) % CLEAN_VISIBILITY.length],
      degeneracy: "none",
      expectation: "accepts",
    }));
  }
  return Object.freeze(plan);
}

export type SyntheticSweepInvariantV1 =
  | "codec_rejected"
  | "frame_count"
  | "joint_names"
  | "non_finite_coordinate"
  | "bone_length_drift"
  | "basic_confidence_cap"
  | "boundary_literal";

/**
 * Every promise a completed profile must keep. The codec already enforces the
 * 101-sample grid, canonical anchors, and PSD covariance, so it is run first and
 * its rejection reported as one invariant.
 */
export function checkSyntheticSweepInvariants(
  profile: RepresentativePose4DV2,
  mode: CaptureProtocolV2,
  confidence: number,
): { violations: readonly SyntheticSweepInvariantV1[]; boneLengthDrift: number; maximumConeDegrees: number } {
  const violations: SyntheticSweepInvariantV1[] = [];
  try {
    parseRepresentativePose4D(profile);
  } catch {
    violations.push("codec_rejected");
  }
  if (profile.frames.length !== 101) violations.push("frame_count");
  if (profile.boundary !== "representative_phase_fused_4d_estimate_not_actual_3d") {
    violations.push("boundary_literal");
  }
  if (mode === "basic_1_plus_1" && confidence > ENGINEERING_THRESHOLDS_V1.basicConfidenceCap) {
    violations.push("basic_confidence_cap");
  }

  let boneLengthDrift = 0;
  let maximumConeDegrees = 0;
  let jointNamesWrong = false;
  let nonFinite = false;
  for (const frame of profile.frames) {
    const jointNames = Object.keys(frame.joints);
    if (jointNames.length !== PERSISTED_JOINT_NAMES_V2.length
      || PERSISTED_JOINT_NAMES_V2.some((name) => !jointNames.includes(name))) {
      jointNamesWrong = true;
    }
    for (const joint of PERSISTED_JOINT_NAMES_V2) {
      const point = frame.joints[joint];
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
        nonFinite = true;
        continue;
      }
      const uncertainty = frame.uncertainty[joint];
      if (uncertainty) maximumConeDegrees = Math.max(maximumConeDegrees, uncertainty.directionalConeDegrees);
    }
    if (nonFinite) continue;
    for (const bone of KINEMATIC_TREE_V1) {
      const parent = bone.parent === "pelvis" ? { x: 0, y: 0, z: 0 } : frame.joints[bone.parent];
      const child = frame.joints[bone.child];
      const length = Math.hypot(child.x - parent.x, child.y - parent.y, child.z - parent.z);
      boneLengthDrift = Math.max(
        boneLengthDrift,
        Math.abs(length - ENGINEERING_THRESHOLDS_V1.templateBoneLengths[bone.id]),
      );
    }
  }
  if (jointNamesWrong) violations.push("joint_names");
  if (nonFinite) violations.push("non_finite_coordinate");
  if (boneLengthDrift > ENGINEERING_THRESHOLDS_V1.templateBoneLengthTolerance) {
    violations.push("bone_length_drift");
  }
  return { violations, boneLengthDrift, maximumConeDegrees };
}

export type SyntheticSweepOutcomeV1 = Readonly<{
  scenario: SyntheticSweepScenarioV1;
  status: "complete" | "recapture_required";
  reason?: string;
  confidence?: number;
  boneLengthDrift?: number;
  maximumConeDegrees?: number;
  invariantViolations: readonly SyntheticSweepInvariantV1[];
  elapsedMs: number;
}>;

const distributionSchema = z.record(z.string(), z.number().int().nonnegative());

export const syntheticSweepReportSchema = z.object({
  version: z.literal(SYNTHETIC_SWEEP_VERSION),
  sessionCount: z.number().int().positive(),
  outcomes: z.object({
    complete: z.number().int().nonnegative(),
    recaptureRequired: z.number().int().nonnegative(),
    byReason: distributionSchema,
  }).strict(),
  expectations: z.object({
    satisfied: z.number().int().nonnegative(),
    violated: z.number().int().nonnegative(),
    unspecified: z.number().int().nonnegative(),
    violations: z.array(z.object({
      scenarioId: z.string().min(1),
      expected: z.enum(["accepts", "rejects"]),
      actualStatus: z.enum(["complete", "recapture_required"]),
      actualReason: z.string().min(1).optional(),
    }).strict()),
  }).strict(),
  invariants: z.object({
    completedProfilesChecked: z.number().int().nonnegative(),
    violations: z.array(z.object({
      scenarioId: z.string().min(1),
      invariant: z.string().min(1),
    }).strict()),
    worstBoneLengthDrift: z.number().finite().nonnegative(),
    boneLengthTolerance: z.number().finite().positive(),
    maximumConeDegrees: z.number().finite().nonnegative(),
    minimumConfidence: z.number().finite().min(0).max(1).optional(),
    maximumConfidence: z.number().finite().min(0).max(1).optional(),
  }).strict(),
  perAxis: z.record(z.string(), z.record(z.string(), z.object({
    complete: z.number().int().nonnegative(),
    recaptureRequired: z.number().int().nonnegative(),
  }).strict())),
  runtime: z.object({
    totalMs: z.number().finite().nonnegative(),
    medianSessionMs: z.number().finite().nonnegative(),
    slowestSessionMs: z.number().finite().nonnegative(),
  }).strict(),
}).strict();

export type SyntheticSweepReportV1 = z.infer<typeof syntheticSweepReportSchema>;

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function axisValue(scenario: SyntheticSweepScenarioV1, axis: string): string {
  switch (axis) {
    case "mode": return scenario.mode;
    case "shootingHand": return scenario.shootingHand;
    case "display": return scenario.display;
    case "sideAnchorShift": return scenario.sideAnchorShift.toFixed(3);
    case "noiseAmplitude": return scenario.noiseAmplitude.toExponential(1);
    case "visibility": return scenario.visibility.toFixed(2);
    case "degeneracy": return scenario.degeneracy;
    default: return "unknown";
  }
}

const AXES = ["mode", "shootingHand", "display", "sideAnchorShift", "noiseAmplitude", "visibility", "degeneracy"] as const;

export function summariseSyntheticSweep(
  outcomes: readonly SyntheticSweepOutcomeV1[],
): SyntheticSweepReportV1 {
  if (outcomes.length === 0) throw new Error("a sweep report needs at least one session");
  const byReason: Record<string, number> = {};
  const expectationViolations: SyntheticSweepReportV1["expectations"]["violations"] = [];
  const invariantViolations: SyntheticSweepReportV1["invariants"]["violations"] = [];
  const perAxis: Record<string, Record<string, { complete: number; recaptureRequired: number }>> = {};
  const confidences: number[] = [];
  const elapsed: number[] = [];
  let complete = 0;
  let satisfied = 0;
  let violated = 0;
  let unspecified = 0;
  let worstBoneLengthDrift = 0;
  let maximumConeDegrees = 0;
  let completedProfilesChecked = 0;

  for (const outcome of outcomes) {
    elapsed.push(outcome.elapsedMs);
    if (outcome.status === "complete") complete += 1;
    if (outcome.reason !== undefined) byReason[outcome.reason] = (byReason[outcome.reason] ?? 0) + 1;

    const { expectation } = outcome.scenario;
    const matches = expectation === "unspecified"
      ? undefined
      : expectation === "accepts"
        ? outcome.status === "complete"
        : outcome.status === "recapture_required";
    if (matches === undefined) unspecified += 1;
    else if (matches) satisfied += 1;
    else {
      violated += 1;
      expectationViolations.push({
        scenarioId: outcome.scenario.id,
        expected: outcome.scenario.expectation as "accepts" | "rejects",
        actualStatus: outcome.status,
        ...(outcome.reason === undefined ? {} : { actualReason: outcome.reason }),
      });
    }

    if (outcome.status === "complete") {
      completedProfilesChecked += 1;
      if (outcome.confidence !== undefined) confidences.push(outcome.confidence);
      worstBoneLengthDrift = Math.max(worstBoneLengthDrift, outcome.boneLengthDrift ?? 0);
      maximumConeDegrees = Math.max(maximumConeDegrees, outcome.maximumConeDegrees ?? 0);
    }
    for (const invariant of outcome.invariantViolations) {
      invariantViolations.push({ scenarioId: outcome.scenario.id, invariant });
    }

    for (const axis of AXES) {
      const value = axisValue(outcome.scenario, axis);
      perAxis[axis] ??= {};
      perAxis[axis][value] ??= { complete: 0, recaptureRequired: 0 };
      if (outcome.status === "complete") perAxis[axis][value].complete += 1;
      else perAxis[axis][value].recaptureRequired += 1;
    }
  }

  return syntheticSweepReportSchema.parse({
    version: SYNTHETIC_SWEEP_VERSION,
    sessionCount: outcomes.length,
    outcomes: { complete, recaptureRequired: outcomes.length - complete, byReason },
    expectations: { satisfied, violated, unspecified, violations: expectationViolations },
    invariants: {
      completedProfilesChecked,
      violations: invariantViolations,
      worstBoneLengthDrift,
      boneLengthTolerance: ENGINEERING_THRESHOLDS_V1.templateBoneLengthTolerance,
      maximumConeDegrees,
      ...(confidences.length === 0 ? {} : {
        minimumConfidence: Math.min(...confidences),
        maximumConfidence: Math.max(...confidences),
      }),
    },
    perAxis,
    runtime: {
      totalMs: elapsed.reduce((sum, value) => sum + value, 0),
      medianSessionMs: median(elapsed),
      slowestSessionMs: Math.max(...elapsed),
    },
  });
}
