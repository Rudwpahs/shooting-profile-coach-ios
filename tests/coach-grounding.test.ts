import { describe, expect, it } from "vitest";

import {
  parseCoachResponseForRequest,
  resolveCoachCueAnchor,
  validateCoachResponseForRequest,
} from "@/lib/coach/contract";
import { observation, request, response } from "@/tests/fixtures/coach-contract-fixtures";

describe("PrimaryVisualCueV1 grounding", () => {
  it("accepts a response whose cue, hypotheses and evidence all point into the request", () => {
    expect(validateCoachResponseForRequest(request(), response())).toEqual({ ok: true });
  });

  it("refuses a cue that names an observation the request never contained", () => {
    const result = validateCoachResponseForRequest(request(), response({ primary_visual_cue: { observation_id: "obs_left_knee", label: "무릎" } }));
    expect(result).toEqual({ ok: false, reasons: [{ code: "cue_observation_unknown", observation_id: "obs_left_knee" }] });
  });

  it("refuses hypotheses that lean on unknown observations, naming which", () => {
    const hypothesis = response().hypotheses[0];
    const result = validateCoachResponseForRequest(request(), response({
      hypotheses: [hypothesis, { ...hypothesis, supporting_observation_ids: ["obs_release_elbow_angle", "obs_ghost"] }],
    }));
    expect(result).toEqual({ ok: false, reasons: [{ code: "hypothesis_observation_unknown", hypothesis_index: 1, observation_id: "obs_ghost" }] });
  });

  it("refuses evidence the request did not supply and a reply to a different request", () => {
    expect(validateCoachResponseForRequest(request(), response({ evidence_used: [12, 99] }))).toEqual({
      ok: false,
      reasons: [{ code: "evidence_unknown", research_unit_id: 99 }],
    });
    expect(validateCoachResponseForRequest(request(), response({ request_id: "req_ffffffffffffffff" }))).toEqual({
      ok: false,
      reasons: [{ code: "request_id_mismatch", expected: "req_0123456789abcdef", received: "req_ffffffffffffffff" }],
    });
  });

  it("lists every grounding failure at once, in a stable order", () => {
    const result = validateCoachResponseForRequest(request(), response({
      request_id: "req_ffffffffffffffff",
      evidence_used: [99],
      primary_visual_cue: { observation_id: "obs_ghost", label: "?" },
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.map((reason) => reason.code)).toEqual(["request_id_mismatch", "cue_observation_unknown", "evidence_unknown"]);
  });

  it("parses a raw reply in two stages: schema first, grounding second", () => {
    const raw = JSON.parse(JSON.stringify(response()));
    expect(parseCoachResponseForRequest(request(), raw)).toEqual({ status: "ok", response: response() });
    const schemaInvalid = parseCoachResponseForRequest(request(), { ...raw, coaching_comment: "" });
    expect(schemaInvalid.status).toBe("schema_invalid");
    if (schemaInvalid.status === "schema_invalid") expect(schemaInvalid.issues.some((issue) => issue.startsWith("coaching_comment"))).toBe(true);
    const groundingInvalid = parseCoachResponseForRequest(request(), { ...raw, primary_visual_cue: { observation_id: "obs_ghost", label: "?" } });
    expect(groundingInvalid).toEqual({ status: "grounding_invalid", reasons: [{ code: "cue_observation_unknown", observation_id: "obs_ghost" }] });
    expect(parseCoachResponseForRequest(request(), "not json").status).toBe("schema_invalid");
  });

  it("resolves where a cue lives from the observation the app measured, never from the reply", () => {
    const anchor = resolveCoachCueAnchor(request(), { observation_id: "obs_release_elbow_angle", label: "릴리스 팔꿈치" });
    expect(anchor).toEqual({
      kind: "joints",
      observation_id: "obs_release_elbow_angle",
      label: "릴리스 팔꿈치",
      joints: ["rightShoulder", "rightElbow", "rightWrist"],
      phase_anchor: "releaseProxy",
    });
    const withQuality = request({
      observations: [
        observation(),
        observation({ id: "obs_capture_quality", metric: "capture_quality", unit: "label", value: "passed", phase_anchor: null, joints: [] }),
      ],
    });
    expect(resolveCoachCueAnchor(withQuality, { observation_id: "obs_capture_quality", label: "촬영 품질" })).toEqual({ kind: "text_only", observation_id: "obs_capture_quality", label: "촬영 품질" });
    expect(resolveCoachCueAnchor(request(), { observation_id: "obs_ghost", label: "?" })).toBeNull();
  });
});
