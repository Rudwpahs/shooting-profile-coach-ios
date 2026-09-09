import { describe, expect, it } from "vitest";

import { COACH_CONFIDENCE, COACH_METRICS_V1, REPRESENTATIVE_BOUNDARY, parseCoachObservationV1, parseCoachRequestV1 } from "@/lib/coach/contract";
import { buildCoachObservations, buildCoachRequest, representativeFrameAt } from "@/lib/coach/representative-profile-adapter";
import type { Vector3 } from "@/lib/pose-motion";
import type { RepresentativePose4DV2, ShootingHandV2 } from "@/lib/shooting-profile/types";
import { buildTwoViewRepresentativeProfile } from "@/lib/shooting-profile/two-view-pipeline";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

function profileFor(shootingHand: ShootingHandV2, mode: "basic_1_plus_1" | "high_accuracy_3_plus_3" = "basic_1_plus_1"): RepresentativePose4DV2 {
  const session = syntheticLandmarkSession({ mode, shootingHand });
  const result = buildTwoViewRepresentativeProfile({
    mode,
    shootingHand,
    attempts: [...session.front, ...session.shootingSide].map((sequence) => ({ id: `${sequence.view}-${sequence.takeIndex}`, sequence })),
  });
  if (result.status !== "complete") throw new Error(`fixture must reconstruct: ${result.status}`);
  return result.profile;
}

const right = profileFor("right");
const left = profileFor("left");

const sub = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mid = (a: Vector3, b: Vector3): Vector3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const norm = (v: Vector3) => Math.hypot(v.x, v.y, v.z);
const angleAt = (vertex: Vector3, a: Vector3, b: Vector3) => {
  const u = sub(a, vertex);
  const v = sub(b, vertex);
  return (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / (norm(u) * norm(v))))) * 180) / Math.PI;
};
const value = (profile: RepresentativePose4DV2, hand: ShootingHandV2, metric: string) => {
  const found = buildCoachObservations(profile, hand).find((item) => item.metric === metric);
  if (!found || typeof found.value !== "number") throw new Error(`${metric} must be a numeric observation`);
  return found.value;
};

