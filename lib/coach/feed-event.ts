import { z } from "zod";

import {
  COACH_CONFIDENCE,
  COACH_OBSERVATION_ID_PATTERN,
  COACH_REQUEST_ID_PATTERN,
  COACH_SCHEMA_VERSION,
  PrimaryVisualCueV1Schema,
  formatCoachIssues,
  type CoachConfidenceV1,
  type CoachParseResult,
  type CoachRequestV1,
} from "@/lib/coach/contract";
import type { CoachProviderResult } from "@/lib/coach/provider";

/**
 * CoachFeedEventV1: the thin product event that tells Home whether a
 * coaching moment exists and what it may show. It references the request
 * and its observations by id, carries the grounded cue and the one-line
 * message the provider returned, and decides eligibility deterministically.
 * The model never chooses placement, ranking or eligibility; it never
 * emits a position; and when it is unavailable the event still exists,
 * ineligible, so Home can honestly show nothing.
 */
export const COACH_FEED_EVENT_CLASSES = ["new_representative_profile", "retest_comparison", "quality_recapture_needed"] as const;
export type CoachFeedEventClassV1 = (typeof COACH_FEED_EVENT_CLASSES)[number];

export const COACH_FEED_INELIGIBILITY_REASONS = [
  "coach_unavailable",
  "quality_recapture_needed",
  "confidence_below_medium",
  "no_visual_cue",
  "cooldown_active",
] as const;
export type CoachFeedIneligibilityReasonV1 = (typeof COACH_FEED_INELIGIBILITY_REASONS)[number];

/** One coaching moment per day at most; Home is a feed, not a dashboard. */
export const COACH_FEED_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const COACH_FEED_EVENT_ID_PATTERN = /^evt_[a-z0-9]{8,64}$/;
/** Opaque profile document ids; never a name, never a path. */
const PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

const observationId = z.string().max(64).regex(COACH_OBSERVATION_ID_PATTERN);
const singleLine = (max: number) => z.string().min(1).max(max).refine((text) => !/[\r\n]/.test(text), { message: "must be one line" });

export const CoachFeedEventV1Schema = z.strictObject({
  schema_version: z.literal(COACH_SCHEMA_VERSION),
  event_id: z.string().regex(COACH_FEED_EVENT_ID_PATTERN),
  event_class: z.enum(COACH_FEED_EVENT_CLASSES),
  source: z.strictObject({
    profile_id: z.string().regex(PROFILE_ID_PATTERN),
    retest_profile_id: z.string().regex(PROFILE_ID_PATTERN).nullable(),
  }),
  request_id: z.string().regex(COACH_REQUEST_ID_PATTERN),
  observation_ids: z.array(observationId).min(1).max(32).refine((ids) => new Set(ids).size === ids.length, { message: "observation ids must be unique" }),
  primary_observation_id: observationId.nullable(),
  cue: PrimaryVisualCueV1Schema.nullable(),
  confidence: z.enum(COACH_CONFIDENCE),
  message: singleLine(140).nullable(),
  evidence_summary: singleLine(120),
  eligibility: z.strictObject({
    eligible: z.boolean(),
    reasons: z.array(z.enum(COACH_FEED_INELIGIBILITY_REASONS)).max(8),
    cooldown_until_ms: z.number().int().min(0).nullable(),
  }),
  created_at_ms: z.number().int().min(0),
}).superRefine((event, ctx) => {
  const ids = new Set(event.observation_ids);
  if (event.primary_observation_id !== null && !ids.has(event.primary_observation_id)) {
    ctx.addIssue({ code: "custom", path: ["primary_observation_id"], message: "must be one of observation_ids" });
  }
  if (event.cue && !ids.has(event.cue.observation_id)) {
    ctx.addIssue({ code: "custom", path: ["cue", "observation_id"], message: "must be one of observation_ids" });
  }
});
export type CoachFeedEventV1 = z.infer<typeof CoachFeedEventV1Schema>;

export function parseCoachFeedEventV1(value: unknown): CoachParseResult<CoachFeedEventV1> {
  const result = CoachFeedEventV1Schema.safeParse(value);
  return result.success ? { ok: true, value: result.data } : { ok: false, issues: formatCoachIssues(result.error) };
}

const RANK: Readonly<Record<CoachConfidenceV1, number>> = Object.fromEntries(COACH_CONFIDENCE.map((band, index) => [band, index])) as Record<CoachConfidenceV1, number>;

export type BuildCoachFeedEventInput = {
  eventId: string;
  profileId: string;
  retestProfileId?: string | null;
  request: CoachRequestV1;
  result: CoachProviderResult;
  now: number;
  /** When the last coaching moment was shown; drives the cooldown. */
  lastEventAtMs?: number | null;
};

export function buildCoachFeedEvent(input: BuildCoachFeedEventInput): CoachFeedEventV1 {
  const response = input.result.status === "ok" ? input.result.response : null;
  const qualityPassed = input.request.context.quality_passed;
  const event_class: CoachFeedEventClassV1 = !qualityPassed
    ? "quality_recapture_needed"
    : input.retestProfileId
      ? "retest_comparison"
      : "new_representative_profile";
  const cue = response?.primary_visual_cue ?? null;

  const reasons: CoachFeedIneligibilityReasonV1[] = [];
  if (!response) {
    reasons.push("coach_unavailable");
  } else {
    if (!qualityPassed) reasons.push("quality_recapture_needed");
    if (RANK[response.confidence] < RANK.medium) reasons.push("confidence_below_medium");
    if (!cue) reasons.push("no_visual_cue");
  }
  const cooldownUntil = input.lastEventAtMs !== null && input.lastEventAtMs !== undefined ? input.lastEventAtMs + COACH_FEED_COOLDOWN_MS : null;
  const cooling = cooldownUntil !== null && input.now < cooldownUntil;
  if (response && cooling) reasons.push("cooldown_active");
  const eligible = reasons.length === 0;

  const count = input.request.observations.length;
  const event: CoachFeedEventV1 = {
    schema_version: COACH_SCHEMA_VERSION,
    event_id: input.eventId,
    event_class,
    source: { profile_id: input.profileId, retest_profile_id: input.retestProfileId ?? null },
    request_id: input.request.request_id,
    observation_ids: input.request.observations.map((item) => item.id),
    primary_observation_id: cue?.observation_id ?? null,
    cue,
    confidence: response?.confidence ?? "very_low",
    message: response?.coaching_comment ?? null,
    evidence_summary: response ? `${count} observations, confidence ${response.confidence}` : `${count} observations, coach unavailable`,
    eligibility: {
      eligible,
      reasons,
      cooldown_until_ms: eligible ? input.now + COACH_FEED_COOLDOWN_MS : cooling ? cooldownUntil : null,
    },
    created_at_ms: input.now,
  };
  const parsed = parseCoachFeedEventV1(event);
  if (!parsed.ok) throw new Error(`coach feed event is invalid: ${parsed.issues.join("; ")}`);
  return parsed.value;
}

/** Eligible first, then the surer, then the newer; ties break on the id so the order is total. */
export function rankCoachFeedEvents(events: readonly CoachFeedEventV1[]): CoachFeedEventV1[] {
  return [...events].sort((a, b) => (
    Number(b.eligibility.eligible) - Number(a.eligibility.eligible)
    || RANK[b.confidence] - RANK[a.confidence]
    || b.created_at_ms - a.created_at_ms
    || a.event_id.localeCompare(b.event_id)
  ));
}
