import { ANONYMOUS_POSE_REFERENCES, type AnonymousPoseReference, type BodyBand, type PoseTraits } from "@/lib/anonymous-pose-library";

export type SkillLevel = "beginner" | "developing" | "advanced";
export type TrainingGoal = "consistency" | "range" | "release" | "rhythm";
export type PreferredStyle = "quick" | "power" | "high-release" | "balanced";

export type BodyProfile = {
  stature: BodyBand;
  reach: BodyBand;
  lowerBodyPower: BodyBand;
  shoulderMobility: BodyBand;
};

export type UserShotProfile = {
  skillLevel: SkillLevel;
  goal: TrainingGoal;
  preferredStyle: PreferredStyle;
  body: BodyProfile;
  traits: PoseTraits;
  updatedAt: string;
};

export type PoseRecommendation = {
  reference: AnonymousPoseReference;
  fitScore: number;
  confidence: "youtube_pose_candidate";
  alignment: Array<{ trait: keyof PoseTraits; label: string; delta: number }>;
  bodyFitScore: number;
  reasons: string[];
  focus: {
    title: string;
    detail: string;
    drill: string;
  };
};

const TRAIT_LABELS: Record<keyof PoseTraits, string> = {
  releaseElevation: "릴리스 높이",
  armExtension: "팔의 확장",
  lowerBodyDrive: "하체 드라이브",
  rhythm: "동작 리듬",
};

const GOAL_WEIGHTS: Record<TrainingGoal, Record<keyof PoseTraits, number>> = {
  consistency: { releaseElevation: 0.2, armExtension: 0.2, lowerBodyDrive: 0.25, rhythm: 0.35 },
  range: { releaseElevation: 0.15, armExtension: 0.25, lowerBodyDrive: 0.4, rhythm: 0.2 },
  release: { releaseElevation: 0.45, armExtension: 0.35, lowerBodyDrive: 0.1, rhythm: 0.1 },
  rhythm: { releaseElevation: 0.1, armExtension: 0.15, lowerBodyDrive: 0.3, rhythm: 0.45 },
};

const STYLE_TARGETS: Record<PreferredStyle, PoseTraits> = {
  quick: { releaseElevation: 58, armExtension: 50, lowerBodyDrive: 55, rhythm: 86 },
  power: { releaseElevation: 54, armExtension: 62, lowerBodyDrive: 88, rhythm: 64 },
  "high-release": { releaseElevation: 88, armExtension: 82, lowerBodyDrive: 58, rhythm: 58 },
  balanced: { releaseElevation: 60, armExtension: 60, lowerBodyDrive: 60, rhythm: 60 },
};

const FOCUS_BY_GOAL: Record<TrainingGoal, PoseRecommendation["focus"]> = {
  consistency: { title: "같은 리듬을 먼저 만드세요", detail: "발의 준비와 공의 세팅 순서를 같은 속도로 반복하는 것이 우선입니다.", drill: "가까운 거리 8회 × 3세트: 캐치 후 1초 정지, 같은 리듬으로 릴리스" },
  range: { title: "하체에서 시작해 거리를 만드세요", detail: "팔로 밀기보다 무릎과 골반의 상승을 릴리스까지 연결하세요.", drill: "중거리 6회 × 3세트: 하체 드라이브 후 손목 스냅을 늦게 분리" },
  release: { title: "편안한 높은 릴리스를 찾으세요", detail: "공을 이마 앞에서 안정적으로 세팅하는 감각을 우선합니다.", drill: "폼 슛 10회 × 2세트: 공을 시야선 앞에 세팅하고 팔꿈치-손목 순서 점검" },
  rhythm: { title: "캐치에서 릴리스까지 끊기지 않게", detail: "발·골반·팔이 같은 방향으로 흐르는 순서를 먼저 고정하세요.", drill: "리듬 캐치 슛 8회 × 3세트: 발 착지와 공 세팅을 한 박자로 연결" },
};

const bodyLabel: Record<keyof BodyProfile, string> = { stature: "신장 감각", reach: "팔 길이 감각", lowerBodyPower: "하체 힘", shoulderMobility: "어깨 가동 범위" };

