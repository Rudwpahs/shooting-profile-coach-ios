import { REFERENCE_ARCHETYPES, type ReferenceArchetype, type ShotTraits } from "@/lib/reference-library";

export type SkillLevel = "beginner" | "developing" | "advanced";
export type TrainingGoal = "consistency" | "range" | "release" | "rhythm";

export type UserShotProfile = {
  skillLevel: SkillLevel;
  goal: TrainingGoal;
  traits: ShotTraits;
  updatedAt: string;
};

export type Recommendation = {
  archetype: ReferenceArchetype;
  fitScore: number;
  confidence: "provisional" | "verified";
  alignment: Array<{ trait: keyof ShotTraits; label: string; delta: number }>;
  focus: {
    title: string;
    detail: string;
    drill: string;
  };
};

const TRAIT_LABELS: Record<keyof ShotTraits, string> = {
  releaseElevation: "릴리스 높이",
  armExtension: "팔의 확장",
  lowerBodyDrive: "하체 드라이브",
  rhythm: "동작 리듬",
};

const GOAL_WEIGHTS: Record<TrainingGoal, Record<keyof ShotTraits, number>> = {
  consistency: { releaseElevation: 0.2, armExtension: 0.2, lowerBodyDrive: 0.25, rhythm: 0.35 },
  range: { releaseElevation: 0.15, armExtension: 0.25, lowerBodyDrive: 0.4, rhythm: 0.2 },
  release: { releaseElevation: 0.45, armExtension: 0.35, lowerBodyDrive: 0.1, rhythm: 0.1 },
  rhythm: { releaseElevation: 0.1, armExtension: 0.15, lowerBodyDrive: 0.3, rhythm: 0.45 },
};

const GOAL_AFFINITY: Record<TrainingGoal, string[]> = {
  consistency: ["balanced-flow", "compact-set"],
  range: ["rhythm-drive"],
  release: ["elevated-release"],
  rhythm: ["rhythm-drive", "compact-set"],
};

const FOCUS_BY_GOAL: Record<TrainingGoal, Recommendation["focus"]> = {
  consistency: {
    title: "같은 리듬을 먼저 만드세요",
    detail: "매 슛에서 발의 준비와 공의 세팅 순서를 같은 속도로 반복하는 것이 우선입니다.",
    drill: "가까운 거리에서 8회 × 3세트: 캐치 후 1초 정지, 같은 리듬으로 릴리스",
  },
  range: {
    title: "하체에서 시작해 거리를 만드세요",
    detail: "팔로 공을 밀기보다 무릎과 골반의 상승을 릴리스까지 끊기지 않게 연결하세요.",
    drill: "중거리 6회 × 3세트: 하체 드라이브 후 손목 스냅을 늦게 분리",
  },
  release: {
    title: "편안한 높은 릴리스를 찾으세요",
    detail: "어깨를 올리는 대신 공을 이마 앞에서 안정적으로 세팅하는 감각을 우선합니다.",
    drill: "폼 슛 10회 × 2세트: 공을 시야선 앞에 세팅하고 팔꿈치-손목 순서 점검",
  },
  rhythm: {
    title: "캐치에서 릴리스까지 끊기지 않게",
    detail: "빠르기보다 발·골반·팔이 같은 방향으로 흐르는 순서를 먼저 고정하세요.",
    drill: "리듬 캐치 슛 8회 × 3세트: 발 착지와 공 세팅을 한 박자로 연결",
  },
};

function weightedDistance(profile: UserShotProfile, archetype: ReferenceArchetype) {
  const weights = GOAL_WEIGHTS[profile.goal];
  return (Object.keys(weights) as Array<keyof ShotTraits>).reduce(
    (sum, trait) => sum + Math.abs(profile.traits[trait] - archetype.traits[trait]) * weights[trait],
    0,
  );
}

export function createDefaultProfile(): UserShotProfile {
  return {
    skillLevel: "developing",
    goal: "consistency",
    traits: { releaseElevation: 50, armExtension: 50, lowerBodyDrive: 50, rhythm: 50 },
    updatedAt: new Date().toISOString(),
  };
}

export function recommendArchetypes(profile: UserShotProfile): Recommendation[] {
  return REFERENCE_ARCHETYPES
    .map((archetype) => {
      const distance = weightedDistance(profile, archetype);
      const goalBonus = GOAL_AFFINITY[profile.goal].indexOf(archetype.id) === 0 ? 22 : GOAL_AFFINITY[profile.goal].includes(archetype.id) ? 10 : 0;
      const fitScore = Math.round(Math.max(40, Math.min(96, 100 - distance * 1.1 + goalBonus)));
      const confidence: Recommendation["confidence"] = archetype.evidenceState === "verified" ? "verified" : "provisional";
      const alignment = (Object.keys(profile.traits) as Array<keyof ShotTraits>)
        .map((trait) => ({ trait, label: TRAIT_LABELS[trait], delta: profile.traits[trait] - archetype.traits[trait] }))
        .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
      return {
        archetype,
        fitScore,
        confidence,
        alignment,
        focus: FOCUS_BY_GOAL[profile.goal],
      };
    })
    .sort((a, b) => b.fitScore - a.fitScore);
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
