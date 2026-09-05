import { z } from "zod";

import { angleBetweenDirections } from "@/lib/shooting-profile/direction-reconstruction";
import { ENGINEERING_THRESHOLDS_V1 } from "@/lib/shooting-profile/engineering-thresholds";
import { KINEMATIC_TREE_V1 } from "@/lib/shooting-profile/kinematics";
import {
  detectPhaseAnchors,
  PhaseDetectionError,
} from "@/lib/shooting-profile/phase-normalization";
import { buildTwoViewRepresentativeProfile } from "@/lib/shooting-profile/two-view-pipeline";
import {
  PERSISTED_JOINT_NAMES_V2,
  type LandmarkSequenceV2,
  type RepresentativePose4DV2,
} from "@/lib/shooting-profile/types";

export const TWO_VIEW_EVALUATION_REPORT_VERSION = "two_view_evaluation_report_v1" as const;

const finiteNumberSchema = z.number().finite();
const sourceClassSchema = z.enum(["synthetic_fixture", "consented_self_capture", "internal_test_capture"]);
const captureModeSchema = z.enum(["basic_1_plus_1", "high_accuracy_3_plus_3"]);
const shootingHandSchema = z.enum(["left", "right"]);

const phaseDetectionSchema = z.object({
  status: z.enum(["detected", "failed"]),
  reason: z.string().min(1).optional(),
  normalizedAnchorPositions: z.array(finiteNumberSchema.min(0).max(1)).length(5).optional(),
}).strict();

const attemptSchema = z.object({
  attemptId: z.string().min(1),
  view: z.enum(["front", "shooting_side"]),
  takeIndex: z.number().int().min(0).max(2),
  frameCount: z.number().int().nonnegative(),
  acceptedFrameRatio: finiteNumberSchema.min(0).max(1),
  nominalFrameRate: finiteNumberSchema.nonnegative(),
  frameRateMode: z.enum(["constant", "variable", "unknown"]),
  medianRequiredJointVisibility: finiteNumberSchema.min(0).max(1),
  lowerDecileRequiredJointVisibility: finiteNumberSchema.min(0).max(1),
  phaseDetection: phaseDetectionSchema,
}).strict();

const crossViewAlignmentSchema = z.union([
  z.object({
    status: z.literal("accepted"),
    version: z.literal("cross_view_phase_alignment_v1"),
    confidence: finiteNumberSchema.min(0).max(1),
    maximumIntermediateAnchorDelta: finiteNumberSchema.nonnegative(),
    phaseIntervalRmse: finiteNumberSchema.nonnegative(),
    comparedPairCount: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    status: z.literal("rejected"),
    version: z.literal("cross_view_phase_alignment_v1"),
    reason: z.string().min(1),
    maximumIntermediateAnchorDelta: finiteNumberSchema.nonnegative().optional(),
    phaseIntervalRmse: finiteNumberSchema.nonnegative().optional(),
    comparedPairCount: z.number().int().nonnegative(),
  }).strict(),
]);

const crossViewGeometrySchema = z.union([
  z.object({
    status: z.literal("accepted"),
    version: z.literal("cross_view_geometry_admission_v1"),
    minimumNormalizedViewDistance: finiteNumberSchema.nonnegative(),
    comparedPairCount: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    status: z.literal("rejected"),
    version: z.literal("cross_view_geometry_admission_v1"),
    reason: z.enum(["insufficient_view_evidence", "duplicate_view_projection", "mirrored_view_projection"]),
    minimumNormalizedViewDistance: finiteNumberSchema.nonnegative().optional(),
    comparedPairCount: z.number().int().nonnegative(),
  }).strict(),
]);

/**
 * Only these stable sub-reasons may appear as `pipeline.detail`. Anything else,
 * including a thrown error's message, is dropped by the builder and rejected by
 * the schema so a free-form string can never carry identifying text.
 */
