import { observationConfidence } from "@/lib/coach/confidence-map";
import {
  COACH_METRIC_UNITS_V1,
  COACH_PHASE_ANCHORS,
  COACH_SCHEMA_VERSION,
  REPRESENTATIVE_BOUNDARY,
  parseCoachRequestV1,
  type CoachEvidenceItemV1,
  type CoachJointV1,
  type CoachLocaleV1,
  type CoachMetricV1,
  type CoachObservationV1,
  type CoachPhaseAnchorV1,
  type CoachRequestV1,
  type CoachShotActionV1,
} from "@/lib/coach/contract";
import type { Vector3 } from "@/lib/pose-motion";
import type { SkillLevel, TrainingGoal } from "@/lib/recommendation";
import type { RepresentativePose4DV2, RepresentativePoseFrameV2, ShootingHandV2 } from "@/lib/shooting-profile/types";

/**
 * RepresentativePose4DV2 -> CoachObservationV1[].
 *
 * The only bridge from a private representative profile to a Coach request.
 * It reads a handful of joints at three phase anchors and emits eight scalar
 * observations; it never serializes frames, covariance, timestamps, sources
 * or anything that could identify a capture. Every observation carries the
 * representative boundary, and nothing here claims a force, a torque, a
 * muscle or a metric position.
 */
export const COACH_ADAPTER_REVISION = "representative_profile_adapter_v1";

const FRAME_COUNT = 101;
/** The same head derivation the sequence viewer draws: 62 % of the neck-to-spine vector above the neck. */
const HEAD_ABOVE_NECK = 0.62;

export const BOUNDARY_CAVEAT = "representative phase-fused 4D estimate, not actual 3D";
export const DERIVED_HEAD_CAVEAT = "head position is derived from the shoulders and hips";
const MODE_CAVEAT: Readonly<Record<RepresentativePose4DV2["mode"], string>> = Object.freeze({
  basic_1_plus_1: "basic_1_plus_1: one take per view",
  high_accuracy_3_plus_3: "high_accuracy_3_plus_3: three takes per view",
});

type Side = "left" | "right";
type Joints = RepresentativePoseFrameV2["joints"];

const sub = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mid = (a: Vector3, b: Vector3): Vector3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const norm = (v: Vector3): number => Math.hypot(v.x, v.y, v.z);
const degrees = (radians: number): number => (radians * 180) / Math.PI;
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Interior angle at `vertex` between the segments to `a` and `b`, in degrees. */
function angleAt(vertex: Vector3, a: Vector3, b: Vector3): number {
  const u = sub(a, vertex);
  const v = sub(b, vertex);
  const lengths = norm(u) * norm(v);
  if (!(lengths > 1e-9)) throw new Error("degenerate joint angle");
  return degrees(Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / lengths))));
}

function derivedHead(joints: Joints): Vector3 {
  const neck = mid(joints.leftShoulder, joints.rightShoulder);
  const pelvis = mid(joints.leftHip, joints.rightHip);
  const spine = mid(neck, pelvis);
  const torso = sub(neck, spine);
  return { x: neck.x + torso.x * HEAD_ABOVE_NECK, y: neck.y + torso.y * HEAD_ABOVE_NECK, z: neck.z + torso.z * HEAD_ABOVE_NECK };
}

const joint = (side: Side, name: "Shoulder" | "Elbow" | "Wrist" | "Hip" | "Knee" | "Ankle"): CoachJointV1 => `${side}${name}` as CoachJointV1;

type Measurement = {
  anchor: CoachPhaseAnchorV1;
  joints: (side: Side) => CoachJointV1[];
  reference: string;
  compute: (joints: Joints, side: Side, hand: ShootingHandV2) => number;
  caveats?: readonly string[];
};

/** Everything the adapter measures. Adding a metric here means adding it to the contract on both sides first. */
const MEASUREMENTS: Readonly<Record<Exclude<CoachMetricV1, "capture_quality">, Measurement>> = {
  release_elbow_angle_deg: {
    anchor: "releaseProxy",
    joints: (side) => [joint(side, "Shoulder"), joint(side, "Elbow"), joint(side, "Wrist")],
    reference: "angle at the shooting elbow between upper arm and forearm",
    compute: (j, side) => angleAt(j[joint(side, "Elbow")], j[joint(side, "Shoulder")], j[joint(side, "Wrist")]),
  },
  release_wrist_height_sb: {
    anchor: "releaseProxy",
    joints: (side) => [joint(side, "Shoulder"), joint(side, "Wrist")],
    reference: "shooting wrist height above the shooting shoulder",
    compute: (j, side) => j[joint(side, "Wrist")].y - j[joint(side, "Shoulder")].y,
  },
  release_elbow_lateral_offset_sb: {
    anchor: "releaseProxy",
    joints: (side) => [joint(side, "Shoulder"), joint(side, "Elbow")],
    reference: "shooting elbow outside the shooting shoulder; positive = away from the midline",
    compute: (j, side, hand) => (j[joint(side, "Elbow")].x - j[joint(side, "Shoulder")].x) * (hand === "left" ? -1 : 1),
  },
  release_shoulder_line_yaw_deg: {
    anchor: "releaseProxy",
    joints: () => ["leftShoulder", "rightShoulder"],
    reference: "turn of the shoulder line relative to the front view; 0 = square",
    compute: (j) => {
      const line = sub(j.rightShoulder, j.leftShoulder);
      return degrees(Math.atan2(line.z, line.x));
    },
  },
  deepest_dip_knee_angle_deg: {
    anchor: "deepestDip",
    joints: (side) => [joint(side, "Hip"), joint(side, "Knee"), joint(side, "Ankle")],
    reference: "angle at the shooting-side knee at the deepest dip",
    compute: (j, side) => angleAt(j[joint(side, "Knee")], j[joint(side, "Hip")], j[joint(side, "Ankle")]),
  },
  follow_through_elbow_angle_deg: {
    anchor: "followThrough",
    joints: (side) => [joint(side, "Shoulder"), joint(side, "Elbow"), joint(side, "Wrist")],
    reference: "angle at the shooting elbow at follow-through; 180 = fully extended",
    compute: (j, side) => angleAt(j[joint(side, "Elbow")], j[joint(side, "Shoulder")], j[joint(side, "Wrist")]),
  },
  follow_through_wrist_over_head_sb: {
    anchor: "followThrough",
    joints: (side) => [joint(side, "Wrist"), "leftShoulder", "rightShoulder"],
    reference: "shooting wrist above the derived head at follow-through",
    compute: (j, side) => j[joint(side, "Wrist")].y - derivedHead(j).y,
    caveats: [DERIVED_HEAD_CAVEAT],
  },
};

