import { describe, expect, it } from "vitest";

import { COACH_DO_NOT_INFER_V1, CoachResponseV1Schema, parseCoachResponseV1 } from "@/lib/coach/contract";
import { response } from "@/tests/fixtures/coach-contract-fixtures";

const rejects = (value: unknown, path?: string) => {
  const result = parseCoachResponseV1(value);
  expect(result.ok).toBe(false);
  if (!result.ok && path) expect(result.issues.some((issue) => issue.startsWith(path))).toBe(true);
};

describe("CoachResponseV1", () => {
  it("round-trips a valid response unchanged", () => {
    const value = response();
    expect(parseCoachResponseV1(JSON.parse(JSON.stringify(value)))).toEqual({ ok: true, value });
    expect(CoachResponseV1Schema.safeParse(value).success).toBe(true);
  });

  it("pins the envelope: version, the request it answers, the provider stamp", () => {
    rejects({ ...response(), schema_version: 2 }, "schema_version");
    rejects({ ...response(), request_id: "nope" }, "request_id");
    rejects({ ...response(), provider: { id: "gpt", revision: "1" } }, "provider.id");
    rejects({ ...response(), provider: { id: "deterministic_v1", revision: "" } }, "provider.revision");
    rejects({ ...response(), provider: { id: "deterministic_v1" } }, "provider.revision");
    expect(parseCoachResponseV1(response({ provider: { id: "remote_formpath_coach_v1", revision: "adapter-2026-09" } })).ok).toBe(true);
  });

  it("never carries coordinates or other unknown keys, so the model cannot place anything", () => {
    rejects({ ...response(), coordinates: { x: 0.4, y: 0.2 } }, "coordinates");
    rejects({ ...response(), primary_visual_cue: { observation_id: "obs_release_elbow_angle", label: "팔꿈치", x: 0.4, y: 0.2 } }, "primary_visual_cue.x");
    rejects({ ...response(), hypotheses: [{ ...response().hypotheses[0], joint_position: [1, 2, 3] }] }, "hypotheses.0.joint_position");
  });

  it("keeps the summary and the comment short: one screen line, no paragraphs", () => {
    rejects({ ...response(), observation_summary: [] }, "observation_summary");
    rejects({ ...response(), observation_summary: Array.from({ length: 7 }, () => "x") }, "observation_summary");
    rejects({ ...response(), observation_summary: ["x".repeat(161)] }, "observation_summary.0");
    rejects({ ...response(), coaching_comment: "" }, "coaching_comment");
    rejects({ ...response(), coaching_comment: "x".repeat(141) }, "coaching_comment");
    rejects({ ...response(), coaching_comment: "first line\nsecond line" }, "coaching_comment");
  });

  it("grounds every hypothesis in named observations and caps the list", () => {
    const hypothesis = response().hypotheses[0];
    rejects({ ...response(), hypotheses: [hypothesis, hypothesis, hypothesis, hypothesis] }, "hypotheses");
    rejects({ ...response(), hypotheses: [{ ...hypothesis, supporting_observation_ids: [] }] }, "hypotheses.0.supporting_observation_ids");
    rejects({ ...response(), hypotheses: [{ ...hypothesis, supporting_observation_ids: ["elbow"] }] }, "hypotheses.0.supporting_observation_ids.0");
    rejects({ ...response(), hypotheses: [{ ...hypothesis, supporting_observation_ids: ["obs_a", "obs_a"] }] }, "hypotheses.0.supporting_observation_ids");
    rejects({ ...response(), hypotheses: [{ ...hypothesis, confidence: "certain" }] }, "hypotheses.0.confidence");
    rejects({ ...response(), hypotheses: [{ ...hypothesis, statement: "x".repeat(241) }] }, "hypotheses.0.statement");
    rejects({ ...response(), hypotheses: [{ ...hypothesis, competing_explanations: ["a", "b", "c", "d", "e"] }] }, "hypotheses.0.competing_explanations");
    expect(parseCoachResponseV1(response({ hypotheses: [] })).ok).toBe(true);
  });

  it("always declares what it must not infer: force, torque, muscle activation, metric 3D", () => {
    expect(COACH_DO_NOT_INFER_V1).toEqual(["ground_reaction_force", "joint_torque", "muscle_activation", "actual_metric_3d_position"]);
    rejects({ ...response(), do_not_infer: [] }, "do_not_infer");
    rejects({ ...response(), do_not_infer: ["joint_torque", "muscle_activation", "actual_metric_3d_position"] }, "do_not_infer");
    rejects({ ...response(), do_not_infer: [...COACH_DO_NOT_INFER_V1, "This is a sentence, not a code"] }, "do_not_infer");
    rejects({ ...response(), do_not_infer: [...COACH_DO_NOT_INFER_V1, ...Array.from({ length: 9 }, (_, i) => `extra_${i}`)] }, "do_not_infer");
    expect(parseCoachResponseV1(response({ do_not_infer: [...COACH_DO_NOT_INFER_V1, "ball_flight_outcome"] })).ok).toBe(true);
  });

  it("keeps drills and retests bounded and structured", () => {
    const drill = response().drills[0];
    rejects({ ...response(), drills: [drill, drill, drill] }, "drills");
    rejects({ ...response(), drills: [{ ...drill, name: "" }] }, "drills.0.name");
    rejects({ ...response(), drills: [{ ...drill, purpose: "x".repeat(201) }] }, "drills.0.purpose");
    rejects({ ...response(), drills: [{ ...drill, constraints: Array.from({ length: 7 }, () => "c") }] }, "drills.0.constraints");
    rejects({ ...response(), drills: [{ ...drill, retest: "" }] }, "drills.0.retest");
    rejects({ ...response(), retest_plan: Array.from({ length: 5 }, () => "r") }, "retest_plan");
    expect(parseCoachResponseV1(response({ drills: [], retest_plan: [] })).ok).toBe(true);
  });

  it("references evidence by research unit id only", () => {
    rejects({ ...response(), evidence_used: [0] }, "evidence_used.0");
    rejects({ ...response(), evidence_used: [12, 12] }, "evidence_used");
    rejects({ ...response(), evidence_used: ["12"] }, "evidence_used.0");
    rejects({ ...response(), evidence_used: Array.from({ length: 17 }, (_, i) => i + 1) }, "evidence_used");
  });

  it("lets the cue be absent, and otherwise a labelled reference to one observation", () => {
    expect(parseCoachResponseV1(response({ primary_visual_cue: null })).ok).toBe(true);
    rejects({ ...response(), primary_visual_cue: { observation_id: "elbow", label: "팔꿈치" } }, "primary_visual_cue.observation_id");
    rejects({ ...response(), primary_visual_cue: { observation_id: "obs_release_elbow_angle", label: "" } }, "primary_visual_cue.label");
    rejects({ ...response(), primary_visual_cue: { observation_id: "obs_release_elbow_angle", label: "x".repeat(41) } }, "primary_visual_cue.label");
    rejects({ ...response(), primary_visual_cue: { observation_id: "obs_release_elbow_angle" } }, "primary_visual_cue.label");
  });
});
