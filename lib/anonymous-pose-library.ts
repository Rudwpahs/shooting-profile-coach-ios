/**
 * Active product library.
 *
 * The former 16 generated reference animations were withdrawn because they
 * were not reconstructed from validated player motion. Do not add a model
 * here until a real video candidate passes the multi-view calibration and
 * reprojection-quality gates described in docs/real-player-pose-pipeline.md.
 */
export type BodyBand = "compact" | "balanced" | "extended";
export type PoseTraits = { releaseElevation: number; armExtension: number; lowerBodyDrive: number; rhythm: number };
export type SourceSequenceStatus = "approved_calibrated_multiview";
export type AnonymousPoseReference = {
  id: string;
  shortLabel: string;
  styleTitle: string;
  traits: PoseTraits;
  bodyFit: { stature: BodyBand; reach: BodyBand; lowerBodyPower: BodyBand; shoulderMobility: BodyBand };
  evidenceState: "validated_real_video_multiview_pose";
  modelBoundary: "calibrated_multi_view_3d";
  sourceSequenceStatus: SourceSequenceStatus;
};

export const ANONYMOUS_POSE_REFERENCES: AnonymousPoseReference[] = [];

export const ANONYMOUS_POSE_LIBRARY_STATUS = {
  profileCount: 0,
  visiblePlayerIdentity: false,
  sourceType: "real_video_required",
  calibrationStatus: "no_approved_calibrated_multiview_sequences",
  motionKind: "rebuild_in_progress",
  directSourceSequenceCount: 0,
  legacyGeneratedReferences: "withdrawn_not_product_eligible",
} as const;
