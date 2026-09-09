import { afterEach, describe, expect, it, vi } from "vitest";

import type { CoachRequestV1 } from "@/lib/coach/contract";
import type { CoachProviderResult } from "@/lib/coach/provider";
import { RemoteCoachProvider, type RemoteCoachTransport } from "@/lib/coach/remote-provider";
import { buildCoachRequest } from "@/lib/coach/representative-profile-adapter";
import type { RepresentativePose4DV2 } from "@/lib/shooting-profile/types";
import { buildTwoViewRepresentativeProfile } from "@/lib/shooting-profile/two-view-pipeline";
import { request as fixtureRequest, response as fixtureResponse } from "@/tests/fixtures/coach-contract-fixtures";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

const session = syntheticLandmarkSession({ mode: "basic_1_plus_1", shootingHand: "right" });
const pipeline = buildTwoViewRepresentativeProfile({
  mode: "basic_1_plus_1",
  shootingHand: "right",
  attempts: [...session.front, ...session.shootingSide].map((sequence) => ({ id: `${sequence.view}-${sequence.takeIndex}`, sequence })),
});
if (pipeline.status !== "complete") throw new Error("fixture must reconstruct");
const profile: RepresentativePose4DV2 = pipeline.profile;

const requestFor = (id = "req_abcdef0123456789"): CoachRequestV1 => buildCoachRequest({
  profile,
  shootingHand: "right",
  requestId: id,
  locale: "ko",
  player: { skillLevel: "developing", trainingGoal: "release" },
  action: "jump_shot",
});

type Call = { url: string; body: string; signal: AbortSignal };
const URL = "https://coach.example.test/v1/coach";
const grounded = (request: CoachRequestV1) => ({
  ...fixtureResponse(),
  request_id: request.request_id,
  hypotheses: [],
  evidence_used: [],
  primary_visual_cue: { observation_id: request.observations[0].id, label: "cue" },
  provider: { id: "remote_formpath_coach_v1" as const, revision: "adapter-2026-09" },
});
const transportReturning = (status: number, body: unknown, calls: Call[] = []): RemoteCoachTransport => async (input) => {
  calls.push(input);
  return { status, text: typeof body === "string" ? body : JSON.stringify(body) };
};

