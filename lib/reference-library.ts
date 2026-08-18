export type EvidenceState = "provisional_legacy_aggregate" | "verified";

export type ShotTraits = {
  releaseElevation: number;
  armExtension: number;
  lowerBodyDrive: number;
  rhythm: number;
};

export type ReferenceArchetype = {
  id: string;
  name: string;
  shortLabel: string;
  description: string;
  suitableFor: string;
  caution: string;
  traits: ShotTraits;
  featureBand: {
    elbow: [number, number];
    shoulder: [number, number];
    hip: [number, number];
    knee: [number, number];
  };
  evidenceState: EvidenceState;
  sourceCohort: {
    anonymizedProfileCount: number;
    sourceClipCount: number;
    verificationStatus: string;
  };
};

/**
 * These bands are anonymous aggregates derived from the legacy cohort's
 * distribution. They intentionally contain no player identity, video URL, or
 * player-specific body data. Their provisional status is surfaced in the UI
 * until the provenance workflow has produced verified references.
 */
export const REFERENCE_ARCHETYPES: ReferenceArchetype[] = [
  {
    id: "compact-set",
    name: "Compact Set",
    shortLabel: "컴팩트 셋",
    description: "릴리스 전 동작을 짧게 유지하고, 공을 몸 가까이에서 안정적으로 세팅하는 특성입니다.",
    suitableFor: "촬영에서 릴리스 타이밍이 흔들리거나 준비 동작을 단순하게 만들고 싶은 사용자",
    caution: "어깨 가동성이 불편하면 높이를 억지로 낮추지 말고 통증 없는 범위에서만 연습하세요.",
    traits: { releaseElevation: 42, armExtension: 46, lowerBodyDrive: 52, rhythm: 66 },
    featureBand: { elbow: [120, 140], shoulder: [106, 121], hip: [145, 163], knee: [125, 149] },
    evidenceState: "provisional_legacy_aggregate",
    sourceCohort: { anonymizedProfileCount: 16, sourceClipCount: 221, verificationStatus: "legacy review required" },
  },
  {
    id: "rhythm-drive",
    name: "Rhythm Drive",
    shortLabel: "리듬 드라이브",
    description: "무릎과 골반의 상승 리듬을 연결해 하체 에너지를 릴리스까지 이어가는 특성입니다.",
    suitableFor: "거리 증가보다 반복 가능한 하체-상체 연결을 먼저 만들고 싶은 사용자",
    caution: "무릎 각도는 정답 수치가 아니며, 균형과 통증 여부를 우선해야 합니다.",
    traits: { releaseElevation: 54, armExtension: 52, lowerBodyDrive: 82, rhythm: 78 },
    featureBand: { elbow: [139, 153], shoulder: [119, 136], hip: [159, 167], knee: [125, 155] },
    evidenceState: "provisional_legacy_aggregate",
    sourceCohort: { anonymizedProfileCount: 16, sourceClipCount: 221, verificationStatus: "legacy review required" },
  },
  {
    id: "elevated-release",
    name: "Elevated Release",
    shortLabel: "높은 릴리스",
    description: "어깨 정렬과 팔의 확장을 활용해 릴리스 지점을 높게 가져가는 특성입니다.",
    suitableFor: "수비 압박에서 시야를 확보하고, 상체 정렬을 차분히 점검하고 싶은 사용자",
    caution: "높은 릴리스는 어깨를 과하게 긴장시키는 동작이 아닙니다. 강제적인 팔꿈치 들기는 피하세요.",
    traits: { releaseElevation: 86, armExtension: 80, lowerBodyDrive: 58, rhythm: 58 },
    featureBand: { elbow: [152, 160], shoulder: [135, 152], hip: [159, 172], knee: [149, 169] },
    evidenceState: "provisional_legacy_aggregate",
    sourceCohort: { anonymizedProfileCount: 16, sourceClipCount: 221, verificationStatus: "legacy review required" },
  },
  {
    id: "balanced-flow",
    name: "Balanced Flow",
    shortLabel: "밸런스 플로우",
    description: "상체 확장과 하체 드라이브를 한쪽으로 치우치지 않게 정돈하는 기본 특성입니다.",
    suitableFor: "어떤 특성을 우선할지 확신이 없거나 안정적인 기본 루틴을 만들고 싶은 사용자",
    caution: "이 특성은 평균값을 목표로 강요하지 않으며, 사용자 목표와 촬영 결과에 따라 조정됩니다.",
    traits: { releaseElevation: 62, armExtension: 64, lowerBodyDrive: 64, rhythm: 64 },
    featureBand: { elbow: [139, 153], shoulder: [121, 136], hip: [159, 167], knee: [147, 162] },
    evidenceState: "provisional_legacy_aggregate",
    sourceCohort: { anonymizedProfileCount: 16, sourceClipCount: 221, verificationStatus: "legacy review required" },
  },
];

export const FEATURE_DISTRIBUTION = {
  elbow: { min: 119.88, p25: 138.8, median: 146.23, p75: 151.82, max: 159.43 },
  shoulder: { min: 106.07, p25: 119.28, median: 127.35, p75: 135.05, max: 151.5 },
  hip: { min: 145.34, p25: 158.99, median: 162.63, p75: 166.73, max: 172.15 },
  knee: { min: 124.67, p25: 147.23, median: 155.35, p75: 162.18, max: 168.82 },
} as const;

export const REFERENCE_LIBRARY_STATUS = {
  sourceCommit: "27eada5",
  anonymizedLegacyProfiles: 16,
  legacyCandidateClips: 221,
  verifiedReferenceCount: 0,
  commercializationReady: false,
  message: "현재 reference archetype은 16개 legacy profile의 익명 집계입니다. 사람 검토 기반 provenance가 완료되기 전에는 provisional로만 사용합니다.",
} as const;