export const PIPELINE_DETAIL_CODES_V1 = Object.freeze([
  "invalid_source_dimensions",
  "insufficient_detected_frames",
  "invalid_phase_observation",
  "degenerate_body_scale",
  "insufficient_total_motion",
  "missing_dip",
  "missing_rise",
  "missing_release_proxy",
  "missing_follow_through",
  "critical_phase_gap",
] as const);

const pipelineSchema = z.object({
  status: z.enum(["complete", "recapture_required"]),
  reason: z.string().min(1).optional(),
  detail: z.enum(PIPELINE_DETAIL_CODES_V1).optional(),
  affectedAttemptIds: z.array(z.string().min(1)).optional(),
  affectedBones: z.array(z.string().min(1)).optional(),
  confidence: finiteNumberSchema.min(0).max(1).optional(),
  selectedAttemptsByView: z.object({
    front: z.array(z.string().min(1)),
    shooting_side: z.array(z.string().min(1)),
  }).strict().optional(),
}).strict();

const evidenceSummarySchema = z.object({
  meanConditioning: finiteNumberSchema,
  minimumConditioning: finiteNumberSchema,
  meanAvailability: finiteNumberSchema,
  minimumAvailability: finiteNumberSchema,
  maximumRetainedSpreadDegrees: finiteNumberSchema,
  retainedAnchorDispersion: finiteNumberSchema,
  maximumDirectionalSensitivityDegrees: finiteNumberSchema,
  maximumDirectionalConeDegrees: finiteNumberSchema,
}).strict();

const distributionSchema = z.object({
  min: finiteNumberSchema.nonnegative(),
  median: finiteNumberSchema.nonnegative(),
  p90: finiteNumberSchema.nonnegative(),
  max: finiteNumberSchema.nonnegative(),
}).strict();

const reconstructionSchema = z.object({
  boneLengthDriftMax: finiteNumberSchema.nonnegative(),
  boneLengthDriftWithinTolerance: z.boolean(),
  jointAngleVelocityDegreesPerPhase: z.object({
    mean: finiteNumberSchema.nonnegative(),
    p95: finiteNumberSchema.nonnegative(),
    max: finiteNumberSchema.nonnegative(),
  }).strict(),
  discontinuityCount: z.number().int().nonnegative(),
  uncertainty: z.object({
    coneDegrees: distributionSchema,
    covarianceTrace: distributionSchema,
  }).strict(),
}).strict();

/**
 * The single accepted consent record form, shared by the on-device panel and
 * the local CLI. A report claiming consent is shared and pasted into a public
 * handoff, so the identifier's shape is pinned to something that cannot carry a
 * person: `local-consent-YYYYMMDD-NNN`. A looser charset rule would admit a real
 * name with a year in it.
 */
export const CONSENT_RECORD_ID_PATTERN_V1 = /^local-consent-\d{8}-\d{3}$/;

