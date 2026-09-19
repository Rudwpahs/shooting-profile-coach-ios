import curryAutoCorrectedAnalysisRaw from "@/lib/motions/curry-front-side-auto-corrected-analysis-01.json";
import paulGeorgeAutoCorrectedAnalysisRaw from "@/lib/motions/paul-george-side-auto-corrected-analysis-01.json";
import currySourceSkeletonRaw from "@/lib/skeleton-reviews/curry-source-skeleton-01.json";
import paulGeorgeSourceSkeletonRaw from "@/lib/skeleton-reviews/paul-george-source-skeleton-01.json";
import type { PoseMotion } from "@/lib/pose-motion";

/** Research/audit evidence only. Production routes must never import this module. */
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

export type PlayerSourceSkeletonPhase = {
  label: string;
  progress: number;
  sourceFrameIndex: number;
  sourceTimestampMs: number;
  landmarks: { x: number; y: number; visibility: number }[];
};

export type PlayerSourceSkeletonReview = {
  id: string;
  displayName: string;
  sourceView: "정면" | "측면" | "사선";
  sourceAttribution: string;
  boundary: "single_view_2d_skeleton_review";
  state: "review_only_not_3d";
  phases: PlayerSourceSkeletonPhase[];
  quality: { landmarkFrameRatio: number; meanVisibility: number };
};

export type PlayerMonocular3DAnalysis = {
  id: string;
  displayName: string;
  shortLabel: string;
  sourceView: "정면" | "측면" | "사선";
  boundary: "monocular_relative_pose_not_metric_3d";
  state:
    | "video_based_depth_limited_estimate_not_actual_3d"
    | "dual_view_phase_aligned_estimate_not_actual_3d"
    | "dual_view_auto_corrected_estimate_not_actual_3d"
    | "single_view_auto_corrected_estimate_not_actual_3d"
    | "image_lifted_pose_estimate_not_actual_3d";
  sourceAttribution: string;
  shootingHand: "left" | "right";
  sourcePhaseTimestampsMs: number[];
  inputQuality: { landmarkFrameRatio: number; meanVisibility: number };
  depthTreatment: string;
  motion: PoseMotion;
  autoCorrection?: string;
  formMatch?: { id: string; label: string; status: "match" | "review" | "unavailable"; evidence: string }[];
};

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

const currySourceSkeleton = currySourceSkeletonRaw as {
  id: string;
  label: string;
  boundary: "single_view_2d_skeleton_review";
  state: "review_only_not_3d";
  sourceView: "front" | "side" | "oblique";
  phases: PlayerSourceSkeletonPhase[];
  inputQuality: { landmarkFrameRatio: number; meanVisibility: number };
};
const paulGeorgeSourceSkeleton = paulGeorgeSourceSkeletonRaw as typeof currySourceSkeleton;
const curryAutoCorrectedAnalysis = curryAutoCorrectedAnalysisRaw as unknown as {
  state: "image_lifted_pose_estimate_not_actual_3d";
  boundary: "monocular_relative_pose_not_metric_3d";
  sourceView: "oblique";
  shootingHandEstimate: "left";
  sourcePhaseTimestampsMs: number[];
  inputQuality: { landmarkFrameRatio: number; meanVisibility: number };
  autoCorrection: { meaning: string };
  formMatch: { checks: { id: string; label: string; status: "match" | "review" | "unavailable"; evidence: string }[] };
  motion: PoseMotion;
};
const paulGeorgeAutoCorrectedAnalysis = paulGeorgeAutoCorrectedAnalysisRaw as {
  state: "single_view_auto_corrected_estimate_not_actual_3d";
  boundary: "monocular_relative_pose_not_metric_3d";
  sourceView: "side";
  shootingHandEstimate: "right";
  sourcePhaseTimestampsMs: number[];
  inputQuality: { landmarkFrameRatio: number; meanVisibility: number };
  autoCorrection: { meaning: string };
  formMatch: { checks: { id: string; label: string; status: "match" | "review" | "unavailable"; evidence: string }[] };
  motion: PoseMotion;
};

