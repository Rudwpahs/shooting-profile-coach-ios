import { describe, expect, it } from "vitest";

import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { COACH_OBSERVATION_ID_PATTERN, COACH_REQUEST_ID_PATTERN, parseCoachRequestV1 } from "@/lib/coach/contract";
import { deterministicCoachResponse } from "@/lib/coach/deterministic-provider";
import "@/lib/coach/authenticated-transport";
import { COACH_FEED_EVENT_ID_PATTERN, parseCoachFeedEventV1 } from "@/lib/coach/feed-event";
import { buildHomeCoachRequest, homeCoachReel, opaqueId } from "@/lib/feed/home-coach";
import { createHomeCoachProvider } from "@/lib/feed/home-coach-provider";
import { representativeFixtureFromMotion } from "@/lib/feed/reel-fixtures";
import type { LatestRepresentativeState } from "@/hooks/use-latest-representative-profile";

const reference = ANONYMOUS_POSE_REFERENCES[0];
const profile = representativeFixtureFromMotion(reference.motion, "right");
const latest = {
  status: "ready",
  summary: { id: "abc123def456", mode: "basic_1_plus_1", shootingHand: "right", confidence: 0.65, createdAt: { toDate: () => new Date() } },
  record: { profile, shootingHand: "right", confidence: 0.65 },
} as unknown as Extract<LatestRepresentativeState, { status: "ready" }>;
const userProfile = { skillLevel: "developing", goal: "release" } as const;
const motion = { source: "representative", profile, shootingHand: "right" } as const;

describe("home coach chain", () => {
  it("mints opaque ids that satisfy the frozen patterns and never repeat", () => {
    const ids = Array.from({ length: 50 }, () => opaqueId("req"));
    expect(ids.every((id) => COACH_REQUEST_ID_PATTERN.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(50);
    expect(COACH_FEED_EVENT_ID_PATTERN.test(opaqueId("evt"))).toBe(true);
    expect(COACH_OBSERVATION_ID_PATTERN.test(opaqueId("req"))).toBe(false);
  });

  it("builds the request from the latest profile and the user's goal and skill, through the frozen adapter", () => {
    const request = buildHomeCoachRequest({ latest, userProfile, requestId: "req_home000000000001" });
    expect(parseCoachRequestV1(request)).toEqual({ ok: true, value: request });
    expect(request.player).toEqual({ handedness: "right", skill_level: "developing", training_goal: "release" });
    expect(request.context.capture_protocol).toBe("basic_1_plus_1");
    expect(request.locale).toBe("ko");
    expect(request.observations).toHaveLength(8);
    expect(JSON.stringify(request)).not.toMatch(/abc123def456|frames|covariance|timestamp/);
  });

  it("turns a usable reply into a coaching moment with the cue resolved, and anything else into none", () => {
    const request = buildHomeCoachRequest({ latest, userProfile, requestId: "req_home000000000001" });
    const response = deterministicCoachResponse(request);
    const usable = homeCoachReel({ request, result: { status: "ok", response }, eventId: "evt_home000000000001", profileId: "abc123def456", now: 1_800_000_000_000, lastEventAtMs: null, motion });
    expect(parseCoachFeedEventV1(usable.event).ok).toBe(true);
    expect(usable.event.eligibility.eligible).toBe(true);
    expect(usable.reel).toMatchObject({ kind: "coach", id: "coach-evt_home000000000001", message: response.coaching_comment, observationLabel: "릴리스 팔꿈치 각도" });
    expect(usable.reel?.cueAnchor).toMatchObject({ kind: "joints", joints: ["rightShoulder", "rightElbow", "rightWrist"], phase_anchor: "releaseProxy" });

    const unavailable = homeCoachReel({ request, result: { status: "unavailable", reason: "offline", retryable: true, detail: null }, eventId: "evt_home000000000002", profileId: "abc123def456", now: 1, lastEventAtMs: null, motion });
    expect(unavailable.reel).toBeNull();
    expect(unavailable.event.eligibility).toEqual({ eligible: false, reasons: ["coach_unavailable"], cooldown_until_ms: null });
    expect(homeCoachReel({ request, result: { status: "cancelled" }, eventId: "evt_home000000000003", profileId: "abc123def456", now: 1, lastEventAtMs: null, motion }).reel).toBeNull();
    expect(homeCoachReel({ request, result: { status: "stale", superseded_by: "req_home000000000009" }, eventId: "evt_home000000000004", profileId: "abc123def456", now: 1, lastEventAtMs: null, motion }).reel).toBeNull();
  });

  it("picks the remote provider only when a Coach URL is configured, otherwise the deterministic one", () => {
    expect(createHomeCoachProvider({ coachUrl: null }).id).toBe("deterministic_v1");
    expect(createHomeCoachProvider({ coachUrl: "  " }).id).toBe("deterministic_v1");
    expect(createHomeCoachProvider({ coachUrl: "https://coach.example.test/v1/coach" }).id).toBe("remote_formpath_coach_v1");
  });

  it("puts the authenticated transport behind the frozen remote provider: a bearer ID token per call, HTTPS only, never a service key", async () => {
    const request = buildHomeCoachRequest({ latest, userProfile, requestId: "req_home000000000001" });
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetcher = (async (url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, headers: init.headers });
      return new Response(JSON.stringify({ ...deterministicCoachResponse(request), provider: { id: "remote_formpath_coach_v1", revision: "service-2026-09" } }), { status: 200 });
    }) as unknown as typeof fetch;
    const { createAuthenticatedCoachTransport } = await import("@/lib/coach/authenticated-transport");
    const { RemoteCoachProvider } = await import("@/lib/coach/remote-provider");
    const url = "https://coach.example.test/v1/coach";
    const provider = new RemoteCoachProvider({ url, transport: createAuthenticatedCoachTransport({ endpoint: url, getIdToken: async () => "firebase-id-token", fetcher }) });
    const result = await provider.coach(request);
    expect(result.status).toBe("ok");
    expect(calls[0].url).toBe(url);
    expect(calls[0].headers.authorization).toBe("Bearer firebase-id-token");

    const unusable = createHomeCoachProvider({ coachUrl: "http://192.168.0.10/v1/coach", getIdToken: async () => "token" });
    expect(unusable.id).toBe("remote_formpath_coach_v1");
    expect(await unusable.coach(request)).toEqual({ status: "unavailable", reason: "not_configured", retryable: false, detail: "coach endpoint invalid" });

    const signedOut = createHomeCoachProvider({ coachUrl: url, getIdToken: async () => null });
    const withoutUser = await signedOut.coach(request);
    expect(withoutUser.status).toBe("unavailable");
    expect(withoutUser).not.toMatchObject({ status: "ok" });
  });
});