export const twoViewEvaluationReportSchema = z.object({
  version: z.literal(TWO_VIEW_EVALUATION_REPORT_VERSION),
  sourceClass: sourceClassSchema,
  consentRecordId: z.string().regex(CONSENT_RECORD_ID_PATTERN_V1).optional(),
  mode: captureModeSchema,
  shootingHand: shootingHandSchema,
  boundary: z.literal("representative_phase_fused_4d_estimate_not_actual_3d"),
  evaluatedCommitSha: z.string().regex(/^[a-f0-9]{40}$/i).optional(),
  attempts: z.array(attemptSchema),
  crossViewGeometry: crossViewGeometrySchema.optional(),
  crossViewAlignment: crossViewAlignmentSchema.optional(),
  pipeline: pipelineSchema,
  evidenceSummary: evidenceSummarySchema.optional(),
  reconstruction: reconstructionSchema.optional(),
  runtime: z.object({
    processingMs: finiteNumberSchema.nonnegative(),
    peakHeapBytes: z.number().int().nonnegative().optional(),
  }).strict(),
  privacy: z.object({
    containsRawMedia: z.literal(false),
    containsLandmarks: z.literal(false),
    containsTimestamps: z.literal(false),
    containsFilenames: z.literal(false),
  }).strict(),
}).strict().superRefine((report, context) => {
  if (report.pipeline.status === "complete" && (
    report.evidenceSummary === undefined || report.reconstruction === undefined
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reconstruction"],
      message: "Complete reports require evidence and reconstruction metrics",
    });
  }
  if (report.pipeline.status === "recapture_required" && report.reconstruction !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reconstruction"],
      message: "Recapture reports must not contain reconstruction metrics",
    });
  }

  // Consent metadata is required exactly where the source class claims consent,
  // and forbidden where the input never came from a person.
  if (report.sourceClass === "consented_self_capture" && report.consentRecordId === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["consentRecordId"],
      message: "consented_self_capture requires an opaque consent record id",
    });
  }
  if (report.sourceClass === "synthetic_fixture" && report.consentRecordId !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["consentRecordId"],
      message: "A synthetic fixture must not carry a consent record id",
    });
  }

  // The declared capture mode fixes the attempt set exactly: Basic is one take
  // per view, High is three, every attempt is distinct, and no take index may
  // repeat within a view.
  const takesPerView = report.mode === "basic_1_plus_1" ? 1 : 3;
  const front = report.attempts.filter((attempt) => attempt.view === "front");
  const side = report.attempts.filter((attempt) => attempt.view === "shooting_side");
  const distinctAttemptIds = new Set(report.attempts.map((attempt) => attempt.attemptId));
  if (
    report.attempts.length !== takesPerView * 2
    || front.length !== takesPerView
    || side.length !== takesPerView
    || distinctAttemptIds.size !== report.attempts.length
    || new Set(front.map((attempt) => attempt.takeIndex)).size !== takesPerView
    || new Set(side.map((attempt) => attempt.takeIndex)).size !== takesPerView
    || report.attempts.some((attempt) => attempt.takeIndex >= takesPerView)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["attempts"],
      message: `${report.mode} requires ${takesPerView} distinct take(s) per view`,
    });
  }
});

export type TwoViewEvaluationReportFailureReason =
  | "report_build_failed"
  | "raw_evidence_detected"
  | "schema_invalid";

/** Distinguishes why a derived report could not be produced, without leaking input detail. */
export class TwoViewEvaluationReportError extends Error {
  readonly reason: TwoViewEvaluationReportFailureReason;

  constructor(reason: TwoViewEvaluationReportFailureReason, message: string) {
    super(message);
    this.name = "TwoViewEvaluationReportError";
    this.reason = reason;
  }
}

export type TwoViewEvaluationReportV1 = z.infer<typeof twoViewEvaluationReportSchema>;

export type BuildTwoViewEvaluationReportInput = Readonly<{
  sourceClass: TwoViewEvaluationReportV1["sourceClass"];
  consentRecordId?: string;
  mode: TwoViewEvaluationReportV1["mode"];
  shootingHand: TwoViewEvaluationReportV1["shootingHand"];
  attempts: readonly Readonly<{ id: string; sequence: LandmarkSequenceV2 }>[];
  evaluatedCommitSha?: string;
}>;

const REQUIRED_LANDMARK_INDICES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const;
const DISCONTINUITY_THRESHOLD_DEGREES = 15;

