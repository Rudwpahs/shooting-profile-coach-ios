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
    prototypeDisplayName: "Stephen Curry",
  },
];

export const ANONYMOUS_POSE_LIBRARY_STATUS = {
  profileCount: ANONYMOUS_POSE_REFERENCES.length,
  visiblePlayerIdentity: true,
  namingMode: "prototype_comparison_label_only",
  sourceType: "licensed_optical_mocap_or_calibrated_multiview",
  calibrationStatus: "one_approved_optical_marker_sequence",
  motionKind: "actual_optical_mocap_3d",
  directSourceSequenceCount: ANONYMOUS_POSE_REFERENCES.length,
  legacyGeneratedReferences: "withdrawn_not_product_eligible",
} as const;
