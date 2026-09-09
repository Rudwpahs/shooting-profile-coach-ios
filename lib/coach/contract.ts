import { z } from "zod";

import type { SkillLevel, TrainingGoal } from "@/lib/recommendation";
import { PERSISTED_JOINT_NAMES_V2, type CaptureProtocolV2 } from "@/lib/shooting-profile/types";

/**
 * Coach contract, schema version 1.
 *
 * This is the one shape the app, the deterministic provider and the remote
 * FormPath Coach service agree on. It is deliberately small and closed: every
 * object is strict, every category is an enum, every free-text field is
 * capped, and nothing that identifies a person, a file or a frame has a place
 * to live. The Python models in `ml/coach/src/formpath_coach/schemas.py`
 * mirror it field for field; `contracts/fixtures/coach` is the shared proof.
 */
export const COACH_SCHEMA_VERSION = 1 as const;

export const REPRESENTATIVE_BOUNDARY = "representative_phase_fused_4d_estimate_not_actual_3d" as const;

export const COACH_CONFIDENCE = ["very_low", "low", "medium", "high", "very_high"] as const;
export type CoachConfidenceV1 = (typeof COACH_CONFIDENCE)[number];

export const COACH_PHASE_ANCHORS = ["ready", "deepestDip", "rise", "releaseProxy", "followThrough"] as const;
export type CoachPhaseAnchorV1 = (typeof COACH_PHASE_ANCHORS)[number];

export const COACH_JOINTS = PERSISTED_JOINT_NAMES_V2;
export type CoachJointV1 = (typeof COACH_JOINTS)[number];

/**
 * The only metrics an observation may carry. Each one is a geometric or
 * timing quantity the representative profile can support; forces, torques,
 * muscle activation and actual metric 3D positions are not here on purpose.
 */
export const COACH_METRICS_V1 = [
  "release_elbow_angle_deg",
  "release_wrist_height_sb",
  "release_elbow_lateral_offset_sb",
  "release_shoulder_line_yaw_deg",
  "deepest_dip_knee_angle_deg",
  "rise_to_release_phase_span",
  "follow_through_wrist_over_head_sb",
  "capture_quality",
] as const;
export type CoachMetricV1 = (typeof COACH_METRICS_V1)[number];

export const COACH_OBSERVATION_SOURCES = ["representative_phase_fused_4d", "user_report", "manual_tag"] as const;
export type CoachObservationSourceV1 = (typeof COACH_OBSERVATION_SOURCES)[number];

export const COACH_OBSERVATION_BOUNDARIES = [REPRESENTATIVE_BOUNDARY, "self_report_not_measured", "manual_tag_not_measured"] as const;
export type CoachObservationBoundaryV1 = (typeof COACH_OBSERVATION_BOUNDARIES)[number];

export const COACH_UNITS = ["deg", "shoulder_breadths", "phase_fraction", "label"] as const;
export type CoachUnitV1 = (typeof COACH_UNITS)[number];

export const COACH_HANDEDNESS = ["left", "right", "unknown"] as const;
export const COACH_SKILL_LEVELS = ["beginner", "developing", "advanced"] as const satisfies readonly SkillLevel[];
export const COACH_TRAINING_GOALS = ["consistency", "range", "release", "rhythm"] as const satisfies readonly TrainingGoal[];
export const COACH_SHOT_ACTIONS = ["set_shot", "jump_shot", "free_throw", "unknown"] as const;
export const COACH_CAPTURE_PROTOCOLS = ["basic_1_plus_1", "high_accuracy_3_plus_3"] as const satisfies readonly CaptureProtocolV2[];
export const COACH_EVIDENCE_TIERS = ["A", "A-", "B+", "B", "C", "D", "H"] as const;
export const COACH_LOCALES = ["ko", "en"] as const;

export const COACH_REQUEST_ID_PATTERN = /^req_[a-z0-9]{8,64}$/;
export const COACH_OBSERVATION_ID_PATTERN = /^obs_[a-z0-9]+(?:_[a-z0-9]+)*$/;
/** Stable machine codes: lower-case snake case, never a sentence. */
export const COACH_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export const COACH_LIMITS = Object.freeze({
  observations: 32,
  evidence: 16,
  recentHistory: 10,
  qualityReasons: 8,
  caveats: 8,
  caveatLength: 160,
  referenceLength: 120,
  labelValueLength: 64,
});

const code = z.string().regex(COACH_CODE_PATTERN);

function unique<T>(pick: (item: T) => unknown, message: string) {
  return { message, check: (items: readonly T[]) => new Set(items.map(pick)).size === items.length };
}

