import { describe, expect, it } from "vitest";

import {
  COACH_FORBIDDEN_KEYS,
  COACH_REQUEST_MAX_ARRAY,
  COACH_REQUEST_MAX_BYTES,
  assertCoachRequestPrivacy,
  auditCoachRequestPrivacy,
  serializeCoachRequest,
} from "@/lib/coach/privacy";
import { buildCoachRequest } from "@/lib/coach/representative-profile-adapter";
import type { RepresentativePose4DV2 } from "@/lib/shooting-profile/types";
import { buildTwoViewRepresentativeProfile } from "@/lib/shooting-profile/two-view-pipeline";
import { request } from "@/tests/fixtures/coach-contract-fixtures";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

const session = syntheticLandmarkSession({ mode: "high_accuracy_3_plus_3", shootingHand: "right" });
const pipeline = buildTwoViewRepresentativeProfile({
  mode: "high_accuracy_3_plus_3",
  shootingHand: "right",
  attempts: [...session.front, ...session.shootingSide].map((sequence) => ({ id: `${sequence.view}-${sequence.takeIndex}`, sequence })),
});
if (pipeline.status !== "complete") throw new Error("fixture must reconstruct");
const profile: RepresentativePose4DV2 = pipeline.profile;

const built = () => buildCoachRequest({
  profile,
  shootingHand: "right",
  requestId: "req_abcdef0123456789",
  locale: "ko",
  player: { skillLevel: "developing", trainingGoal: "release" },
  action: "jump_shot",
});

describe("coach request privacy", () => {
  it("names the keys that must never leave the device", () => {
    for (const key of ["frames", "sourceLandmarks", "faceLandmarks", "z", "uri", "fileName", "timestampMs", "covariance", "attempts", "cropRectPx", "email", "uid", "displayName", "video"]) {
      expect(COACH_FORBIDDEN_KEYS, key).toContain(key);
    }
    expect(COACH_REQUEST_MAX_BYTES).toBe(16 * 1024);
    expect(COACH_REQUEST_MAX_ARRAY).toBe(32);
  });

  it("passes a request the adapter built from a real pipeline profile, and it stays small", () => {
    const value = built();
    expect(auditCoachRequestPrivacy(value)).toEqual({ ok: true });
    const bytes = serializeCoachRequest(value);
    expect(bytes.length).toBeLessThan(COACH_REQUEST_MAX_BYTES);
    expect(bytes.length).toBeLessThan(6000);
    expect(JSON.parse(bytes)).toEqual(value);
    for (const key of COACH_FORBIDDEN_KEYS) expect(bytes, key).not.toContain(`"${key}"`);
    expect(value.observations).toHaveLength(8);
  });

  it("would catch the raw profile and the raw landmark sequence if either were passed through", () => {
    const rawProfile = auditCoachRequestPrivacy(profile);
    expect(rawProfile.ok).toBe(false);
    if (!rawProfile.ok) {
      const codes = new Set(rawProfile.violations.map((violation) => violation.code));
      expect(codes.has("forbidden_key")).toBe(true);
      expect(rawProfile.violations.some((violation) => violation.code === "forbidden_key" && violation.path === "frames")).toBe(true);
      expect(rawProfile.violations.some((violation) => violation.code === "array_too_long" && violation.path === "frames")).toBe(true);
    }
    const rawSequence = auditCoachRequestPrivacy(session.front[0]);
    expect(rawSequence.ok).toBe(false);
    if (!rawSequence.ok) {
      const paths = rawSequence.violations.filter((violation) => violation.code === "forbidden_key").map((violation) => violation.path);
      expect(paths.some((path) => path.endsWith("sourceLandmarks"))).toBe(true);
      expect(paths.some((path) => path.endsWith("timestampMs"))).toBe(true);
    }
  });

  it("finds a forbidden key at any depth and reports where", () => {
    const withUri = { ...request(), context: { ...request().context, uri: "file:///clip.mov" } };
    expect(auditCoachRequestPrivacy(withUri)).toEqual({ ok: false, violations: [{ code: "forbidden_key", path: "context.uri" }] });
    const withZ = { ...request(), observations: [{ ...request().observations[0], joints_detail: [{ z: 0.4 }] }] };
    expect(auditCoachRequestPrivacy(withZ)).toEqual({ ok: false, violations: [{ code: "forbidden_key", path: "observations.0.joints_detail.0.z" }] });
    const withEmail = { ...request(), player: { ...request().player, email: "someone@example.com" } };
    expect(auditCoachRequestPrivacy(withEmail)).toEqual({ ok: false, violations: [{ code: "forbidden_key", path: "player.email" }] });
    expect(auditCoachRequestPrivacy(null)).toEqual({ ok: false, violations: [{ code: "not_an_object" }] });
    expect(auditCoachRequestPrivacy("[]")).toEqual({ ok: false, violations: [{ code: "not_an_object" }] });
  });

  it("refuses long arrays, which is what per-frame evidence looks like", () => {
    const long = { ...request(), recent_history: Array.from({ length: 101 }, (_, i) => `h${i}`) };
    expect(auditCoachRequestPrivacy(long)).toEqual({ ok: false, violations: [{ code: "array_too_long", path: "recent_history", length: 101 }] });
    const exactly = { ...request(), recent_history: Array.from({ length: 32 }, (_, i) => `h${i}`) };
    expect(auditCoachRequestPrivacy(exactly)).toEqual({ ok: true });
  });

  it("serializes only a schema-valid, audited request and throws otherwise", () => {
    expect(() => serializeCoachRequest({ ...request(), frames: [] } as never)).toThrow(/frames/);
    expect(() => serializeCoachRequest({ ...request(), locale: "fr" } as never)).toThrow(/locale/);
    expect(() => assertCoachRequestPrivacy({ ...request(), fileName: "a.mov" })).toThrow(/fileName/);
    expect(assertCoachRequestPrivacy(request())).toBeUndefined();
    const text = serializeCoachRequest(request());
    expect(text).not.toContain("\n");
    expect(JSON.parse(text)).toEqual(request());
  });
});
