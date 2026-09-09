import { describe, expect, it } from "vitest";

import { CANCELLED, COACH_UNAVAILABLE_REASONS, isUsableCoachResult, unavailable, type CoachProvider, type CoachProviderResult } from "@/lib/coach/provider";
import { request, response } from "@/tests/fixtures/coach-contract-fixtures";

describe("CoachProvider boundary", () => {
  it("names every way a provider can be unavailable", () => {
    expect(COACH_UNAVAILABLE_REASONS).toEqual(["not_configured", "offline", "timeout", "http_error", "schema_invalid", "grounding_invalid", "provider_error"]);
  });

  it("has exactly four outcomes, of which only ok is usable", () => {
    const outcomes: CoachProviderResult[] = [
      { status: "ok", response: response() },
      unavailable("offline", true),
      CANCELLED,
      { status: "stale", superseded_by: "req_ffffffffffffffff" },
    ];
    expect(outcomes.map(isUsableCoachResult)).toEqual([true, false, false, false]);
    expect(unavailable("http_error", false, "401")).toEqual({ status: "unavailable", reason: "http_error", retryable: false, detail: "401" });
    expect(unavailable("not_configured", false)).toEqual({ status: "unavailable", reason: "not_configured", retryable: false, detail: null });
    expect(CANCELLED).toEqual({ status: "cancelled" });
  });

  it("is one method the app calls, whichever implementation is behind it", async () => {
    const seen: string[] = [];
    const provider: CoachProvider = {
      id: "deterministic_v1",
      coach: async (input, options) => {
        seen.push(input.request_id);
        return options?.signal?.aborted ? CANCELLED : { status: "ok", response: response() };
      },
    };
    const result = await provider.coach(request());
    expect(isUsableCoachResult(result)).toBe(true);
    expect(seen).toEqual([request().request_id]);
    const controller = new AbortController();
    controller.abort();
    expect(await provider.coach(request(), { signal: controller.signal })).toEqual({ status: "cancelled" });
  });
});