function weightedSimilarity(left: PoseTraits, right: PoseTraits, weights: Record<keyof PoseTraits, number>) {
  const distance = (Object.keys(weights) as Array<keyof PoseTraits>).reduce((sum, trait) => sum + Math.abs(left[trait] - right[trait]) * weights[trait], 0);
  return Math.max(0, 100 - distance);
}

function bandSimilarity(left: BodyBand, right: BodyBand) {
  if (left === right) return 100;
  if (left === "balanced" || right === "balanced") return 64;
  return 28;
}

function bodySimilarity(left: BodyProfile, right: AnonymousPoseReference["bodyFit"]) {
  const entries = Object.keys(left) as Array<keyof BodyProfile>;
  return Math.round(entries.reduce((sum, key) => sum + bandSimilarity(left[key], right[key]), 0) / entries.length);
}

function strongestReason(profile: UserShotProfile, reference: AnonymousPoseReference, bodyScore: number) {
  const closestTrait = (Object.keys(profile.traits) as Array<keyof PoseTraits>)
    .map((trait) => ({ trait, delta: Math.abs(profile.traits[trait] - reference.traits[trait]) }))
    .sort((a, b) => a.delta - b.delta)[0];
  const bestBodyMatch = (Object.keys(profile.body) as Array<keyof BodyProfile>)
    .map((key) => ({ key, score: bandSimilarity(profile.body[key], reference.bodyFit[key]) }))
    .sort((a, b) => b.score - a.score)[0];
  const bodyReason = bestBodyMatch.score >= 64 ? `${bodyLabel[bestBodyMatch.key]} 조건이 이 모션의 움직임 범위와 가깝습니다.` : "신체 조건은 참고값이며 편안함과 통증 여부를 우선합니다.";
  return [`${TRAIT_LABELS[closestTrait.trait]} 특성이 현재 목표와 가장 가깝습니다.`, bodyReason, `신체 조건 적합도 ${bodyScore}/100`];
}

export function createDefaultProfile(): UserShotProfile {
  return {
    skillLevel: "developing",
    goal: "consistency",
    preferredStyle: "balanced",
    body: { stature: "balanced", reach: "balanced", lowerBodyPower: "balanced", shoulderMobility: "balanced" },
    traits: { releaseElevation: 50, armExtension: 50, lowerBodyDrive: 50, rhythm: 50 },
    updatedAt: new Date().toISOString(),
  };
}

export function recommendShotForms(profile: UserShotProfile): PoseRecommendation[] {
  return ANONYMOUS_POSE_REFERENCES
    .map((reference) => {
      const traitScore = weightedSimilarity(profile.traits, reference.traits, GOAL_WEIGHTS[profile.goal]);
      const styleScore = weightedSimilarity(STYLE_TARGETS[profile.preferredStyle], reference.traits, { releaseElevation: 0.25, armExtension: 0.25, lowerBodyDrive: 0.25, rhythm: 0.25 });
      const bodyFitScore = bodySimilarity(profile.body, reference.bodyFit);
      const fitScore = Math.round(Math.max(35, Math.min(96, traitScore * 0.55 + bodyFitScore * 0.25 + styleScore * 0.2)));
      const alignment = (Object.keys(profile.traits) as Array<keyof PoseTraits>)
        .map((trait) => ({ trait, label: TRAIT_LABELS[trait], delta: profile.traits[trait] - reference.traits[trait] }))
        .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
      return { reference, fitScore, confidence: "youtube_pose_candidate" as const, alignment, bodyFitScore, reasons: strongestReason(profile, reference, bodyFitScore), focus: FOCUS_BY_GOAL[profile.goal] };
    })
    .sort((left, right) => right.fitScore - left.fitScore);
}

export const TRAINING_GOALS: Array<{ id: TrainingGoal; title: string; description: string }> = [
  { id: "consistency", title: "일관성", description: "매 슛의 준비와 릴리스 리듬을 고정" },
  { id: "range", title: "거리", description: "하체에서 시작하는 힘의 연결" },
  { id: "release", title: "릴리스", description: "안정적이고 편안한 공의 출발점" },
  { id: "rhythm", title: "리듬", description: "캐치부터 팔로우스루까지의 흐름" },
];

export const SKILL_LEVELS: Array<{ id: SkillLevel; title: string }> = [
  { id: "beginner", title: "기초" },
  { id: "developing", title: "성장 중" },
  { id: "advanced", title: "경기 준비" },
];
