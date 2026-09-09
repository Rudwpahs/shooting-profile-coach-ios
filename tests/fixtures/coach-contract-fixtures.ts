import {
  COACH_DO_NOT_INFER_V1,
  COACH_SCHEMA_VERSION,
  REPRESENTATIVE_BOUNDARY,
  type CoachObservationV1,
  type CoachRequestV1,
  type CoachResponseV1,
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

/** A valid response to `request()`: grounded in its observation and its evidence. */
export function response(overrides: Partial<CoachResponseV1> = {}): CoachResponseV1 {
  return {
    schema_version: COACH_SCHEMA_VERSION,
    request_id: "req_0123456789abcdef",
    observation_summary: ["릴리스 추정 시점 팔꿈치 각도 96도, 중간 신뢰도"],
    hypotheses: [{
      statement: "릴리스 시 팔꿈치가 약간 벌어져 좌우 편차가 생길 수 있습니다.",
      confidence: "medium",
      supporting_observation_ids: ["obs_release_elbow_angle"],
      competing_explanations: ["촬영 각도 오차"],
    }],
    confidence: "medium",
    coaching_comment: "같은 리듬을 먼저 만드세요",
    do_not_infer: [...COACH_DO_NOT_INFER_V1],
    drills: [{
      name: "폼 슈팅 10회",
      purpose: "릴리스 정렬 감각",
      constraints: ["림 앞 1m"],
      success_criteria: ["10회 중 8회 같은 궤적"],
      retest: "다음 촬영에서 팔꿈치 각도 재확인",
    }],
    retest_plan: ["3일 후 Basic 1+1 재촬영"],
    evidence_used: [12],
    primary_visual_cue: { observation_id: "obs_release_elbow_angle", label: "릴리스 팔꿈치" },
    provider: { id: "deterministic_v1", revision: "2026-09-09" },
    ...overrides,
  };
}
