import { capConfidence } from "@/lib/coach/confidence-map";
import {
  COACH_DO_NOT_INFER_V1,
  COACH_SCHEMA_VERSION,
  parseCoachRequestV1,
  parseCoachResponseForRequest,
  type CoachConfidenceV1,
  type CoachLocaleV1,
  type CoachMetricV1,
  type CoachObservationV1,
  type CoachRequestV1,
  type CoachResponseV1,
} from "@/lib/coach/contract";
import { CANCELLED, type CoachProvider, type CoachProviderOptions, type CoachProviderResult } from "@/lib/coach/provider";

/**
 * The deterministic Coach: a pure function of the request, with fixed
 * wording, that always returns a schema-valid, grounded reply. It is what
 * the app shows when no model is reachable, the fallback the remote
 * provider is measured against, and the proof that every UI path works
 * without a model. It cites no research and infers nothing beyond the
 * geometry it was given.
 */
export const DETERMINISTIC_COACH_REVISION = "deterministic_v1_2026-09-09";

type Measured = Exclude<CoachMetricV1, "capture_quality">;
type Text = Readonly<Record<CoachLocaleV1, string>>;

/** Which metric a goal looks at first; the order also breaks ties when there is no goal. */
const PRIORITY: readonly Measured[] = [
  "release_elbow_lateral_offset_sb",
  "release_elbow_angle_deg",
  "follow_through_elbow_angle_deg",
  "deepest_dip_knee_angle_deg",
  "release_wrist_height_sb",
  "release_shoulder_line_yaw_deg",
  "follow_through_wrist_over_head_sb",
];

const GOAL_METRIC: Readonly<Record<NonNullable<CoachRequestV1["player"]["training_goal"]>, Measured>> = {
  consistency: "release_elbow_lateral_offset_sb",
  release: "release_elbow_angle_deg",
  rhythm: "deepest_dip_knee_angle_deg",
  range: "follow_through_elbow_angle_deg",
};

const LABEL: Readonly<Record<CoachMetricV1, Text>> = {
  release_elbow_angle_deg: { ko: "릴리스 팔꿈치 각도", en: "Release elbow angle" },
  release_wrist_height_sb: { ko: "릴리스 손목 높이", en: "Release wrist height" },
  release_elbow_lateral_offset_sb: { ko: "릴리스 팔꿈치 정렬", en: "Release elbow alignment" },
  release_shoulder_line_yaw_deg: { ko: "릴리스 어깨 방향", en: "Shoulder line at release" },
  deepest_dip_knee_angle_deg: { ko: "딥 무릎 각도", en: "Dip knee angle" },
  follow_through_elbow_angle_deg: { ko: "팔로우스루 팔 뻗음", en: "Follow-through extension" },
  follow_through_wrist_over_head_sb: { ko: "팔로우스루 손목 높이", en: "Follow-through wrist height" },
  capture_quality: { ko: "촬영 품질", en: "Capture quality" },
};

const COMMENT: Readonly<Record<CoachMetricV1, Text>> = {
  release_elbow_angle_deg: { ko: "릴리스 순간 팔꿈치 각도를 매번 같게 만드는 데 집중하세요", en: "Aim for the same elbow angle at release every time" },
  release_wrist_height_sb: { ko: "릴리스 손목 높이를 일정하게 유지해 보세요", en: "Keep the wrist at the same height at release" },
  release_elbow_lateral_offset_sb: { ko: "팔꿈치를 어깨 아래 같은 자리에 두는 것부터 시작하세요", en: "Start by keeping the elbow under the shoulder in the same place" },
  release_shoulder_line_yaw_deg: { ko: "어깨 방향을 매번 같게 맞춘 뒤 슛을 시작하세요", en: "Square the shoulders the same way before every shot" },
  deepest_dip_knee_angle_deg: { ko: "같은 깊이의 딥에서 같은 리듬으로 올라오세요", en: "Rise with the same rhythm from the same dip depth" },
  follow_through_elbow_angle_deg: { ko: "팔로우스루에서 팔을 끝까지 같은 만큼 뻗으세요", en: "Extend the arm the same amount on every follow-through" },
  follow_through_wrist_over_head_sb: { ko: "팔로우스루 손목을 같은 높이까지 올리세요", en: "Finish with the wrist at the same height every time" },
  capture_quality: { ko: "재촬영이 먼저예요. 같은 조건에서 다시 찍어 주세요", en: "Recapture first, in the same conditions" },
};

const COMPETING: Readonly<Record<CoachLocaleV1, readonly string[]>> = {
  ko: ["촬영 각도와 시점 오차", "단일 세션 변동"],
  en: ["camera angle and viewpoint error", "single-session variation"],
};

const RETEST: Text = {
  ko: "같은 프로토콜로 재촬영해 같은 지표를 비교",
  en: "Recapture with the same protocol and compare the same metric",
};

const UNIT_SUFFIX: Readonly<Record<CoachObservationV1["unit"], string>> = { deg: "°", shoulder_breadths: " sb", label: "" };

