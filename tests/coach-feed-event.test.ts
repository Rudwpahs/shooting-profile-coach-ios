import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";
import { describe, expect, it } from "vitest";

import type { CoachRequestV1 } from "@/lib/coach/contract";
import { deterministicCoachResponse } from "@/lib/coach/deterministic-provider";
import {
  COACH_FEED_COOLDOWN_MS,
  COACH_FEED_EVENT_CLASSES,
  CoachFeedEventV1Schema,
  buildCoachFeedEvent,
  parseCoachFeedEventV1,
  rankCoachFeedEvents,
  type CoachFeedEventV1,
} from "@/lib/coach/feed-event";
import type { CoachProviderResult } from "@/lib/coach/provider";
import { buildCoachRequest } from "@/lib/coach/representative-profile-adapter";
import type { RepresentativePose4DV2 } from "@/lib/shooting-profile/types";
import { buildTwoViewRepresentativeProfile } from "@/lib/shooting-profile/two-view-pipeline";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

const session = syntheticLandmarkSession({ mode: "basic_1_plus_1", shootingHand: "right" });
const pipeline = buildTwoViewRepresentativeProfile({
  mode: "basic_1_plus_1",
  shootingHand: "right",
  attempts: [...session.front, ...session.shootingSide].map((sequence) => ({ id: `${sequence.view}-${sequence.takeIndex}`, sequence })),
});
if (pipeline.status !== "complete") throw new Error("fixture must reconstruct");
const profile: RepresentativePose4DV2 = pipeline.profile;

const requestFor = (qualityPassed = true): CoachRequestV1 => buildCoachRequest({
  profile: qualityPassed ? profile : { ...profile, quality: { passed: false, reasons: ["uncertainty_exceeds_limit"] } },
  shootingHand: "right",
  requestId: "req_abcdef0123456789",
  locale: "ko",
  player: { skillLevel: "developing", trainingGoal: "release" },
  action: "jump_shot",
});

const NOW = 1_800_000_000_000;
const request = requestFor();
const ok: CoachProviderResult = { status: "ok", response: deterministicCoachResponse(request) };
const base = { eventId: "evt_0123456789abcdef", profileId: "profile_ABC123def456", request, result: ok, now: NOW };

