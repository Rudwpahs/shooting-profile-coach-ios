import { describe, expect, it } from "vitest";

import { COACH_DO_NOT_INFER_V1, parseCoachResponseForRequest, type CoachRequestV1 } from "@/lib/coach/contract";
import { DETERMINISTIC_COACH_REVISION, createDeterministicCoachProvider, deterministicCoachResponse } from "@/lib/coach/deterministic-provider";
import { isUsableCoachResult, type CoachProvider } from "@/lib/coach/provider";
import { buildCoachRequest } from "@/lib/coach/representative-profile-adapter";
import type { RepresentativePose4DV2, ShootingHandV2 } from "@/lib/shooting-profile/types";
import { buildTwoViewRepresentativeProfile } from "@/lib/shooting-profile/two-view-pipeline";
import { request as fixtureRequest } from "@/tests/fixtures/coach-contract-fixtures";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

function profileFor(shootingHand: ShootingHandV2, mode: "basic_1_plus_1" | "high_accuracy_3_plus_3"): RepresentativePose4DV2 {
  const session = syntheticLandmarkSession({ mode, shootingHand });
  const result = buildTwoViewRepresentativeProfile({
    mode,
    shootingHand,
    attempts: [...session.front, ...session.shootingSide].map((sequence) => ({ id: `${sequence.view}-${sequence.takeIndex}`, sequence })),
  });
  if (result.status !== "complete") throw new Error(`fixture must reconstruct: ${result.status}`);
  return result.profile;
}

const profiles = {
  right: profileFor("right", "basic_1_plus_1"),
  left: profileFor("left", "high_accuracy_3_plus_3"),
};

type Goal = CoachRequestV1["player"]["training_goal"];
const requestFor = (hand: ShootingHandV2, goal: Goal, locale: "ko" | "en", qualityPassed = true): CoachRequestV1 => buildCoachRequest({
  profile: qualityPassed ? profiles[hand] : { ...profiles[hand], quality: { passed: false, reasons: ["uncertainty_exceeds_limit"] } },
  shootingHand: hand,
  requestId: "req_abcdef0123456789",
  locale,
  player: { skillLevel: "developing", trainingGoal: goal },
  action: "jump_shot",
});

const HANGUL = /[가-힣]/;
const RANK = ["very_low", "low", "medium", "high", "very_high"];

describe("DeterministicCoachProvider", () => {
  const matrix: [ShootingHandV2, Goal, "ko" | "en", boolean][] = [];
  for (const hand of ["right", "left"] as const) {
    for (const goal of ["consistency", "range", "release", "rhythm", null] as const) {
      for (const locale of ["ko", "en"] as const) {
        for (const quality of [true, false]) matrix.push([hand, goal, locale, quality]);
      }
    }
  }

  it.each(matrix)("%s hand, goal %s, %s, quality passed %s: a grounded, schema-valid, one-line reply", (hand, goal, locale, quality) => {
    const request = requestFor(hand, goal, locale, quality);
    const response = deterministicCoachResponse(request);
    expect(parseCoachResponseForRequest(request, response)).toEqual({ status: "ok", response });
    expect(response.provider).toEqual({ id: "deterministic_v1", revision: DETERMINISTIC_COACH_REVISION });
    expect(response.request_id).toBe(request.request_id);
    for (const item of COACH_DO_NOT_INFER_V1) expect(response.do_not_infer).toContain(item);
    expect(response.coaching_comment.length).toBeGreaterThan(0);
    expect(response.coaching_comment.length).toBeLessThanOrEqual(140);
    expect(HANGUL.test(response.coaching_comment)).toBe(locale === "ko");
    expect(response.primary_visual_cue).not.toBeNull();
    expect(request.observations.some((item) => item.id === response.primary_visual_cue?.observation_id)).toBe(true);
    expect(response.evidence_used).toEqual([]);
    expect(response.hypotheses.length).toBeLessThanOrEqual(1);
    for (const hypothesis of response.hypotheses) expect(["very_low", "low", "medium"]).toContain(hypothesis.confidence);
    expect(response.observation_summary.length).toBeGreaterThanOrEqual(1);
    expect(response.observation_summary.length).toBeLessThanOrEqual(6);
  });

  it("is a pure function of the request", () => {
    const request = requestFor("right", "release", "ko");
    expect(deterministicCoachResponse(request)).toEqual(deterministicCoachResponse(JSON.parse(JSON.stringify(request))));
  });

  it("points the cue at the goal's metric when the capture passed, and at the quality label when it did not", () => {
    expect(deterministicCoachResponse(requestFor("right", "release", "ko")).primary_visual_cue?.observation_id).toBe("obs_release_elbow_angle_deg");
    expect(deterministicCoachResponse(requestFor("right", "rhythm", "ko")).primary_visual_cue?.observation_id).toBe("obs_deepest_dip_knee_angle_deg");
    expect(deterministicCoachResponse(requestFor("right", "range", "ko")).primary_visual_cue?.observation_id).toBe("obs_follow_through_elbow_angle_deg");
    expect(deterministicCoachResponse(requestFor("right", "consistency", "ko")).primary_visual_cue?.observation_id).toBe("obs_release_elbow_lateral_offset_sb");
    expect(deterministicCoachResponse(requestFor("left", null, "en")).primary_visual_cue?.observation_id).toBe("obs_release_elbow_lateral_offset_sb");
    const failed = deterministicCoachResponse(requestFor("right", "release", "ko", false));
    expect(failed.primary_visual_cue).toEqual({ observation_id: "obs_capture_quality", label: "촬영 품질" });
    expect(failed.confidence).toBe("low");
    expect(failed.hypotheses).toEqual([]);
    expect(failed.drills).toEqual([]);
    expect(deterministicCoachResponse(requestFor("right", "release", "en", false)).primary_visual_cue).toEqual({ observation_id: "obs_capture_quality", label: "Capture quality" });
  });

  it("never claims more than the measurement allows: the reply confidence is capped at medium and by the observation", () => {
    const request = requestFor("left", "release", "en");
    const response = deterministicCoachResponse(request);
    const primary = request.observations.find((item) => item.id === response.primary_visual_cue?.observation_id);
    expect(primary).toBeDefined();
    expect(RANK.indexOf(response.confidence)).toBeLessThanOrEqual(RANK.indexOf("medium"));
    expect(RANK.indexOf(response.confidence)).toBeLessThanOrEqual(RANK.indexOf(primary?.measurement_confidence ?? "very_high"));
  });

  it("refuses a request that is not schema-valid instead of guessing", () => {
    expect(() => deterministicCoachResponse({ ...fixtureRequest(), locale: "fr" } as never)).toThrow(/locale/);
  });

  it("as a provider: ok normally, cancelled when the signal is already aborted", async () => {
    const provider: CoachProvider = createDeterministicCoachProvider();
    expect(provider.id).toBe("deterministic_v1");
    const request = requestFor("right", "release", "ko");
    const result = await provider.coach(request);
    expect(isUsableCoachResult(result)).toBe(true);
    if (result.status === "ok") expect(result.response).toEqual(deterministicCoachResponse(request));
    const controller = new AbortController();
    controller.abort();
    expect(await provider.coach(request, { signal: controller.signal })).toEqual({ status: "cancelled" });
  });
});
