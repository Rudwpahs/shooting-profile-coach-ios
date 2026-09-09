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
  "follow_through_elbow_angle_deg",
  "follow_through_wrist_over_head_sb",
  "capture_quality",
] as const;
export type CoachMetricV1 = (typeof COACH_METRICS_V1)[number];

/** V1 has exactly one source of observations; a new source is a schema migration, not a new enum value. */
export const COACH_OBSERVATION_SOURCES = ["representative_phase_fused_4d"] as const;
export type CoachObservationSourceV1 = (typeof COACH_OBSERVATION_SOURCES)[number];

export const COACH_OBSERVATION_BOUNDARIES = [REPRESENTATIVE_BOUNDARY] as const;
export type CoachObservationBoundaryV1 = (typeof COACH_OBSERVATION_BOUNDARIES)[number];

export const COACH_UNITS = ["deg", "shoulder_breadths", "label"] as const;
export type CoachUnitV1 = (typeof COACH_UNITS)[number];

/** Each metric has one unit; a value is a bounded number for a measured unit and a code for a label. */
export const COACH_METRIC_UNITS_V1: Readonly<Record<CoachMetricV1, CoachUnitV1>> = Object.freeze({
  release_elbow_angle_deg: "deg",
  release_wrist_height_sb: "shoulder_breadths",
  release_elbow_lateral_offset_sb: "shoulder_breadths",
  release_shoulder_line_yaw_deg: "deg",
  deepest_dip_knee_angle_deg: "deg",
  follow_through_elbow_angle_deg: "deg",
  follow_through_wrist_over_head_sb: "shoulder_breadths",
  capture_quality: "label",
});

