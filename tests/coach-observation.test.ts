import { describe, expect, it } from "vitest";

import {
  COACH_METRIC_UNITS_V1,
  COACH_METRICS_V1,
  COACH_OBSERVATION_BOUNDARIES,
  COACH_OBSERVATION_SOURCES,
  REPRESENTATIVE_BOUNDARY,
  parseCoachObservationV1,
} from "@/lib/coach/contract";
import { observation } from "@/tests/fixtures/coach-contract-fixtures";

const rejects = (value: unknown, path?: string) => {
  const result = parseCoachObservationV1(value);
  expect(result.ok).toBe(false);
  if (!result.ok && path) expect(result.issues.some((issue) => issue.startsWith(path))).toBe(true);
};
const accepts = (value: unknown) => expect(parseCoachObservationV1(value).ok).toBe(true);
const quality = (overrides: Record<string, unknown> = {}) => ({
  ...observation(),
  id: "obs_capture_quality",
  metric: "capture_quality",
  unit: "label",
  value: "passed",
  phase_anchor: null,
  joints: [],
  ...overrides,
});

describe("CoachObservationV1", () => {
  it("accepts the reference observation and stable snake-case ids", () => {
    accepts(observation());
    accepts(observation({ id: "obs_a_b1" }));
    rejects(observation({ id: "elbow" }), "id");
    rejects(observation({ id: "obs_" }), "id");
    rejects(observation({ id: "obs_Release" }), "id");
    rejects(observation({ id: `obs_${"a".repeat(61)}` }), "id");
  });

  it("only knows metrics the representative profile can support; forces and metric 3D are not metrics", () => {
    expect(COACH_METRICS_V1).toEqual([
      "release_elbow_angle_deg",
      "release_wrist_height_sb",
      "release_elbow_lateral_offset_sb",
      "release_shoulder_line_yaw_deg",
      "deepest_dip_knee_angle_deg",
      "follow_through_elbow_angle_deg",
      "follow_through_wrist_over_head_sb",
      "capture_quality",
    ]);
    for (const metric of ["ground_reaction_force_n", "joint_torque_nm", "muscle_activation", "actual_3d_wrist_position_m", "release_velocity_mps", "rise_to_release_phase_span"]) {
      rejects({ ...observation(), metric }, "metric");
    }
  });

  it("has exactly one source and one boundary in V1: the representative phase-fused estimate", () => {
    expect(COACH_OBSERVATION_SOURCES).toEqual(["representative_phase_fused_4d"]);
    expect(COACH_OBSERVATION_BOUNDARIES).toEqual([REPRESENTATIVE_BOUNDARY]);
    rejects({ ...observation(), source: "phone_2d" }, "source");
    rejects({ ...observation(), source: "multi_view_3d" }, "source");
    rejects({ ...observation(), source: "force_plate" }, "source");
    rejects({ ...observation(), boundary: "actual_optical_mocap_3d" }, "boundary");
    rejects({ ...observation(), boundary: "calibrated_multi_view_3d" }, "boundary");
  });

  it("ties each metric to its unit and each unit to a bounded number or a code", () => {
    expect(COACH_METRIC_UNITS_V1).toEqual({
      release_elbow_angle_deg: "deg",
      release_wrist_height_sb: "shoulder_breadths",
      release_elbow_lateral_offset_sb: "shoulder_breadths",
      release_shoulder_line_yaw_deg: "deg",
      deepest_dip_knee_angle_deg: "deg",
      follow_through_elbow_angle_deg: "deg",
      follow_through_wrist_over_head_sb: "shoulder_breadths",
      capture_quality: "label",
    });
    rejects(observation({ unit: "shoulder_breadths" }), "unit");
    rejects({ ...observation(), unit: null }, "unit");
    rejects({ ...observation(), unit: "phase_fraction" }, "unit");
    rejects(observation({ value: "ninety" }), "value");
    rejects(observation({ value: 361 }), "value");
    rejects(observation({ value: Number.NaN }), "value");
    rejects(observation({ metric: "release_wrist_height_sb", unit: "shoulder_breadths", value: 11 }), "value");
    rejects(quality({ value: 3 }), "value");
    rejects(quality({ value: "Not a code" }), "value");
    rejects(quality({ unit: "deg", value: 1 }), "unit");
    accepts(observation({ metric: "release_wrist_height_sb", unit: "shoulder_breadths", value: -0.4 }));
    accepts(observation({ metric: "follow_through_elbow_angle_deg", unit: "deg", value: 171.5, phase_anchor: "followThrough" }));
    accepts(quality());
  });

  it("anchors every measurement to a phase and at least one joint; the quality label is not a pose", () => {
    rejects(observation({ phase_anchor: null }), "phase_anchor");
    rejects(observation({ joints: [] }), "joints");
    rejects({ ...observation(), phase_anchor: "release" }, "phase_anchor");
    rejects(observation({ joints: ["rightElbow", "rightElbow"] }), "joints");
    rejects({ ...observation(), joints: ["nose"] }, "joints.0");
    rejects(quality({ phase_anchor: "ready" }), "phase_anchor");
    rejects(quality({ joints: ["rightElbow"] }), "joints");
    accepts(quality({ value: "recapture_needed" }));
  });

  it("keeps confidence to the five bands, caveats short, and private fields out", () => {
    rejects({ ...observation(), measurement_confidence: "certain" }, "measurement_confidence");
    rejects(observation({ caveats: Array.from({ length: 9 }, () => "c") }), "caveats");
    rejects(observation({ caveats: ["x".repeat(161)] }), "caveats.0");
    rejects(observation({ reference: "x".repeat(121) }), "reference");
    rejects({ ...observation(), covariance: [0.01, 0, 0, 0.01, 0, 0.01] }, "covariance");
    rejects({ ...observation(), timestampMs: 1240 }, "timestampMs");
    rejects({ ...observation(), z: 0.4 }, "z");
  });
});
