import cmuShoot01Raw from "@/lib/motions/cmu-shoot-01.json";
import curryFrontRelativeRaw from "@/lib/motions/curry-front-relative-01.json";
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

/** A named athlete-video review candidate. It is never part of recommendation ranking. */
export type PlayerVideoPoseCandidate = {
  id: string;
  playerDisplayName: string;
  shortLabel: string;
  styleTitle: string;
  motion: PoseMotion;
  boundary: "monocular_relative_pose_not_metric_3d";
  state: "candidate_not_product_approved";
  sourceAttribution: string;
  sourcePhaseTimestampsMs: number[];
  quality: { landmarkFrameRatio: number; meanVisibility: number };
};

const cmuShoot01 = cmuShoot01Raw.motion as PoseMotion;
const curryFrontRelative01 = curryFrontRelativeRaw as PoseMotion;

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

/** Kept separate from approved references until player-video admission criteria are met. */
export const PLAYER_VIDEO_POSE_CANDIDATES: PlayerVideoPoseCandidate[] = [
  {
    id: "curry-front-relative-01",
    playerDisplayName: "Stephen Curry",
    shortLabel: "CURRY · FRONT VIDEO",
    styleTitle: "Stephen Curry · 정면 슬로모션 후보",
    motion: curryFrontRelative01,
    boundary: "monocular_relative_pose_not_metric_3d",
    state: "candidate_not_product_approved",
    sourceAttribution: "사용자 제공 Stephen Curry 정면 슬로모션 · MediaPipe 33-landmark relative pose · raw video는 제품에 저장하지 않음",
    sourcePhaseTimestampsMs: [0, 1002, 1503, 2088, 2422],
    quality: { landmarkFrameRatio: 1, meanVisibility: 0.902 },
  },
];

export const ANONYMOUS_POSE_LIBRARY_STATUS = {
  profileCount: ANONYMOUS_POSE_REFERENCES.length,
  candidateVideoPoseCount: PLAYER_VIDEO_POSE_CANDIDATES.length,
  visiblePlayerIdentity: false,
  namingMode: "source_identity_only_until_player_source_verified",
  sourceType: "licensed_optical_mocap_or_calibrated_multiview",
  calibrationStatus: "one_approved_optical_marker_sequence",
  motionKind: "actual_optical_mocap_3d",
  directSourceSequenceCount: ANONYMOUS_POSE_REFERENCES.length,
  legacyGeneratedReferences: "withdrawn_not_product_eligible",
} as const;