export const COACH_UNIT_BOUNDS_V1: Readonly<Record<Exclude<CoachUnitV1, "label">, readonly [number, number]>> = Object.freeze({
  deg: [-360, 360],
  shoulder_breadths: [-10, 10],
});

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
  value: z.union([z.number(), z.string().max(COACH_LIMITS.labelValueLength)]),
  unit: z.enum(COACH_UNITS),
  reference: z.string().max(COACH_LIMITS.referenceLength).nullable(),
  measurement_confidence: z.enum(COACH_CONFIDENCE),
  source: z.enum(COACH_OBSERVATION_SOURCES),
  boundary: z.enum(COACH_OBSERVATION_BOUNDARIES),
  phase_anchor: z.enum(COACH_PHASE_ANCHORS).nullable(),
  joints: z.array(z.enum(COACH_JOINTS)).max(COACH_JOINTS.length).refine((joints) => new Set(joints).size === joints.length, { message: "joints must be unique" }),
  caveats: z.array(z.string().max(COACH_LIMITS.caveatLength)).max(COACH_LIMITS.caveats),
}).superRefine((observation, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  const expectedUnit = COACH_METRIC_UNITS_V1[observation.metric];
  if (observation.unit !== expectedUnit) issue("unit", `${observation.metric} is measured in ${expectedUnit}`);
  if (observation.unit === "label") {
    if (typeof observation.value !== "string" || !COACH_CODE_PATTERN.test(observation.value)) issue("value", "a label value is a stable code");
  } else {
    const [min, max] = COACH_UNIT_BOUNDS_V1[observation.unit];
    if (typeof observation.value !== "number" || observation.value < min || observation.value > max) {
      issue("value", `${observation.unit} values are numbers within ${min}..${max}`);
    }
  }
  if (observation.metric === "capture_quality") {
    if (observation.phase_anchor !== null) issue("phase_anchor", "the quality label is not a pose and has no phase anchor");
    if (observation.joints.length > 0) issue("joints", "the quality label is not a pose and names no joints");
  } else {
    if (observation.phase_anchor === null) issue("phase_anchor", "a measurement names the phase anchor it was taken at");
    if (observation.joints.length === 0) issue("joints", "a measurement names at least one joint it was taken from");
  }
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

/** What no response may claim to know from a representative profile; every response declares them. */
export const COACH_DO_NOT_INFER_V1 = ["ground_reaction_force", "joint_torque", "muscle_activation", "actual_metric_3d_position"] as const;

export const COACH_PROVIDER_IDS = ["deterministic_v1", "remote_formpath_coach_v1"] as const;
export type CoachProviderIdV1 = (typeof COACH_PROVIDER_IDS)[number];

const observationId = z.string().max(64).regex(COACH_OBSERVATION_ID_PATTERN);
const uniqueStrings = (items: readonly string[]) => new Set(items).size === items.length;
const singleLine = (max: number) => z.string().min(1).max(max).refine((text) => !/[\r\n]/.test(text), { message: "must be one line" });

export const CoachHypothesisV1Schema = z.strictObject({
  statement: z.string().min(1).max(240),
  confidence: z.enum(COACH_CONFIDENCE),
  supporting_observation_ids: z.array(observationId).min(1).max(8).refine(uniqueStrings, { message: "observation ids must be unique" }),
  competing_explanations: z.array(z.string().max(160)).max(4),
});
export type CoachHypothesisV1 = z.infer<typeof CoachHypothesisV1Schema>;

export const CoachDrillV1Schema = z.strictObject({
  name: z.string().min(1).max(80),
  purpose: z.string().min(1).max(200),
  constraints: z.array(z.string().max(120)).max(6),
  success_criteria: z.array(z.string().max(120)).max(6),
  retest: z.string().min(1).max(200),
});
export type CoachDrillV1 = z.infer<typeof CoachDrillV1Schema>;

/**
 * The only way a response may point at the body: by naming one observation
 * the request already contained. The app resolves where that observation
 * lives (its joints and phase anchor); the model never emits a position.
 */
export const PrimaryVisualCueV1Schema = z.strictObject({
  observation_id: observationId,
  label: z.string().min(1).max(40),
});
export type PrimaryVisualCueV1 = z.infer<typeof PrimaryVisualCueV1Schema>;

export const CoachProviderStampV1Schema = z.strictObject({
  id: z.enum(COACH_PROVIDER_IDS),
  revision: z.string().min(1).max(64),
});
export type CoachProviderStampV1 = z.infer<typeof CoachProviderStampV1Schema>;

export const CoachResponseV1Schema = z.strictObject({
  schema_version: z.literal(COACH_SCHEMA_VERSION),
  request_id: z.string().regex(COACH_REQUEST_ID_PATTERN),
  observation_summary: z.array(z.string().min(1).max(160)).min(1).max(6),
  hypotheses: z.array(CoachHypothesisV1Schema).max(3),
  confidence: z.enum(COACH_CONFIDENCE),
  coaching_comment: singleLine(140),
  do_not_infer: z.array(code).min(1).max(12).refine(
    (items) => COACH_DO_NOT_INFER_V1.every((item) => items.includes(item)),
    { message: "must include ground_reaction_force, joint_torque, muscle_activation and actual_metric_3d_position" },
  ),
  drills: z.array(CoachDrillV1Schema).max(2),
  retest_plan: z.array(z.string().min(1).max(160)).max(4),
  evidence_used: z.array(z.number().int().min(1)).max(COACH_LIMITS.evidence).refine((items) => new Set(items).size === items.length, { message: "research unit ids must be unique" }),
  primary_visual_cue: PrimaryVisualCueV1Schema.nullable(),
  provider: CoachProviderStampV1Schema,
});
export type CoachResponseV1 = z.infer<typeof CoachResponseV1Schema>;

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

export function parseCoachResponseV1(value: unknown): CoachParseResult<CoachResponseV1> {
  return parseWith(CoachResponseV1Schema, value);
}

/**
 * Grounding: a response is only valid for the request it answers. Every
 * observation it names, and every research unit it cites, must exist in that
 * request. This is the rule that keeps a model from pointing at a body part
 * the app never measured.
 */
export type CoachGroundingReasonV1 =
  | { code: "request_id_mismatch"; expected: string; received: string }
  | { code: "cue_observation_unknown"; observation_id: string }
  | { code: "hypothesis_observation_unknown"; hypothesis_index: number; observation_id: string }
  | { code: "evidence_unknown"; research_unit_id: number };

export type CoachGroundingResult = { ok: true } | { ok: false; reasons: CoachGroundingReasonV1[] };

export function validateCoachResponseForRequest(request: CoachRequestV1, response: CoachResponseV1): CoachGroundingResult {
  const reasons: CoachGroundingReasonV1[] = [];
  if (response.request_id !== request.request_id) {
    reasons.push({ code: "request_id_mismatch", expected: request.request_id, received: response.request_id });
  }
  const observations = new Set(request.observations.map((item) => item.id));
  if (response.primary_visual_cue && !observations.has(response.primary_visual_cue.observation_id)) {
    reasons.push({ code: "cue_observation_unknown", observation_id: response.primary_visual_cue.observation_id });
  }
  response.hypotheses.forEach((hypothesis, index) => {
    for (const id of hypothesis.supporting_observation_ids) {
      if (!observations.has(id)) reasons.push({ code: "hypothesis_observation_unknown", hypothesis_index: index, observation_id: id });
    }
  });
  const evidence = new Set(request.evidence.map((item) => item.research_unit_id));
  for (const id of response.evidence_used) {
    if (!evidence.has(id)) reasons.push({ code: "evidence_unknown", research_unit_id: id });
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export type CoachResponseParseOutcome =
  | { status: "ok"; response: CoachResponseV1 }
  | { status: "schema_invalid"; issues: string[] }
  | { status: "grounding_invalid"; reasons: CoachGroundingReasonV1[] };

/** Schema first, grounding second: a provider reply is usable only when both pass. */
export function parseCoachResponseForRequest(request: CoachRequestV1, raw: unknown): CoachResponseParseOutcome {
  const parsed = parseCoachResponseV1(raw);
  if (!parsed.ok) return { status: "schema_invalid", issues: parsed.issues };
  const grounded = validateCoachResponseForRequest(request, parsed.value);
  return grounded.ok ? { status: "ok", response: parsed.value } : { status: "grounding_invalid", reasons: grounded.reasons };
}

/**
 * Where a cue lives, resolved from the observation the app measured. The UI
 * highlights these joints at this phase anchor; an observation without a pose
 * (the quality label) yields a text-only cue.
 */
export type CoachCueAnchorV1 =
  | { kind: "joints"; observation_id: string; label: string; joints: CoachJointV1[]; phase_anchor: CoachPhaseAnchorV1 }
  | { kind: "text_only"; observation_id: string; label: string };

export function resolveCoachCueAnchor(request: CoachRequestV1, cue: PrimaryVisualCueV1): CoachCueAnchorV1 | null {
  const observation = request.observations.find((item) => item.id === cue.observation_id);
  if (!observation) return null;
  if (observation.joints.length === 0 || observation.phase_anchor === null) {
    return { kind: "text_only", observation_id: cue.observation_id, label: cue.label };
  }
  return { kind: "joints", observation_id: cue.observation_id, label: cue.label, joints: [...observation.joints], phase_anchor: observation.phase_anchor };
}