function canonicalAttemptId(sequence: LandmarkSequenceV2): string {
  return `${sequence.view}-${sequence.takeIndex}`;
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function visibilityDistribution(sequence: LandmarkSequenceV2): number[] {
  return sequence.frames.flatMap((frame) => REQUIRED_LANDMARK_INDICES.map((index) => {
    const visibility = frame.sourceLandmarks[index]?.visibility;
    return typeof visibility === "number" && Number.isFinite(visibility) ? visibility : 0;
  }));
}

function normalizedAnchorPositions(sequence: LandmarkSequenceV2): TwoViewEvaluationReportV1["attempts"][number]["phaseDetection"] {
  try {
    const anchors = detectPhaseAnchors(sequence);
    const first = anchors[0].timestampMs;
    const last = anchors[anchors.length - 1].timestampMs;
    const span = last - first;
    if (!Number.isFinite(span) || span <= 0) {
      return { status: "failed", reason: "invalid_phase_observation" };
    }
    return {
      status: "detected",
      normalizedAnchorPositions: anchors.map((anchor) => (anchor.timestampMs - first) / span),
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof PhaseDetectionError ? error.reason : "invalid_phase_observation",
    };
  }
}

function copyCrossViewGeometry(
  result: ReturnType<typeof buildTwoViewRepresentativeProfile>,
): TwoViewEvaluationReportV1["crossViewGeometry"] {
  if (result.crossViewGeometry === undefined) return undefined;
  return result.crossViewGeometry.status === "accepted"
    ? {
      status: "accepted",
      version: result.crossViewGeometry.version,
      minimumNormalizedViewDistance: result.crossViewGeometry.minimumNormalizedViewDistance,
      comparedPairCount: result.crossViewGeometry.comparedPairCount,
    }
    : {
      status: "rejected",
      version: result.crossViewGeometry.version,
      reason: result.crossViewGeometry.reason,
      ...(result.crossViewGeometry.minimumNormalizedViewDistance === undefined ? {} : {
        minimumNormalizedViewDistance: result.crossViewGeometry.minimumNormalizedViewDistance,
      }),
      comparedPairCount: result.crossViewGeometry.comparedPairCount,
    };
}

function copyCrossViewAlignment(
  result: ReturnType<typeof buildTwoViewRepresentativeProfile>,
): TwoViewEvaluationReportV1["crossViewAlignment"] {
  if (result.crossViewAlignment === undefined) return undefined;
  return result.crossViewAlignment.status === "accepted"
    ? {
      status: "accepted",
      version: result.crossViewAlignment.version,
      confidence: result.crossViewAlignment.confidence,
      maximumIntermediateAnchorDelta: result.crossViewAlignment.maximumIntermediateAnchorDelta,
      phaseIntervalRmse: result.crossViewAlignment.phaseIntervalRmse,
      comparedPairCount: result.crossViewAlignment.comparedPairCount,
    }
    : {
      status: "rejected",
      version: result.crossViewAlignment.version,
      reason: result.crossViewAlignment.reason,
      ...(result.crossViewAlignment.maximumIntermediateAnchorDelta === undefined ? {} : {
        maximumIntermediateAnchorDelta: result.crossViewAlignment.maximumIntermediateAnchorDelta,
      }),
      ...(result.crossViewAlignment.phaseIntervalRmse === undefined ? {} : {
        phaseIntervalRmse: result.crossViewAlignment.phaseIntervalRmse,
      }),
      comparedPairCount: result.crossViewAlignment.comparedPairCount,
    };
}

function reconstructionMetrics(profile: RepresentativePose4DV2): TwoViewEvaluationReportV1["reconstruction"] {
  let boneLengthDriftMax = 0;
  const velocities: number[] = [];
  let discontinuityCount = 0;
  const coneDegrees: number[] = [];
  const covarianceTraces: number[] = [];

  for (const frame of profile.frames) {
    for (const bone of KINEMATIC_TREE_V1) {
      const parent = bone.parent === "pelvis" ? { x: 0, y: 0, z: 0 } : frame.joints[bone.parent];
      const child = frame.joints[bone.child];
      boneLengthDriftMax = Math.max(
        boneLengthDriftMax,
        Math.abs(Math.hypot(child.x - parent.x, child.y - parent.y, child.z - parent.z)
          - ENGINEERING_THRESHOLDS_V1.templateBoneLengths[bone.id]),
      );
    }
    for (const joint of PERSISTED_JOINT_NAMES_V2) {
      const uncertainty = frame.uncertainty[joint];
      coneDegrees.push(uncertainty.directionalConeDegrees);
      covarianceTraces.push(uncertainty.covariance[0] + uncertainty.covariance[3] + uncertainty.covariance[5]);
    }
  }

  for (let index = 1; index < profile.frames.length; index += 1) {
    const previous = profile.frames[index - 1];
    const current = profile.frames[index];
    const phaseDelta = current.phase - previous.phase;
    for (const bone of KINEMATIC_TREE_V1) {
      const previousParent = bone.parent === "pelvis" ? { x: 0, y: 0, z: 0 } : previous.joints[bone.parent];
      const currentParent = bone.parent === "pelvis" ? { x: 0, y: 0, z: 0 } : current.joints[bone.parent];
      const previousChild = previous.joints[bone.child];
      const currentChild = current.joints[bone.child];
      const angleDegrees = angleBetweenDirections(
        {
          x: previousChild.x - previousParent.x,
          y: previousChild.y - previousParent.y,
          z: previousChild.z - previousParent.z,
        },
        {
          x: currentChild.x - currentParent.x,
          y: currentChild.y - currentParent.y,
          z: currentChild.z - currentParent.z,
        },
      ) * 180 / Math.PI;
      velocities.push(angleDegrees / phaseDelta);
      if (angleDegrees > DISCONTINUITY_THRESHOLD_DEGREES) discontinuityCount += 1;
    }
  }

  const distribution = (values: readonly number[]) => ({
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p90: percentile(values, 0.9),
    max: Math.max(...values),
  });
  return {
    boneLengthDriftMax,
    boneLengthDriftWithinTolerance: boneLengthDriftMax <= ENGINEERING_THRESHOLDS_V1.templateBoneLengthTolerance,
    jointAngleVelocityDegreesPerPhase: {
      mean: velocities.reduce((sum, value) => sum + value, 0) / velocities.length,
      p95: percentile(velocities, 0.95),
      max: Math.max(...velocities),
    },
    discontinuityCount,
    uncertainty: {
      coneDegrees: distribution(coneDegrees),
      covarianceTrace: distribution(covarianceTraces),
    },
  };
}

function heapUsed(): number | undefined {
  if (typeof process === "undefined" || typeof process.memoryUsage !== "function") return undefined;
  return process.memoryUsage().heapUsed;
}

/** React Native/Hermes exposes `performance.now`; fall back to wall-clock time elsewhere. */
function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function buildTwoViewEvaluationReport(
  input: BuildTwoViewEvaluationReportInput,
): TwoViewEvaluationReportV1 {
  const startedAt = nowMs();
  let peakHeapBytes = heapUsed();
  const recordHeapUsage = () => {
    const currentHeapBytes = heapUsed();
    if (currentHeapBytes !== undefined) {
      peakHeapBytes = Math.max(peakHeapBytes ?? currentHeapBytes, currentHeapBytes);
    }
  };
  const safeAttempts = input.attempts.map(({ sequence }) => ({
    id: canonicalAttemptId(sequence),
    sequence,
  }));
  const attempts = safeAttempts.map(({ id, sequence }) => {
    const visibility = visibilityDistribution(sequence);
    const attemptedFrames = sequence.metadata.attemptedFrames;
    return {
      attemptId: id,
      view: sequence.view,
      takeIndex: sequence.takeIndex,
      frameCount: sequence.frames.length,
      acceptedFrameRatio: attemptedFrames > 0 ? sequence.metadata.detectedFrames / attemptedFrames : 0,
      nominalFrameRate: sequence.metadata.nominalFrameRate,
      frameRateMode: sequence.metadata.frameRateMode,
      medianRequiredJointVisibility: percentile(visibility, 0.5),
      lowerDecileRequiredJointVisibility: percentile(visibility, 0.1),
      phaseDetection: normalizedAnchorPositions(sequence),
    };
  });
  recordHeapUsage();
  const result = buildTwoViewRepresentativeProfile({
    mode: input.mode,
    shootingHand: input.shootingHand,
    attempts: safeAttempts,
  });
  recordHeapUsage();
  const reconstruction = result.status === "complete" ? reconstructionMetrics(result.profile) : undefined;
  recordHeapUsage();
  const runtime = {
    processingMs: Math.max(0, nowMs() - startedAt),
    ...(peakHeapBytes === undefined ? {} : { peakHeapBytes }),
  };
  const crossViewGeometry = copyCrossViewGeometry(result);
  const crossViewAlignment = copyCrossViewAlignment(result);
  const report = result.status === "complete"
    ? {
      version: TWO_VIEW_EVALUATION_REPORT_VERSION,
      sourceClass: input.sourceClass,
      ...(input.consentRecordId === undefined ? {} : { consentRecordId: input.consentRecordId }),
      mode: input.mode,
      shootingHand: input.shootingHand,
      boundary: "representative_phase_fused_4d_estimate_not_actual_3d",
      ...(input.evaluatedCommitSha === undefined ? {} : { evaluatedCommitSha: input.evaluatedCommitSha }),
      attempts,
      ...(crossViewGeometry === undefined ? {} : { crossViewGeometry }),
      crossViewAlignment,
      pipeline: {
        status: "complete" as const,
        confidence: result.confidence,
        selectedAttemptsByView: result.selectedAttemptsByView,
      },
      evidenceSummary: result.evidenceSummary,
      reconstruction,
      runtime,
      privacy: {
        containsRawMedia: false as const,
        containsLandmarks: false as const,
        containsTimestamps: false as const,
        containsFilenames: false as const,
      },
    }
    : {
      version: TWO_VIEW_EVALUATION_REPORT_VERSION,
      sourceClass: input.sourceClass,
      ...(input.consentRecordId === undefined ? {} : { consentRecordId: input.consentRecordId }),
      mode: input.mode,
      shootingHand: input.shootingHand,
      boundary: "representative_phase_fused_4d_estimate_not_actual_3d",
      ...(input.evaluatedCommitSha === undefined ? {} : { evaluatedCommitSha: input.evaluatedCommitSha }),
      attempts,
      ...(crossViewGeometry === undefined ? {} : { crossViewGeometry }),
      ...(crossViewAlignment === undefined ? {} : { crossViewAlignment }),
      pipeline: {
        status: "recapture_required" as const,
        reason: result.reason,
        ...(allowlistedPipelineDetail(result.detail) === undefined
          ? {}
          : { detail: allowlistedPipelineDetail(result.detail) }),
        affectedAttemptIds: [...result.affectedAttemptIds],
        affectedBones: [...result.affectedBones],
      },
      runtime,
      privacy: {
        containsRawMedia: false as const,
        containsLandmarks: false as const,
        containsTimestamps: false as const,
        containsFilenames: false as const,
      },
    };
  const parsed = twoViewEvaluationReportSchema.safeParse(report);
  if (!parsed.success) {
    throw new TwoViewEvaluationReportError(
      "schema_invalid",
      "Evaluation report does not satisfy the derived-report schema",
    );
  }
  assertReportContainsNoRawEvidence(parsed.data);
  return parsed.data;
}

/**
 * Word boundaries matter: the report's own `privacy.containsFilenames` key and
 * the `heuristic_v1` uncertainty model must not trip the guard, while a real
 * `filename`, `uri`, or `nose` landmark field must.
 */
const RAW_EVIDENCE_PATTERN = /file:\/\/|\.mp4\b|\.mov\b|\bfilename\b|\bfileName\b|\buri\b|sourceLandmarks|timestampMs|sourceTimestampMs|\bexif\b|\bnose\b|"z"\s*:/i;

export function assertReportContainsNoRawEvidence(report: TwoViewEvaluationReportV1): void {
  if (RAW_EVIDENCE_PATTERN.test(JSON.stringify(report))) {
    throw new TwoViewEvaluationReportError(
      "raw_evidence_detected",
      "Evaluation report contains prohibited raw evidence",
    );
  }
}

function allowlistedPipelineDetail(
  detail: string | undefined,
): (typeof PIPELINE_DETAIL_CODES_V1)[number] | undefined {
  return PIPELINE_DETAIL_CODES_V1.find((code) => code === detail);
}