describe("CoachFeedEventV1", () => {
  it("builds an eligible new-profile event from a grounded reply, referencing observations by id only", () => {
    const event = buildCoachFeedEvent(base);
    expect(parseCoachFeedEventV1(JSON.parse(JSON.stringify(event)))).toEqual({ ok: true, value: event });
    expect(event).toEqual({
      schema_version: 1,
      event_id: "evt_0123456789abcdef",
      event_class: "new_representative_profile",
      source: { profile_id: "profile_ABC123def456", retest_profile_id: null },
      request_id: request.request_id,
      observation_ids: request.observations.map((item) => item.id),
      primary_observation_id: ok.status === "ok" ? ok.response.primary_visual_cue?.observation_id : null,
      cue: ok.status === "ok" ? ok.response.primary_visual_cue : null,
      confidence: ok.status === "ok" ? ok.response.confidence : "very_low",
      message: ok.status === "ok" ? ok.response.coaching_comment : null,
      evidence_summary: "8 observations, confidence medium",
      eligibility: { eligible: true, reasons: [], cooldown_until_ms: NOW + COACH_FEED_COOLDOWN_MS },
      created_at_ms: NOW,
    });
    expect(COACH_FEED_EVENT_CLASSES).toEqual(["new_representative_profile", "retest_comparison", "quality_recapture_needed"]);
    expect(COACH_FEED_COOLDOWN_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("is a retest comparison when a retest profile is named", () => {
    const event = buildCoachFeedEvent({ ...base, retestProfileId: "profile_RETEST9876zyx" });
    expect(event.event_class).toBe("retest_comparison");
    expect(event.source).toEqual({ profile_id: "profile_ABC123def456", retest_profile_id: "profile_RETEST9876zyx" });
    expect(event.eligibility.eligible).toBe(true);
  });

  it("is an ineligible quality event when the capture failed its gate", () => {
    const failed = requestFor(false);
    const event = buildCoachFeedEvent({ ...base, request: failed, result: { status: "ok", response: deterministicCoachResponse(failed) } });
    expect(event.event_class).toBe("quality_recapture_needed");
    expect(event.eligibility.eligible).toBe(false);
    expect(event.eligibility.reasons).toContain("quality_recapture_needed");
    expect(event.cue).toEqual({ observation_id: "obs_capture_quality", label: "촬영 품질" });
  });

  it("is ineligible without a usable reply, and says why, with nothing attached", () => {
    for (const result of [
      { status: "unavailable", reason: "offline", retryable: true, detail: null },
      { status: "cancelled" },
      { status: "stale", superseded_by: "req_ffffffffffffffff" },
    ] as CoachProviderResult[]) {
      const event = buildCoachFeedEvent({ ...base, result });
      expect(event.eligibility).toEqual({ eligible: false, reasons: ["coach_unavailable"], cooldown_until_ms: null });
      expect(event.message).toBeNull();
      expect(event.cue).toBeNull();
      expect(event.primary_observation_id).toBeNull();
      expect(event.confidence).toBe("very_low");
      expect(event.evidence_summary).toBe("8 observations, coach unavailable");
      expect(parseCoachFeedEventV1(event).ok).toBe(true);
    }
  });

  it("is ineligible below medium confidence or without a cue", () => {
    const response = ok.status === "ok" ? ok.response : null;
    if (!response) throw new Error("fixture");
    const low = buildCoachFeedEvent({ ...base, result: { status: "ok", response: { ...response, confidence: "low" } } });
    expect(low.eligibility).toEqual({ eligible: false, reasons: ["confidence_below_medium"], cooldown_until_ms: null });
    const noCue = buildCoachFeedEvent({ ...base, result: { status: "ok", response: { ...response, primary_visual_cue: null } } });
    expect(noCue.eligibility).toEqual({ eligible: false, reasons: ["no_visual_cue"], cooldown_until_ms: null });
    expect(noCue.primary_observation_id).toBeNull();
    expect(noCue.message).toBe(response.coaching_comment);
  });

  it("honours a cooldown after the last shown event", () => {
    const recent = buildCoachFeedEvent({ ...base, lastEventAtMs: NOW - 60 * 60 * 1000 });
    expect(recent.eligibility).toEqual({ eligible: false, reasons: ["cooldown_active"], cooldown_until_ms: NOW - 60 * 60 * 1000 + COACH_FEED_COOLDOWN_MS });
    const old = buildCoachFeedEvent({ ...base, lastEventAtMs: NOW - 25 * 60 * 60 * 1000 });
    expect(old.eligibility.eligible).toBe(true);
  });

  it("never carries a position and refuses a cue or primary id outside its own observations", () => {
    const event = buildCoachFeedEvent(base);
    const rejects = (value: unknown, pathPrefix: string) => {
      const result = parseCoachFeedEventV1(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues.some((issue) => issue.startsWith(pathPrefix))).toBe(true);
    };
    rejects({ ...event, cue: { observation_id: "obs_ghost", label: "?" } }, "cue");
    rejects({ ...event, primary_observation_id: "obs_ghost" }, "primary_observation_id");
    rejects({ ...event, cue: { ...event.cue, x: 0.4 } }, "cue.x");
    rejects({ ...event, position: { x: 0.4, y: 0.2 } }, "position");
    rejects({ ...event, event_id: "0123" }, "event_id");
    rejects({ ...event, event_class: "promo" }, "event_class");
    rejects({ ...event, created_at_ms: -1 }, "created_at_ms");
    rejects({ ...event, observation_ids: [] }, "observation_ids");
    rejects({ ...event, message: "two\nlines" }, "message");
    rejects({ ...event, evidence_summary: "x".repeat(121) }, "evidence_summary");
    rejects({ ...event, source: { ...event.source, profile_id: "a b" } }, "source.profile_id");
  });

  it("ranks eligible events first, then by confidence, then newest, deterministically", () => {
    const response = ok.status === "ok" ? ok.response : null;
    if (!response) throw new Error("fixture");
    const eligibleMedium = buildCoachFeedEvent({ ...base, eventId: "evt_medium0000000000", now: NOW - 10 });
    const eligibleHigh = buildCoachFeedEvent({ ...base, eventId: "evt_high000000000000", now: NOW - 20, result: { status: "ok", response: { ...response, confidence: "high" } } });
    const newerMedium = buildCoachFeedEvent({ ...base, eventId: "evt_newer00000000000", now: NOW });
    const ineligible = buildCoachFeedEvent({ ...base, eventId: "evt_cold000000000000", now: NOW + 5, result: { status: "cancelled" } });
    const ranked: CoachFeedEventV1[] = rankCoachFeedEvents([ineligible, eligibleMedium, newerMedium, eligibleHigh]);
    expect(ranked.map((event) => event.event_id)).toEqual(["evt_high000000000000", "evt_newer00000000000", "evt_medium0000000000", "evt_cold000000000000"]);
    expect(rankCoachFeedEvents([])).toEqual([]);
  });

  it("keeps the exported JSON schema file current", () => {
    const exported = JSON.parse(readFileSync(path.resolve("contracts/coach-feed-event-v1.schema.json"), "utf8"));
    expect(exported).toEqual({ ...z.toJSONSchema(CoachFeedEventV1Schema), $id: "coach-feed-event-v1.schema.json", title: "CoachFeedEventV1" });
    expect(exported.properties.schema_version.const).toBe(1);
    expect(exported.additionalProperties).toBe(false);
  });
});