describe("representative profile -> CoachObservationV1[]", () => {
  it("yields one schema-valid observation per metric, in the metric order, with stable ids", () => {
    const observations = buildCoachObservations(right, "right");
    expect(observations.map((item) => item.metric)).toEqual([...COACH_METRICS_V1]);
    expect(observations.map((item) => item.id)).toEqual(COACH_METRICS_V1.map((metric) => `obs_${metric}`));
    for (const item of observations) {
      expect(parseCoachObservationV1(item), item.id).toEqual({ ok: true, value: item });
      expect(item.source).toBe("representative_phase_fused_4d");
      expect(item.boundary).toBe(REPRESENTATIVE_BOUNDARY);
      expect(COACH_CONFIDENCE).toContain(item.measurement_confidence);
    }
  });

  it("anchors each measurement to the phase it is taken at and names the joints it uses, on the shooting side", () => {
    const anchors = Object.fromEntries(buildCoachObservations(right, "right").map((item) => [item.metric, item.phase_anchor]));
    expect(anchors).toEqual({
      release_elbow_angle_deg: "releaseProxy",
      release_wrist_height_sb: "releaseProxy",
      release_elbow_lateral_offset_sb: "releaseProxy",
      release_shoulder_line_yaw_deg: "releaseProxy",
      deepest_dip_knee_angle_deg: "deepestDip",
      follow_through_elbow_angle_deg: "followThrough",
      follow_through_wrist_over_head_sb: "followThrough",
      capture_quality: null,
    });
    const joints = (profile: RepresentativePose4DV2, hand: ShootingHandV2, metric: string) =>
      buildCoachObservations(profile, hand).find((item) => item.metric === metric)?.joints;
    expect(joints(right, "right", "release_elbow_angle_deg")).toEqual(["rightShoulder", "rightElbow", "rightWrist"]);
    expect(joints(left, "left", "release_elbow_angle_deg")).toEqual(["leftShoulder", "leftElbow", "leftWrist"]);
    expect(joints(right, "right", "deepest_dip_knee_angle_deg")).toEqual(["rightHip", "rightKnee", "rightAnkle"]);
    expect(joints(right, "right", "release_shoulder_line_yaw_deg")).toEqual(["leftShoulder", "rightShoulder"]);
    expect(joints(right, "right", "follow_through_wrist_over_head_sb")).toEqual(["rightWrist", "leftShoulder", "rightShoulder"]);
    expect(joints(right, "right", "capture_quality")).toEqual([]);
  });

  it("computes the geometry the way an independent recomputation does, rounded to two decimals", () => {
    const release = representativeFrameAt(right, "releaseProxy").joints;
    const dip = representativeFrameAt(right, "deepestDip").joints;
    const follow = representativeFrameAt(right, "followThrough").joints;
    expect(value(right, "right", "release_elbow_angle_deg")).toBeCloseTo(angleAt(release.rightElbow, release.rightShoulder, release.rightWrist), 2);
    expect(value(right, "right", "release_wrist_height_sb")).toBeCloseTo(release.rightWrist.y - release.rightShoulder.y, 2);
    expect(value(right, "right", "release_elbow_lateral_offset_sb")).toBeCloseTo(release.rightElbow.x - release.rightShoulder.x, 2);
    const shoulderLine = sub(release.rightShoulder, release.leftShoulder);
    expect(value(right, "right", "release_shoulder_line_yaw_deg")).toBeCloseTo((Math.atan2(shoulderLine.z, shoulderLine.x) * 180) / Math.PI, 2);
    expect(value(right, "right", "deepest_dip_knee_angle_deg")).toBeCloseTo(angleAt(dip.rightKnee, dip.rightHip, dip.rightAnkle), 2);
    expect(value(right, "right", "follow_through_elbow_angle_deg")).toBeCloseTo(angleAt(follow.rightElbow, follow.rightShoulder, follow.rightWrist), 2);
    const neck = mid(follow.leftShoulder, follow.rightShoulder);
    const pelvis = mid(follow.leftHip, follow.rightHip);
    const spine = mid(neck, pelvis);
    const head = { x: neck.x + (neck.x - spine.x) * 0.62, y: neck.y + (neck.y - spine.y) * 0.62, z: neck.z + (neck.z - spine.z) * 0.62 };
    expect(value(right, "right", "follow_through_wrist_over_head_sb")).toBeCloseTo(follow.rightWrist.y - head.y, 2);
    for (const item of buildCoachObservations(right, "right")) {
      if (typeof item.value === "number") expect(Math.abs(item.value * 100 - Math.round(item.value * 100))).toBeLessThan(1e-6);
    }
  });

  it("mirrors the lateral offset for a left-handed shooter so positive always means outside the shoulder line", () => {
    const release = representativeFrameAt(left, "releaseProxy").joints;
    expect(value(left, "left", "release_elbow_lateral_offset_sb")).toBeCloseTo(-(release.leftElbow.x - release.leftShoulder.x), 2);
    expect(value(left, "left", "release_wrist_height_sb")).toBeCloseTo(release.leftWrist.y - release.leftShoulder.y, 2);
  });

  it("is deterministic and never carries frames, covariance, timestamps or names", () => {
    expect(buildCoachObservations(right, "right")).toEqual(buildCoachObservations(right, "right"));
    const text = JSON.stringify(buildCoachObservations(right, "right"));
    expect(text).not.toMatch(/covariance|timestamp|frames|uri|fileName|sourceLandmarks|"z"/);
    expect(text.length).toBeLessThan(4000);
  });

  it("states the boundary and the capture mode as caveats, and that the head is derived where it is", () => {
    for (const item of buildCoachObservations(right, "right")) {
      if (item.metric === "capture_quality") continue;
      expect(item.caveats).toContain("representative phase-fused 4D estimate, not actual 3D");
      expect(item.caveats).toContain("basic_1_plus_1: one take per view");
    }
    const overHead = buildCoachObservations(right, "right").find((item) => item.metric === "follow_through_wrist_over_head_sb");
    expect(overHead?.caveats).toContain("head position is derived from the shoulders and hips");
    const high = buildCoachObservations(profileFor("right", "high_accuracy_3_plus_3"), "right");
    expect(high[0].caveats).toContain("high_accuracy_3_plus_3: three takes per view");
  });

  it("labels the capture quality from the quality gate and forwards stable reason codes", () => {
    const passed = buildCoachObservations(right, "right").find((item) => item.metric === "capture_quality");
    expect(passed).toMatchObject({ value: "passed", unit: "label", phase_anchor: null, joints: [], caveats: [] });
    const failed = buildCoachObservations({ ...right, quality: { passed: false, reasons: ["uncertainty_exceeds_limit", "cross_view_phase_mismatch"] } }, "right");
    const quality = failed.find((item) => item.metric === "capture_quality");
    expect(quality).toMatchObject({ value: "recapture_needed", caveats: ["uncertainty_exceeds_limit", "cross_view_phase_mismatch"] });
    expect(failed.every((item) => parseCoachObservationV1(item).ok)).toBe(true);
  });

  it("builds a schema-valid request around the observations from the caller's context alone", () => {
    const request = buildCoachRequest({
      profile: right,
      shootingHand: "right",
      requestId: "req_abcdef0123456789",
      locale: "ko",
      player: { skillLevel: "developing", trainingGoal: "consistency" },
      action: "jump_shot",
    });
    expect(parseCoachRequestV1(request)).toEqual({ ok: true, value: request });
    expect(request.player).toEqual({ handedness: "right", skill_level: "developing", training_goal: "consistency" });
    expect(request.context).toEqual({ action: "jump_shot", capture_protocol: "basic_1_plus_1", quality_passed: true, quality_reasons: [] });
    expect(request.evidence).toEqual([]);
    expect(request.recent_history).toEqual([]);
    expect(request.observations).toEqual(buildCoachObservations(right, "right"));
    const withHistory = buildCoachRequest({
      profile: { ...right, quality: { passed: false, reasons: ["uncertainty_exceeds_limit"] } },
      shootingHand: "right",
      requestId: "req_abcdef0123456789",
      locale: "en",
      player: { skillLevel: null, trainingGoal: null },
      recentHistory: ["retest_after_drill"],
    });
    expect(withHistory.context).toEqual({ action: "unknown", capture_protocol: "basic_1_plus_1", quality_passed: false, quality_reasons: ["uncertainty_exceeds_limit"] });
    expect(withHistory.recent_history).toEqual(["retest_after_drill"]);
  });

  it("refuses anything that is not a representative profile", () => {
    expect(() => buildCoachObservations({ ...right, frames: right.frames.slice(0, 50) }, "right")).toThrow(/101/);
    expect(() => buildCoachObservations({ ...right, boundary: "actual_3d" as never }, "right")).toThrow(/boundary/);
    expect(() => buildCoachObservations({ ...right, phaseAnchors: right.phaseAnchors.filter((anchor) => anchor.id !== "releaseProxy") }, "right")).toThrow(/releaseProxy/);
    expect(() => buildCoachRequest({ profile: right, shootingHand: "right", requestId: "nope", locale: "ko", player: { skillLevel: null, trainingGoal: null } })).toThrow(/request_id/);
  });
});
