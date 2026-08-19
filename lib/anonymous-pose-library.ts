export type BodyBand = "compact" | "balanced" | "extended";
export type PoseTraits = { releaseElevation: number; armExtension: number; lowerBodyDrive: number; rhythm: number };
export type SourceSequenceStatus = "needs_manual_clip_selection" | "rejected_for_direct_sequence_use";
export type AnonymousPoseReference = {
  id: string;
  shortLabel: string;
  styleTitle: string;
  traits: PoseTraits;
  bodyFit: { stature: BodyBand; reach: BodyBand; lowerBodyPower: BodyBand; shoulderMobility: BodyBand };
  evidenceState: "summary_derived_biomechanical_reference_animation";
  modelBoundary: "non_metric_reference_animation";
  sourceSequenceStatus: SourceSequenceStatus;
};

const balancedBody = { stature: "balanced", reach: "balanced", lowerBodyPower: "balanced", shoulderMobility: "balanced" } as const;

const sourceStatus: SourceSequenceStatus[] = [
  "needs_manual_clip_selection", "rejected_for_direct_sequence_use", "rejected_for_direct_sequence_use", "needs_manual_clip_selection",
  "needs_manual_clip_selection", "rejected_for_direct_sequence_use", "needs_manual_clip_selection", "needs_manual_clip_selection",
  "rejected_for_direct_sequence_use", "needs_manual_clip_selection", "rejected_for_direct_sequence_use", "needs_manual_clip_selection",
  "rejected_for_direct_sequence_use", "needs_manual_clip_selection", "needs_manual_clip_selection", "needs_manual_clip_selection",
];

const traitRows: Array<{ styleTitle: string; traits: PoseTraits }> = [
  { styleTitle: "낮은 준비-확장 흐름", traits: { releaseElevation: 41, armExtension: 56, lowerBodyDrive: 49, rhythm: 50 } },
  { styleTitle: "상체 확장 강조", traits: { releaseElevation: 54, armExtension: 63, lowerBodyDrive: 45, rhythm: 53 } },
  { styleTitle: "상승 리듬 강조", traits: { releaseElevation: 56, armExtension: 52, lowerBodyDrive: 39, rhythm: 58 } },
  { styleTitle: "준비 구간 연결", traits: { releaseElevation: 43, armExtension: 56, lowerBodyDrive: 44, rhythm: 52 } },
  { styleTitle: "컴팩트한 팔 경로", traits: { releaseElevation: 49, armExtension: 41, lowerBodyDrive: 47, rhythm: 49 } },
  { styleTitle: "상체 확장 강조", traits: { releaseElevation: 52, armExtension: 61, lowerBodyDrive: 52, rhythm: 49 } },
  { styleTitle: "하체 연결 강조", traits: { releaseElevation: 48, armExtension: 52, lowerBodyDrive: 61, rhythm: 44 } },
  { styleTitle: "균형 잡힌 상승", traits: { releaseElevation: 54, armExtension: 58, lowerBodyDrive: 47, rhythm: 54 } },
  { styleTitle: "높은 릴리스 참조", traits: { releaseElevation: 62, armExtension: 59, lowerBodyDrive: 43, rhythm: 57 } },
  { styleTitle: "높은 릴리스 참조", traits: { releaseElevation: 62, armExtension: 63, lowerBodyDrive: 42, rhythm: 56 } },
  { styleTitle: "팔 확장-상승 연결", traits: { releaseElevation: 53, armExtension: 59, lowerBodyDrive: 42, rhythm: 54 } },
  { styleTitle: "균형 잡힌 릴리스", traits: { releaseElevation: 55, armExtension: 51, lowerBodyDrive: 44, rhythm: 54 } },
  { styleTitle: "준비 구간 안정", traits: { releaseElevation: 46, armExtension: 52, lowerBodyDrive: 42, rhythm: 50 } },
  { styleTitle: "중립 확장 흐름", traits: { releaseElevation: 47, armExtension: 55, lowerBodyDrive: 45, rhythm: 51 } },
  { styleTitle: "중립 참조 흐름", traits: { releaseElevation: 50, armExtension: 49, lowerBodyDrive: 50, rhythm: 50 } },
  { styleTitle: "하체-팔 연속성", traits: { releaseElevation: 45, armExtension: 50, lowerBodyDrive: 55, rhythm: 57 } },
];

export const ANONYMOUS_POSE_REFERENCES: AnonymousPoseReference[] = traitRows.map((row, index) => ({
  id: `motion-${String(index + 1).padStart(2, "0")}`,
  shortLabel: `모션 ${String(index + 1).padStart(2, "0")}`,
  ...row,
  bodyFit: balancedBody,
  evidenceState: "summary_derived_biomechanical_reference_animation",
  modelBoundary: "non_metric_reference_animation",
  sourceSequenceStatus: sourceStatus[index],
}));

export const ANONYMOUS_POSE_LIBRARY_STATUS = {
  profileCount: 16,
  visiblePlayerIdentity: false,
  sourceType: "reviewed_video_summary_descriptors",
  calibrationStatus: "not_available",
  motionKind: "biomechanical_reference_animation",
  directSourceSequenceCount: 0,
} as const;
