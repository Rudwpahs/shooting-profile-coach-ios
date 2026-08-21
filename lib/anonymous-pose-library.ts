import cmuShoot01Raw from "@/lib/motions/cmu-shoot-01.json";
import type { PoseMotion } from "@/lib/pose-motion";

/** Active product library. Only reproducible real optical data may enter it. */
export type BodyBand = "compact" | "balanced" | "extended";
export type PoseTraits = { releaseElevation: number; armExtension: number; lowerBodyDrive: number; rhythm: number };
export type SourceSequenceStatus = "approved_calibrated_multiview" | "approved_actual_optical_mocap";
export type AnonymousPoseReference = {
  id: string;
  shortLabel: string;
  styleTitle: string;
  traits: PoseTraits;
  bodyFit: { stature: BodyBand; reach: BodyBand; lowerBodyPower: BodyBand; shoulderMobility: BodyBand };
  evidenceState: "validated_real_video_multiview_pose" | "validated_actual_optical_mocap";
  modelBoundary: "calibrated_multi_view_3d" | "actual_optical_mocap_3d";
  sourceSequenceStatus: SourceSequenceStatus;
  motion: PoseMotion;
  sourceAttribution: string;
  /** Source C3D frames paired in order with the five product shot phases. */
  sourcePhaseFrames?: number[];
  /** Temporary UI-only label. It never changes measured motion provenance. */
  prototypeDisplayName?: string;
};

/**
 * Athlete-video audit record. It intentionally contains no PoseMotion because
 * non-synchronized single-camera landmarks must not be rendered as rotatable 3D.
 */
export type PlayerVideoReviewRecord = {
  id: string;
  playerDisplayName: string;
  shortLabel: string;
  styleTitle: string;
  sourceView: "정면" | "사선";
  boundary: "monocular_relative_pose_not_metric_3d";
  state: "withdrawn_unreconstructed_single_view";
  sourceAttribution: string;
  sourcePhaseTimestampsMs: number[];
  quality: { landmarkFrameRatio: number; meanVisibility: number };
  withdrawalReason: string;
};

const cmuShoot01 = cmuShoot01Raw.motion as PoseMotion;

export const ANONYMOUS_POSE_REFERENCES: AnonymousPoseReference[] = [
  {
    id: "cmu-shoot-01",
    shortLabel: "MOTION 01",
    styleTitle: "높은 릴리스 · 연속 팔로우스루",
    traits: { releaseElevation: 93, armExtension: 86, lowerBodyDrive: 82, rhythm: 70 },
    bodyFit: { stature: "balanced", reach: "balanced", lowerBodyPower: "extended", shoulderMobility: "balanced" },
    evidenceState: "validated_actual_optical_mocap",
    modelBoundary: "actual_optical_mocap_3d",
    sourceSequenceStatus: "approved_actual_optical_mocap",
    motion: cmuShoot01,
    sourceAttribution: "CMU Graphics Lab Motion Capture Database · licensed optical marker data · anonymous source",
    sourcePhaseFrames: [269, 317, 335, 353, 385],
  },
];

/** Retained for audit traceability only; never visualized as product 3D. */
export const PLAYER_VIDEO_REVIEW_RECORDS: PlayerVideoReviewRecord[] = [
  {
    id: "curry-front-relative-01",
    playerDisplayName: "Stephen Curry",
    shortLabel: "CURRY · FRONT VIDEO",
    styleTitle: "Stephen Curry · 정면 영상 검토 기록",
    sourceView: "정면",
    boundary: "monocular_relative_pose_not_metric_3d",
    state: "withdrawn_unreconstructed_single_view",
    sourceAttribution: "사용자 제공 Stephen Curry 정면 슬로모션 · raw video는 제품에 저장하지 않음",
    sourcePhaseTimestampsMs: [0, 1002, 1503, 2088, 2422],
    quality: { landmarkFrameRatio: 1, meanVisibility: 0.902 },
    withdrawalReason: "image-normalized landmark z를 물리 depth처럼 회전·투영한 표현을 철회했습니다. 동기화·camera calibration·reprojection 검증이 없습니다.",
  },
  {
    id: "curry-mobile-relative-02",
    playerDisplayName: "Stephen Curry",
    shortLabel: "CURRY · OBLIQUE VIDEO",
    styleTitle: "Stephen Curry · 사선 영상 검토 기록",
    sourceView: "사선",
    boundary: "monocular_relative_pose_not_metric_3d",
    state: "withdrawn_unreconstructed_single_view",
    sourceAttribution: "사용자 제공 Stephen Curry 사선 mobile-following 슬로모션 · raw video는 제품에 저장하지 않음",
    sourcePhaseTimestampsMs: [2000, 2667, 2833, 3000, 3250],
    quality: { landmarkFrameRatio: 1, meanVisibility: 0.822 },
    withdrawalReason: "정면 영상과 다른 shot·다른 timestamp·unknown camera geometry이므로 3D triangulation에 결합할 수 없습니다.",
  },
];

export const ANONYMOUS_POSE_LIBRARY_STATUS = {
  profileCount: ANONYMOUS_POSE_REFERENCES.length,
  withdrawnVideoReviewCount: PLAYER_VIDEO_REVIEW_RECORDS.length,
  visiblePlayerIdentity: false,
  namingMode: "source_identity_only_until_player_source_verified",
  sourceType: "licensed_optical_mocap_or_calibrated_multiview",
  calibrationStatus: "one_approved_optical_marker_sequence",
  motionKind: "actual_optical_mocap_3d",
  directSourceSequenceCount: ANONYMOUS_POSE_REFERENCES.length,
  legacyGeneratedReferences: "withdrawn_not_product_eligible",
} as const;