function assertRepresentative(profile: RepresentativePose4DV2): void {
  if (profile.boundary !== REPRESENTATIVE_BOUNDARY) throw new Error("profile boundary must be the representative phase-fused estimate");
  if (profile.frames.length !== FRAME_COUNT) throw new Error(`representative profile must hold ${FRAME_COUNT} phases`);
  for (const anchor of COACH_PHASE_ANCHORS) {
    if (!profile.phaseAnchors.some((candidate) => candidate.id === anchor)) throw new Error(`profile has no ${anchor} anchor`);
  }
}

/** The stored frame closest to a named phase anchor. */
export function representativeFrameAt(profile: RepresentativePose4DV2, anchor: CoachPhaseAnchorV1): RepresentativePoseFrameV2 {
  const found = profile.phaseAnchors.find((candidate) => candidate.id === anchor);
  if (!found || !Number.isFinite(found.phase)) throw new Error(`profile has no ${anchor} anchor`);
  const last = profile.frames.length - 1;
  return profile.frames[Math.max(0, Math.min(last, Math.round(found.phase * last)))];
}

export function buildCoachObservations(profile: RepresentativePose4DV2, shootingHand: ShootingHandV2): CoachObservationV1[] {
  assertRepresentative(profile);
  const side: Side = shootingHand;
  const caveats = [BOUNDARY_CAVEAT, MODE_CAVEAT[profile.mode]];
  const measured = (Object.entries(MEASUREMENTS) as [Exclude<CoachMetricV1, "capture_quality">, Measurement][]).map(([metric, measurement]): CoachObservationV1 => {
    const frame = representativeFrameAt(profile, measurement.anchor);
    const joints = measurement.joints(side);
    const value = round2(measurement.compute(frame.joints, side, shootingHand));
    if (!Number.isFinite(value)) throw new Error(`${metric} must be finite`);
    return {
      id: `obs_${metric}`,
      metric,
      value,
      unit: COACH_METRIC_UNITS_V1[metric],
      reference: measurement.reference,
      // The widest cone among the joints used, capped by the capture mode and the quality gate.
      measurement_confidence: observationConfidence(profile, frame, joints),
      source: "representative_phase_fused_4d",
      boundary: REPRESENTATIVE_BOUNDARY,
      phase_anchor: measurement.anchor,
      joints,
      caveats: [...caveats, ...(measurement.caveats ?? [])],
    };
  });
  const quality: CoachObservationV1 = {
    id: "obs_capture_quality",
    metric: "capture_quality",
    value: profile.quality.passed ? "passed" : "recapture_needed",
    unit: "label",
    reference: "reconstruction quality gate of the representative profile",
    measurement_confidence: "high",
    source: "representative_phase_fused_4d",
    boundary: REPRESENTATIVE_BOUNDARY,
    phase_anchor: null,
    joints: [],
    caveats: profile.quality.reasons.slice(0, 8),
  };
  return [...measured, quality];
}

export type BuildCoachRequestInput = {
  profile: RepresentativePose4DV2;
  shootingHand: ShootingHandV2;
  /** Opaque, caller-generated; it correlates the reply, nothing else. */
  requestId: string;
  locale: CoachLocaleV1;
  player: { skillLevel: SkillLevel | null; trainingGoal: TrainingGoal | null };
  action?: CoachShotActionV1;
  evidence?: readonly CoachEvidenceItemV1[];
  recentHistory?: readonly string[];
};

/** A schema-valid request from a representative profile and the caller's context; throws on a programming error. */
export function buildCoachRequest(input: BuildCoachRequestInput): CoachRequestV1 {
  const request = {
    schema_version: COACH_SCHEMA_VERSION,
    request_id: input.requestId,
    locale: input.locale,
    player: { handedness: input.shootingHand, skill_level: input.player.skillLevel, training_goal: input.player.trainingGoal },
    context: {
      action: input.action ?? "unknown",
      capture_protocol: input.profile.mode,
      quality_passed: input.profile.quality.passed,
      quality_reasons: input.profile.quality.reasons.slice(0, 8),
    },
    observations: buildCoachObservations(input.profile, input.shootingHand),
    evidence: [...(input.evidence ?? [])],
    recent_history: [...(input.recentHistory ?? [])],
  };
  const parsed = parseCoachRequestV1(request);
  if (!parsed.ok) throw new Error(`coach request is invalid: ${parsed.issues.join("; ")}`);
  return parsed.value;
}
