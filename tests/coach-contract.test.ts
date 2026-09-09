import { describe, expect, it } from "vitest";

import { COACH_SCHEMA_VERSION, CoachRequestV1Schema, parseCoachRequestV1 } from "@/lib/coach/contract";
import { observation, request } from "@/tests/fixtures/coach-contract-fixtures";

const rejects = (value: unknown, path?: string) => {
  const result = parseCoachRequestV1(value);
  expect(result.ok).toBe(false);
  if (!result.ok && path) expect(result.issues.some((issue) => issue.startsWith(path))).toBe(true);
};

describe("CoachRequestV1", () => {
  it("is schema version 1 and round-trips a valid request unchanged", () => {
    expect(COACH_SCHEMA_VERSION).toBe(1);
    const value = request();
    const result = parseCoachRequestV1(JSON.parse(JSON.stringify(value)));
    expect(result).toEqual({ ok: true, value });
    expect(CoachRequestV1Schema.safeParse(value).success).toBe(true);
  });

  it("rejects unknown keys anywhere, so private evidence can never ride along", () => {
    rejects({ ...request(), frames: [] }, "frames");
    rejects({ ...request(), player: { ...request().player, age: 17 } }, "player.age");
    rejects({ ...request(), context: { ...request().context, fileName: "clip.mov" } }, "context.fileName");
    rejects({ ...request(), observations: [{ ...observation(), covariance: [1, 0, 0, 1, 0, 1] }] }, "observations.0.covariance");
  });

  it("pins the envelope: version, opaque request id, locale", () => {
    rejects({ ...request(), schema_version: 2 }, "schema_version");
    rejects({ ...request(), request_id: "0123456789abcdef" }, "request_id");
    rejects({ ...request(), request_id: "req_短" }, "request_id");
    rejects({ ...request(), request_id: `req_${"a".repeat(65)}` }, "request_id");
    rejects({ ...request(), locale: "fr" }, "locale");
    rejects((({ request_id: _dropped, ...rest }) => rest)(request()), "request_id");
  });

  it("keeps the player context to closed enums with no personal measurements", () => {
    rejects({ ...request(), player: { handedness: "both", skill_level: null, training_goal: null } }, "player.handedness");
    rejects({ ...request(), player: { handedness: "right", skill_level: "pro", training_goal: null } }, "player.skill_level");
    rejects({ ...request(), player: { handedness: "right", skill_level: null, training_goal: "dunk" } }, "player.training_goal");
    expect(parseCoachRequestV1(request({ player: { handedness: "unknown", skill_level: null, training_goal: null } })).ok).toBe(true);
  });

  it("keeps the shot context to the capture protocol and stable quality codes", () => {
    rejects({ ...request(), context: { ...request().context, capture_protocol: "single_view" } }, "context.capture_protocol");
    rejects({ ...request(), context: { ...request().context, action: "layup" } }, "context.action");
    rejects({ ...request(), context: { ...request().context, quality_reasons: ["clip C:/Users/me/shot.mov failed"] } }, "context.quality_reasons");
    rejects({ ...request(), context: { ...request().context, quality_reasons: Array.from({ length: 9 }, (_, i) => `r${i}`) } }, "context.quality_reasons");
    expect(parseCoachRequestV1(request({ context: { action: "unknown", capture_protocol: "high_accuracy_3_plus_3", quality_passed: false, quality_reasons: ["uncertainty_exceeds_limit"] } })).ok).toBe(true);
  });

  it("requires between one and thirty-two observations with unique ids", () => {
    rejects({ ...request(), observations: [] }, "observations");
    rejects({ ...request(), observations: [observation(), observation()] }, "observations");
    rejects({ ...request(), observations: Array.from({ length: 33 }, (_, i) => observation({ id: `obs_${i}` })) }, "observations");
    expect(parseCoachRequestV1(request({ observations: Array.from({ length: 32 }, (_, i) => observation({ id: `obs_${i}` })) })).ok).toBe(true);
  });

  it("keeps evidence items to research units with a known tier and unique ids", () => {
    const item = request().evidence[0];
    rejects({ ...request(), evidence: [item, { ...item }] }, "evidence");
    rejects({ ...request(), evidence: [{ ...item, evidence_tier: "Z" }] }, "evidence.0.evidence_tier");
    rejects({ ...request(), evidence: [{ ...item, research_unit_id: 0 }] }, "evidence.0.research_unit_id");
    rejects({ ...request(), evidence: [{ ...item, research_unit_id: 1.5 }] }, "evidence.0.research_unit_id");
    rejects({ ...request(), evidence: Array.from({ length: 17 }, (_, i) => ({ ...item, research_unit_id: i + 1 })) }, "evidence");
    expect(parseCoachRequestV1(request({ evidence: [] })).ok).toBe(true);
  });

  it("keeps recent history to stable codes, never free text", () => {
    rejects({ ...request(), recent_history: ["Missed 7 of 10 from the wing yesterday"] }, "recent_history");
    rejects({ ...request(), recent_history: Array.from({ length: 11 }, (_, i) => `h${i}`) }, "recent_history");
    expect(parseCoachRequestV1(request({ recent_history: [] })).ok).toBe(true);
    expect(parseCoachRequestV1(request({ recent_history: ["retest_after_drill", "quality_recapture"] })).ok).toBe(true);
  });

  it("reports issues as dotted paths so a caller can log where a request went wrong", () => {
    const result = parseCoachRequestV1({ ...request(), locale: "fr", observations: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
      expect(result.issues.some((issue) => issue.startsWith("locale:"))).toBe(true);
      expect(result.issues.some((issue) => issue.startsWith("observations:"))).toBe(true);
    }
    expect(parseCoachRequestV1(null).ok).toBe(false);
    expect(parseCoachRequestV1("{}").ok).toBe(false);
  });
});