const sourceViewLabel = (view: "front" | "side" | "oblique"): PlayerSourceSkeletonReview["sourceView"] => {
  if (view === "front") return "정면";
  if (view === "side") return "측면";
  return "사선";
};

export const PLAYER_SOURCE_SKELETON_REVIEWS: PlayerSourceSkeletonReview[] = [
  {
    id: currySourceSkeleton.id,
    displayName: "Stephen Curry",
    sourceView: sourceViewLabel(currySourceSkeleton.sourceView),
    sourceAttribution: "사용자 제공 실제 Curry 슬로모션 source에서 추출한 5단계 2D landmark",
    boundary: currySourceSkeleton.boundary,
    state: currySourceSkeleton.state,
    phases: currySourceSkeleton.phases,
    quality: currySourceSkeleton.inputQuality,
  },
  {
    id: paulGeorgeSourceSkeleton.id,
    displayName: "Paul George",
    sourceView: sourceViewLabel(paulGeorgeSourceSkeleton.sourceView),
    sourceAttribution: "사용자 제공 실제 Paul George All-Star source에서 추출한 31-frame landmark",
    boundary: paulGeorgeSourceSkeleton.boundary,
    state: paulGeorgeSourceSkeleton.state,
    phases: paulGeorgeSourceSkeleton.phases,
    quality: paulGeorgeSourceSkeleton.inputQuality,
  },
];

export const PLAYER_MONOCULAR_3D_ANALYSES: PlayerMonocular3DAnalysis[] = [
  {
    id: "curry-front-side-auto-corrected-analysis-01",
    displayName: "Stephen Curry",
    shortLabel: "CURRY · IMAGE-LIFTED 3D ANALYSIS",
    sourceView: "사선",
    boundary: curryAutoCorrectedAnalysis.boundary,
    state: curryAutoCorrectedAnalysis.state,
    sourceAttribution: "사용자 제공 Curry 사선 source의 audited 2D trajectory에 temporal image-to-3D pose lifting을 적용한 display analysis",
    shootingHand: curryAutoCorrectedAnalysis.shootingHandEstimate,
    sourcePhaseTimestampsMs: curryAutoCorrectedAnalysis.sourcePhaseTimestampsMs,
    inputQuality: { landmarkFrameRatio: 1, meanVisibility: 0.915 },
    depthTreatment: "감사된 단일 source의 x/y trajectory를 유지하고 bounded camera-relative depth prior로 display lift합니다. 실제 3D·camera geometry·측정 depth가 아닙니다.",
    autoCorrection: curryAutoCorrectedAnalysis.autoCorrection.meaning,
    formMatch: curryAutoCorrectedAnalysis.formMatch.checks,
    motion: curryAutoCorrectedAnalysis.motion,
  },
  {
    id: "paul-george-side-auto-corrected-analysis-01",
    displayName: "Paul George",
    shortLabel: "PAUL GEORGE · AUTO-CORRECTED ANALYSIS",
    sourceView: "측면",
    boundary: paulGeorgeAutoCorrectedAnalysis.boundary,
    state: paulGeorgeAutoCorrectedAnalysis.state,
    sourceAttribution: "사용자 제공 Paul George All-Star single side source에 video-audited right shooting hand와 conservative auto-correction을 적용한 display analysis",
    shootingHand: paulGeorgeAutoCorrectedAnalysis.shootingHandEstimate,
    sourcePhaseTimestampsMs: paulGeorgeAutoCorrectedAnalysis.sourcePhaseTimestampsMs,
    inputQuality: paulGeorgeAutoCorrectedAnalysis.inputQuality,
    depthTreatment: "하나의 실제 측면 source의 x/y를 유지하고 relative depth만 제한합니다. 공개 multi-angle 영상은 qualitative reference로만 감사했으며 결합하지 않았습니다.",
    autoCorrection: paulGeorgeAutoCorrectedAnalysis.autoCorrection.meaning,
    formMatch: paulGeorgeAutoCorrectedAnalysis.formMatch.checks,
    motion: paulGeorgeAutoCorrectedAnalysis.motion,
  },
];