function summaryLine(observation: CoachObservationV1, locale: CoachLocaleV1): string {
  return `${LABEL[observation.metric][locale]} ${observation.value}${UNIT_SUFFIX[observation.unit]} · ${observation.measurement_confidence}`;
}

function hypothesisStatement(observation: CoachObservationV1, locale: CoachLocaleV1): string {
  const label = LABEL[observation.metric][locale];
  const value = `${observation.value}${UNIT_SUFFIX[observation.unit]}`;
  return locale === "ko"
    ? `${label} ${value} 측정. 시도마다 달라지면 결과 편차의 원인일 수 있습니다.`
    : `${label} measured ${value}. If it varies between attempts it may drive the spread of outcomes.`;
}

function drillFor(metric: Measured, locale: CoachLocaleV1): CoachResponseV1["drills"][number] {
  const label = LABEL[metric][locale];
  return locale === "ko"
    ? { name: "폼 슈팅 10회", purpose: `${label} 유지 감각 만들기`, constraints: ["림 앞 1m", "천천히"], success_criteria: ["10회 중 8회 같은 느낌"], retest: RETEST.ko }
    : { name: "Form shooting x10", purpose: `Feel a repeatable ${label.toLowerCase()}`, constraints: ["1 m from the rim", "slow"], success_criteria: ["8 of 10 feel the same"], retest: RETEST.en };
}

function primaryObservation(request: CoachRequestV1): CoachObservationV1 {
  const byId = (id: string) => request.observations.find((item) => item.id === id);
  const goal = request.player.training_goal;
  const preferred = goal ? byId(`obs_${GOAL_METRIC[goal]}`) : undefined;
  if (preferred) return preferred;
  for (const metric of PRIORITY) {
    const found = byId(`obs_${metric}`);
    if (found) return found;
  }
  return request.observations[0];
}

export function deterministicCoachResponse(request: CoachRequestV1): CoachResponseV1 {
  const parsed = parseCoachRequestV1(request);
  if (!parsed.ok) throw new Error(`coach request is invalid: ${parsed.issues.join("; ")}`);
  const { locale } = parsed.value;
  const measured = PRIORITY.map((metric) => parsed.value.observations.find((item) => item.metric === metric)).filter((item): item is CoachObservationV1 => item !== undefined);
  const quality = parsed.value.observations.find((item) => item.metric === "capture_quality");
  const recapture = !parsed.value.context.quality_passed || quality?.value === "recapture_needed";
  const summarySource = measured.length > 0 ? measured : parsed.value.observations;
  const observation_summary = summarySource.slice(0, 6).map((item) => summaryLine(item, locale));

  let response: CoachResponseV1;
  if (recapture) {
    const anchor = quality ?? parsed.value.observations[0];
    response = {
      schema_version: COACH_SCHEMA_VERSION,
      request_id: parsed.value.request_id,
      observation_summary,
      hypotheses: [],
      confidence: "low",
      coaching_comment: COMMENT.capture_quality[locale],
      do_not_infer: [...COACH_DO_NOT_INFER_V1, "ball_flight_outcome", "shot_result"],
      drills: [],
      retest_plan: [RETEST[locale]],
      evidence_used: [],
      primary_visual_cue: { observation_id: anchor.id, label: LABEL[anchor.metric][locale] },
      provider: { id: "deterministic_v1", revision: DETERMINISTIC_COACH_REVISION },
    };
  } else {
    const primary = primaryObservation(parsed.value);
    const confidence: CoachConfidenceV1 = capConfidence(primary.measurement_confidence, "medium");
    const metric = primary.metric === "capture_quality" ? null : primary.metric;
    response = {
      schema_version: COACH_SCHEMA_VERSION,
      request_id: parsed.value.request_id,
      observation_summary,
      hypotheses: [{
        statement: hypothesisStatement(primary, locale),
        confidence,
        supporting_observation_ids: [primary.id],
        competing_explanations: [...COMPETING[locale]],
      }],
      confidence,
      coaching_comment: COMMENT[primary.metric][locale],
      do_not_infer: [...COACH_DO_NOT_INFER_V1, "ball_flight_outcome", "shot_result"],
      drills: metric ? [drillFor(metric, locale)] : [],
      retest_plan: [RETEST[locale]],
      evidence_used: [],
      primary_visual_cue: { observation_id: primary.id, label: LABEL[primary.metric][locale] },
      provider: { id: "deterministic_v1", revision: DETERMINISTIC_COACH_REVISION },
    };
  }

  const checked = parseCoachResponseForRequest(parsed.value, response);
  if (checked.status !== "ok") throw new Error(`deterministic coach produced an invalid reply: ${JSON.stringify(checked)}`);
  return checked.response;
}

export class DeterministicCoachProvider implements CoachProvider {
  readonly id = "deterministic_v1" as const;

  async coach(request: CoachRequestV1, options: CoachProviderOptions = {}): Promise<CoachProviderResult> {
    if (options.signal?.aborted) return CANCELLED;
    return { status: "ok", response: deterministicCoachResponse(request) };
  }
}

export function createDeterministicCoachProvider(): CoachProvider {
  return new DeterministicCoachProvider();
}
