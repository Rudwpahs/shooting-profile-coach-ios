import {
  COACH_SCHEMA_VERSION,
  REPRESENTATIVE_BOUNDARY,
  type CoachObservationV1,
  type CoachRequestV1,
} from "@/lib/coach/contract";

/** A valid observation the tests mutate one field at a time. */
export function observation(overrides: Partial<CoachObservationV1> = {}): CoachObservationV1 {
  return {
    id: "obs_release_elbow_angle",
    metric: "release_elbow_angle_deg",
    value: 96.4,
    unit: "deg",
    reference: "shooting arm at the release proxy anchor",
    measurement_confidence: "medium",
    source: "representative_phase_fused_4d",
    boundary: REPRESENTATIVE_BOUNDARY,
    phase_anchor: "releaseProxy",
    joints: ["rightShoulder", "rightElbow", "rightWrist"],
    caveats: ["representative phase-fused estimate, not actual 3D"],
    ...overrides,
  };
}

/** A valid request with one observation and one evidence item. */
export function request(overrides: Partial<CoachRequestV1> = {}): CoachRequestV1 {
  return {
    schema_version: COACH_SCHEMA_VERSION,
    request_id: "req_0123456789abcdef",
    locale: "ko",
    player: { handedness: "right", skill_level: "developing", training_goal: "consistency" },
    context: { action: "jump_shot", capture_protocol: "basic_1_plus_1", quality_passed: true, quality_reasons: [] },
    observations: [observation()],
    evidence: [{
      research_unit_id: 12,
      claim: "Elbow alignment at release relates to lateral miss in this cohort.",
      evidence_tier: "B",
      source_title: null,
      supported_inferences: ["lateral_alignment"],
      forbidden_inferences: ["force"],
      limitations: ["small sample"],
      contradiction_group: null,
    }],
    recent_history: ["first_profile"],
    ...overrides,
  };
}