const uniqueObservationIds = unique<{ id: string }>((item) => item.id, "observation ids must be unique");
const uniqueEvidenceIds = unique<{ research_unit_id: number }>((item) => item.research_unit_id, "research unit ids must be unique");

export const CoachObservationV1Schema = z.strictObject({
  id: z.string().max(64).regex(COACH_OBSERVATION_ID_PATTERN),
  metric: z.enum(COACH_METRICS_V1),
  value: z.union([z.number(), z.string().max(COACH_LIMITS.labelValueLength), z.boolean(), z.null()]),
  unit: z.enum(COACH_UNITS).nullable(),
  reference: z.string().max(COACH_LIMITS.referenceLength).nullable(),
  measurement_confidence: z.enum(COACH_CONFIDENCE),
  source: z.enum(COACH_OBSERVATION_SOURCES),
  boundary: z.enum(COACH_OBSERVATION_BOUNDARIES),
  phase_anchor: z.enum(COACH_PHASE_ANCHORS).nullable(),
  joints: z.array(z.enum(COACH_JOINTS)).max(COACH_JOINTS.length).refine((joints) => new Set(joints).size === joints.length, { message: "joints must be unique" }),
  caveats: z.array(z.string().max(COACH_LIMITS.caveatLength)).max(COACH_LIMITS.caveats),
});
export type CoachObservationV1 = z.infer<typeof CoachObservationV1Schema>;

export const CoachPlayerContextV1Schema = z.strictObject({
  handedness: z.enum(COACH_HANDEDNESS),
  skill_level: z.enum(COACH_SKILL_LEVELS).nullable(),
  training_goal: z.enum(COACH_TRAINING_GOALS).nullable(),
});
export type CoachPlayerContextV1 = z.infer<typeof CoachPlayerContextV1Schema>;

export const CoachShotContextV1Schema = z.strictObject({
  action: z.enum(COACH_SHOT_ACTIONS),
  capture_protocol: z.enum(COACH_CAPTURE_PROTOCOLS),
  quality_passed: z.boolean(),
  quality_reasons: z.array(code).max(COACH_LIMITS.qualityReasons),
});
export type CoachShotContextV1 = z.infer<typeof CoachShotContextV1Schema>;

export const CoachEvidenceItemV1Schema = z.strictObject({
  research_unit_id: z.number().int().min(1),
  claim: z.string().min(1).max(300),
  evidence_tier: z.enum(COACH_EVIDENCE_TIERS),
  source_title: z.string().max(200).nullable(),
  supported_inferences: z.array(z.string().max(120)).max(8),
  forbidden_inferences: z.array(z.string().max(120)).max(8),
  limitations: z.array(z.string().max(160)).max(8),
  contradiction_group: z.string().max(64).nullable(),
});
export type CoachEvidenceItemV1 = z.infer<typeof CoachEvidenceItemV1Schema>;

export const CoachRequestV1Schema = z.strictObject({
  schema_version: z.literal(COACH_SCHEMA_VERSION),
  request_id: z.string().regex(COACH_REQUEST_ID_PATTERN),
  locale: z.enum(COACH_LOCALES),
  player: CoachPlayerContextV1Schema,
  context: CoachShotContextV1Schema,
  observations: z.array(CoachObservationV1Schema).min(1).max(COACH_LIMITS.observations).refine(uniqueObservationIds.check, { message: uniqueObservationIds.message }),
  evidence: z.array(CoachEvidenceItemV1Schema).max(COACH_LIMITS.evidence).refine(uniqueEvidenceIds.check, { message: uniqueEvidenceIds.message }),
  recent_history: z.array(code).max(COACH_LIMITS.recentHistory),
});
export type CoachRequestV1 = z.infer<typeof CoachRequestV1Schema>;

export type CoachParseResult<T> = { ok: true; value: T } | { ok: false; issues: string[] };

/** One line per issue, `dotted.path: message`; unknown keys are named individually. */
export function formatCoachIssues(error: z.ZodError): string[] {
  return error.issues.flatMap((issue) => {
    const path = issue.path.map(String);
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => `${[...path, key].join(".")}: unrecognized key`);
    }
    return [`${path.join(".")}: ${issue.message}`];
  });
}

function parseWith<T>(schema: z.ZodType<T>, value: unknown): CoachParseResult<T> {
  const result = schema.safeParse(value);
  return result.success ? { ok: true, value: result.data } : { ok: false, issues: formatCoachIssues(result.error) };
}

export function parseCoachRequestV1(value: unknown): CoachParseResult<CoachRequestV1> {
  return parseWith(CoachRequestV1Schema, value);
}

export function parseCoachObservationV1(value: unknown): CoachParseResult<CoachObservationV1> {
  return parseWith(CoachObservationV1Schema, value);
}