describe("RemoteCoachProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is unavailable and never touches the network when no service is configured", async () => {
    const calls: Call[] = [];
    const provider = new RemoteCoachProvider({ url: null, transport: transportReturning(200, {}, calls) });
    expect(provider.id).toBe("remote_formpath_coach_v1");
    expect(await provider.coach(fixtureRequest())).toEqual({ status: "unavailable", reason: "not_configured", retryable: false, detail: null });
    expect(calls).toHaveLength(0);
  });

  it("posts exactly the serialized request and returns the parsed, grounded reply", async () => {
    const calls: Call[] = [];
    const request = requestFor();
    const reply = grounded(request);
    const provider = new RemoteCoachProvider({ url: URL, transport: transportReturning(200, reply, calls) });
    expect(await provider.coach(request)).toEqual({ status: "ok", response: reply });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(URL);
    expect(JSON.parse(calls[0].body)).toEqual(request);
    expect(calls[0].body).not.toMatch(/frames|covariance|timestamp/);
  });

  it("refuses to send a request that fails the schema or the privacy audit", async () => {
    const calls: Call[] = [];
    const provider = new RemoteCoachProvider({ url: URL, transport: transportReturning(200, {}, calls) });
    const result = await provider.coach({ ...fixtureRequest(), frames: [] } as never);
    expect(result).toMatchObject({ status: "unavailable", reason: "provider_error", retryable: false });
    expect(calls).toHaveLength(0);
  });

  it("types every failure: http status, offline transport, invalid schema, ungrounded reply", async () => {
    const request = requestFor();
    expect(await new RemoteCoachProvider({ url: URL, transport: transportReturning(500, "boom") }).coach(request)).toEqual({ status: "unavailable", reason: "http_error", retryable: true, detail: "500" });
    expect(await new RemoteCoachProvider({ url: URL, transport: transportReturning(429, "slow down") }).coach(request)).toEqual({ status: "unavailable", reason: "http_error", retryable: true, detail: "429" });
    expect(await new RemoteCoachProvider({ url: URL, transport: transportReturning(401, "nope") }).coach(request)).toEqual({ status: "unavailable", reason: "http_error", retryable: false, detail: "401" });
    const offline: RemoteCoachTransport = async () => { throw new TypeError("Network request failed"); };
    expect(await new RemoteCoachProvider({ url: URL, transport: offline }).coach(request)).toEqual({ status: "unavailable", reason: "offline", retryable: true, detail: "Network request failed" });
    expect(await new RemoteCoachProvider({ url: URL, transport: transportReturning(200, "not json") }).coach(request)).toMatchObject({ status: "unavailable", reason: "schema_invalid", retryable: false });
    expect(await new RemoteCoachProvider({ url: URL, transport: transportReturning(200, { ...grounded(request), coaching_comment: "" }) }).coach(request)).toMatchObject({ status: "unavailable", reason: "schema_invalid", retryable: false });
    const ungrounded = { ...grounded(request), primary_visual_cue: { observation_id: "obs_ghost", label: "?" } };
    expect(await new RemoteCoachProvider({ url: URL, transport: transportReturning(200, ungrounded) }).coach(request)).toEqual({ status: "unavailable", reason: "grounding_invalid", retryable: false, detail: "cue_observation_unknown" });
  });

  it("cancels when the caller aborts, and aborts the transport with it", async () => {
    const request = requestFor();
    let seen: AbortSignal | null = null;
    const hanging: RemoteCoachTransport = (input) => new Promise((_resolve, reject) => {
      seen = input.signal;
      input.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
    const provider = new RemoteCoachProvider({ url: URL, transport: hanging });
    const controller = new AbortController();
    const pending = provider.coach(request, { signal: controller.signal });
    controller.abort();
    expect(await pending).toEqual({ status: "cancelled" });
    expect(seen).not.toBeNull();
    expect((seen as unknown as AbortSignal).aborted).toBe(true);
    const already = new AbortController();
    already.abort();
    expect(await provider.coach(request, { signal: already.signal })).toEqual({ status: "cancelled" });
  });

  it("times out as a retryable unavailability", async () => {
    vi.useFakeTimers();
    const request = requestFor();
    let aborted = false;
    const hanging: RemoteCoachTransport = (input) => new Promise((_resolve, reject) => {
      input.signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("aborted", "AbortError")); });
    });
    const provider = new RemoteCoachProvider({ url: URL, transport: hanging, timeoutMs: 50 });
    const pending = provider.coach(request);
    await vi.advanceTimersByTimeAsync(60);
    expect(await pending).toEqual({ status: "unavailable", reason: "timeout", retryable: true, detail: "50ms" });
    expect(aborted).toBe(true);
  });

  it("marks an older in-flight request stale once a newer one was issued", async () => {
    const first = requestFor("req_aaaaaaaaaaaaaaaa");
    const second = requestFor("req_bbbbbbbbbbbbbbbb");
    const resolvers: ((value: { status: number; text: string }) => void)[] = [];
    const transport: RemoteCoachTransport = () => new Promise((resolve) => { resolvers.push(resolve); });
    const provider = new RemoteCoachProvider({ url: URL, transport });
    const pendingFirst = provider.coach(first);
    const pendingSecond = provider.coach(second);
    expect(resolvers).toHaveLength(2);
    resolvers[0]({ status: 200, text: JSON.stringify(grounded(first)) });
    expect(await pendingFirst).toEqual({ status: "stale", superseded_by: "req_bbbbbbbbbbbbbbbb" });
    resolvers[1]({ status: 200, text: JSON.stringify(grounded(second)) });
    const result: CoachProviderResult = await pendingSecond;
    expect(result).toEqual({ status: "ok", response: grounded(second) });
  });
});
