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

export type PracticeFocus = { title: string; detail: string; drill: string };
export type RecommendedShotForm = AnonymousPoseReference & { matchScore: number; appliedFeature: string };

const GOAL_TARGETS: Record<TrainingGoal, PoseTraits> = {
  consistency: { releaseElevation: 58, armExtension: 58, lowerBodyDrive: 62, rhythm: 78 },
  range: { releaseElevation: 54, armExtension: 66, lowerBodyDrive: 92, rhythm: 62 },
  release: { releaseElevation: 92, armExtension: 86, lowerBodyDrive: 64, rhythm: 62 },
  rhythm: { releaseElevation: 56, armExtension: 58, lowerBodyDrive: 60, rhythm: 92 },
};

const QUICK_STYLE_BY_GOAL: Record<TrainingGoal, PreferredStyle> = { consistency: "balanced", range: "power", release: "high-release", rhythm: "quick" };
const GOAL_LABELS: Record<TrainingGoal, string> = { consistency: "일관성", range: "거리", release: "릴리스", rhythm: "리듬" };
const GOAL_APPLIED_FEATURE: Record<TrainingGoal, string> = {
  consistency: "같은 준비 리듬과 반복 가능한 팔 경로",
  range: "하체 드라이브와 팔 확장",
  release: "높은 공의 출발점과 완전한 팔 확장",
  rhythm: "캐치부터 릴리스까지의 빠른 연결",
};

const FOCUS_BY_GOAL: Record<TrainingGoal, PracticeFocus> = {
  consistency: { title: "같은 리듬을 먼저 만드세요", detail: "발의 준비와 공의 세팅 순서를 같은 속도로 반복하는 것이 우선입니다.", drill: "가까운 거리 8회 × 3세트: 캐치 후 1초 정지, 같은 리듬으로 릴리스" },
  range: { title: "하체에서 시작해 거리를 만드세요", detail: "팔로 밀기보다 무릎과 골반의 상승을 릴리스까지 연결하세요.", drill: "중거리 6회 × 3세트: 하체 드라이브 후 손목 스냅을 늦게 분리" },
  release: { title: "편안한 높은 릴리스를 찾으세요", detail: "공을 이마 앞에서 안정적으로 세팅하는 감각을 우선합니다.", drill: "폼 슛 10회 × 2세트: 공을 시야선 앞에 세팅하고 팔꿈치-손목 순서 점검" },
  rhythm: { title: "캐치에서 릴리스까지 끊기지 않게", detail: "발·골반·팔이 같은 방향으로 흐르는 순서를 먼저 고정하세요.", drill: "리듬 캐치 슛 8회 × 3세트: 발 착지와 공 세팅을 한 박자로 연결" },
};

export function createDefaultProfile(): UserShotProfile {
  return { skillLevel: "developing", goal: "consistency", preferredStyle: "balanced", body: { stature: "balanced", reach: "balanced", lowerBodyPower: "balanced", shoulderMobility: "balanced" }, traits: GOAL_TARGETS.consistency, updatedAt: new Date().toISOString() };
}

export function applyGoalSelection(profile: UserShotProfile, goal: TrainingGoal): UserShotProfile {
  return { ...profile, goal, preferredStyle: QUICK_STYLE_BY_GOAL[goal], traits: GOAL_TARGETS[goal], updatedAt: new Date().toISOString() };
}

export function getGoalApplicationSummary(goal: TrainingGoal) { return `${GOAL_LABELS[goal]} 선택 → ${GOAL_APPLIED_FEATURE[goal]}`; }
export function getPracticeFocus(goal: TrainingGoal) { return FOCUS_BY_GOAL[goal]; }

const GOAL_WEIGHTS: Record<TrainingGoal, PoseTraits> = {
  consistency: { releaseElevation: 0.15, armExtension: 0.15, lowerBodyDrive: 0.2, rhythm: 0.5 },
  range: { releaseElevation: 0.1, armExtension: 0.28, lowerBodyDrive: 0.5, rhythm: 0.12 },
  release: { releaseElevation: 0.55, armExtension: 0.3, lowerBodyDrive: 0.1, rhythm: 0.05 },
  rhythm: { releaseElevation: 0.12, armExtension: 0.12, lowerBodyDrive: 0.2, rhythm: 0.56 },
};

/** Ranks only approved anonymous real-motion references; goal selection changes the displayed match immediately. */
export function recommendShotForms(profile: UserShotProfile): RecommendedShotForm[] {
  const target = GOAL_TARGETS[profile.goal];
  const weights = GOAL_WEIGHTS[profile.goal];
  return ANONYMOUS_POSE_REFERENCES.map((reference) => {
    const weightedDistance = (Object.keys(weights) as (keyof PoseTraits)[]).reduce((total, trait) => total + Math.abs(reference.traits[trait] - target[trait]) * weights[trait], 0);
    return { ...reference, matchScore: Math.max(1, Math.round(100 - weightedDistance)), appliedFeature: GOAL_APPLIED_FEATURE[profile.goal] };
  }).sort((left, right) => right.matchScore - left.matchScore);
}

export const TRAINING_GOALS: { id: TrainingGoal; title: string; description: string }[] = [
  { id: "consistency", title: "일관성", description: "매 슛의 준비와 릴리스 리듬을 고정" },
  { id: "range", title: "거리", description: "하체에서 시작하는 힘의 연결" },
  { id: "release", title: "릴리스", description: "안정적이고 편안한 공의 출발점" },
  { id: "rhythm", title: "리듬", description: "캐치부터 팔로우스루까지의 흐름" },
];

export const SKILL_LEVELS: { id: SkillLevel; title: string }[] = [
  { id: "beginner", title: "기초" }, { id: "developing", title: "성장 중" }, { id: "advanced", title: "경기 준비" },
];

