import { z } from "zod";

import { restoreSourcePoint } from "@/lib/shooting-profile/coordinate-space";
import type { LandmarkSequenceV2 } from "@/lib/shooting-profile/types";

/**
 * Pure, platform-independent contract for on-device clip analysis output.
 *
 * Both codecs live here so that Node tooling (the privacy-safe evaluation CLI)
 * and tests can validate a `LandmarkSequenceV2` without importing the native
 * Expo module that `lib/pose-detection-v2.ts` binds to.
 */

const finiteNumber = z.number().finite();
const nonnegativeInteger = finiteNumber.int().nonnegative();
const positiveInteger = finiteNumber.int().positive();


/** Engineering defaults pending physical-device/biomechanics validation. */
export const POSE_V2_ENGINEERING_DEFAULTS = Object.freeze({
  minimumLocatorDetectedFrames: 5,
  minimumLocatorDetectionRatio: 0.5,
  minimumDetectedFrames: 8,
  minimumFinalDetectionRatio: 0.8,
  minimumCriticalJointCoverage: 0.85,
  minimumCriticalJointVisibility: 0.5,
  maximumReleaseProxyDetectionGapMs: 150,
});

const CRITICAL_LANDMARK_INDICES = [11, 12, 15, 16, 23, 24, 25, 26, 27, 28] as const;

const landmarkSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  // This remains raw MediaPipe image-relative z for local coordinate restoration/quality only.
  z: finiteNumber,
  visibility: finiteNumber.min(0).max(1).optional(),
}).strict();

const cropRectSchema = z.object({
  x: nonnegativeInteger,
  y: nonnegativeInteger,
  width: positiveInteger,
  height: positiveInteger,
}).strict();

const frameSchema = z.object({
  timestampMs: nonnegativeInteger,
  modelLandmarks: z.array(landmarkSchema).length(33),
  cropRectPx: cropRectSchema,
  modelToSourcePx: z.tuple([
    finiteNumber, finiteNumber, finiteNumber,
    finiteNumber, finiteNumber, finiteNumber,
    finiteNumber, finiteNumber, finiteNumber,
  ]),
}).strict();

const attemptSchema = z.object({
  requestedTimestampMs: nonnegativeInteger,
  decodedTimestampMs: nonnegativeInteger.nullable(),
  detectedTimestampMs: nonnegativeInteger.nullable(),
}).strict();

const metadataSchema = z.object({
  durationMs: positiveInteger,
  displayWidth: positiveInteger,
  displayHeight: positiveInteger,
  nominalFrameRate: finiteNumber.nonnegative(),
  frameRateMode: z.enum(["constant", "variable", "unknown"]),
  locatorAttemptedFrames: nonnegativeInteger,
  locatorDecodedFrames: nonnegativeInteger,
  locatorDetectedFrames: nonnegativeInteger,
  attemptedFrames: nonnegativeInteger,
  decodedFrames: nonnegativeInteger,
  detectedFrames: nonnegativeInteger,
  rejectedFrames: nonnegativeInteger,
  releaseProxyTimestampMs: nonnegativeInteger,
  attempts: z.array(attemptSchema),
}).strict();

const qualityReasonSchema = z.enum([
  "too_few_detected_frames",
  "low_detection_ratio",
  "low_critical_joint_coverage",
  "critical_phase_gap",
]);
const landmarkSequenceSchema = z.object({
  version: z.literal(2),
  view: z.enum(["front", "shooting_side"]),
  shootingHand: z.enum(["left", "right"]),
  takeIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  metadata: metadataSchema,
  frames: z.array(frameSchema),
  transformConvention: z.literal("cropped_model_to_upright_source_v1"),
  quality: z.object({
    passed: z.boolean(),
    reasons: z.array(qualityReasonSchema),
  }).strict(),
}).strict().superRefine((sequence, context) => {
  const { metadata, frames } = sequence;
  if (metadata.locatorDecodedFrames > metadata.locatorAttemptedFrames) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "locatorDecodedFrames"], message: "locatorDecodedFrames exceeds locatorAttemptedFrames" });
  }
  if (metadata.locatorDetectedFrames > metadata.locatorDecodedFrames) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "locatorDetectedFrames"], message: "locatorDetectedFrames exceeds locatorDecodedFrames" });
  }
  const locatorDetectionRatio = metadata.locatorAttemptedFrames === 0
    ? 0
    : metadata.locatorDetectedFrames / metadata.locatorAttemptedFrames;
  if (
    metadata.locatorDetectedFrames < POSE_V2_ENGINEERING_DEFAULTS.minimumLocatorDetectedFrames
    || locatorDetectionRatio < POSE_V2_ENGINEERING_DEFAULTS.minimumLocatorDetectionRatio
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "locatorDetectedFrames"], message: "locator evidence cannot have produced an admitted ROI" });
  }
  if (metadata.decodedFrames > metadata.attemptedFrames) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "decodedFrames"], message: "decodedFrames exceeds attemptedFrames" });
  }
  if (metadata.detectedFrames > metadata.decodedFrames) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "detectedFrames"], message: "detectedFrames exceeds decodedFrames" });
  }
  if (metadata.rejectedFrames !== metadata.attemptedFrames - metadata.detectedFrames) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "rejectedFrames"], message: "rejectedFrames is not attemptedFrames - detectedFrames" });
  }
  if (metadata.detectedFrames !== frames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["frames"], message: "detectedFrames does not match returned frames" });
  }

  if (metadata.attempts.length !== metadata.attemptedFrames) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "attempts"], message: "attempt evidence length must equal attemptedFrames" });
  }
  let observedDecoded = 0;
  const detectedAttemptTimestamps: number[] = [];
  metadata.attempts.forEach((attempt, attemptIndex) => {
    if (attemptIndex > 0 && attempt.requestedTimestampMs <= metadata.attempts[attemptIndex - 1].requestedTimestampMs) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "attempts", attemptIndex, "requestedTimestampMs"], message: "attempt timestamps must be strictly increasing" });
    }
    if (attempt.requestedTimestampMs >= metadata.durationMs) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "attempts", attemptIndex, "requestedTimestampMs"], message: "attempt lies outside clip duration" });
    }
    if (attempt.decodedTimestampMs !== null) {
      observedDecoded += 1;
      if (attempt.decodedTimestampMs > metadata.durationMs) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "attempts", attemptIndex, "decodedTimestampMs"], message: "decoded actual timestamp lies outside clip duration" });
      }
    }
    if (attempt.detectedTimestampMs !== null) {
      if (attempt.detectedTimestampMs > metadata.durationMs) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "attempts", attemptIndex, "detectedTimestampMs"], message: "detected actual timestamp lies outside clip duration" });
      }
      if (attempt.decodedTimestampMs === null || attempt.detectedTimestampMs !== attempt.decodedTimestampMs) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "attempts", attemptIndex, "detectedTimestampMs"], message: "a detected attempt must use its decoded actual timestamp" });
      }
      detectedAttemptTimestamps.push(attempt.detectedTimestampMs);
    }
  });
  if (observedDecoded !== metadata.decodedFrames) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "decodedFrames"], message: "decodedFrames does not match attempt evidence" });
  }
  if (detectedAttemptTimestamps.length !== metadata.detectedFrames) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "detectedFrames"], message: "detectedFrames does not match attempt evidence" });
  }
  const frameTimestamps = frames.map((frame) => frame.timestampMs);
  if (
    frameTimestamps.length !== detectedAttemptTimestamps.length
    || frameTimestamps.some((timestamp, index) => timestamp !== detectedAttemptTimestamps[index])
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["frames"], message: "returned frames do not exactly match detected attempts" });
  }
  if (metadata.releaseProxyTimestampMs > metadata.durationMs) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata", "releaseProxyTimestampMs"], message: "release proxy lies outside clip duration" });
  }

  frames.forEach((frame, frameIndex) => {
    if (frameIndex > 0 && frame.timestampMs <= frames[frameIndex - 1].timestampMs) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["frames", frameIndex, "timestampMs"], message: "Frame timestamps must be strictly increasing" });
    }
    if (frame.timestampMs > metadata.durationMs) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["frames", frameIndex, "timestampMs"], message: "detected frame lies outside clip duration" });
    }
    const crop = frame.cropRectPx;
    if (crop.x + crop.width > metadata.displayWidth || crop.y + crop.height > metadata.displayHeight) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["frames", frameIndex, "cropRectPx"], message: "Crop lies outside the upright display image" });
    }
    const expectedTransform = [
      crop.width, 0, crop.x,
      0, crop.height, crop.y,
      0, 0, 1,
    ];
    if (frame.modelToSourcePx.some((value, index) => Math.abs(value - expectedTransform[index]) > 1e-6)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["frames", frameIndex, "modelToSourcePx"], message: "Transform does not match the declared crop" });
    }
    if (frameIndex > 0) {
      const stableCrop = frames[0].cropRectPx;
      if (
        crop.x !== stableCrop.x
        || crop.y !== stableCrop.y
        || crop.width !== stableCrop.width
        || crop.height !== stableCrop.height
      ) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["frames", frameIndex, "cropRectPx"], message: "all output frames must use one stable clip ROI" });
      }
    }
  });

  const expectedQualityReasons: z.infer<typeof qualityReasonSchema>[] = [];
  if (metadata.detectedFrames < POSE_V2_ENGINEERING_DEFAULTS.minimumDetectedFrames) {
    expectedQualityReasons.push("too_few_detected_frames");
  }
  const detectionRatio = metadata.attemptedFrames === 0
    ? 0
    : metadata.detectedFrames / metadata.attemptedFrames;
  if (detectionRatio < POSE_V2_ENGINEERING_DEFAULTS.minimumFinalDetectionRatio) {
    expectedQualityReasons.push("low_detection_ratio");
  }
  const hasLowCriticalCoverage = CRITICAL_LANDMARK_INDICES.some((landmarkIndex) => {
    if (frames.length === 0) return true;
    const visibleFrames = frames.filter((frame) => (
      (frame.modelLandmarks[landmarkIndex].visibility ?? 0)
        >= POSE_V2_ENGINEERING_DEFAULTS.minimumCriticalJointVisibility
    )).length;
    return visibleFrames / frames.length
      < POSE_V2_ENGINEERING_DEFAULTS.minimumCriticalJointCoverage;
  });
  if (hasLowCriticalCoverage) expectedQualityReasons.push("low_critical_joint_coverage");

  let detectedBeforeReleaseTimestampMs: number | undefined;
  let detectedAfterReleaseTimestampMs: number | undefined;
  for (const attempt of metadata.attempts) {
    const detectedTimestampMs = attempt.detectedTimestampMs;
    if (detectedTimestampMs === null) continue;
    if (
      detectedTimestampMs <= metadata.releaseProxyTimestampMs
      && (detectedBeforeReleaseTimestampMs === undefined
        || detectedTimestampMs > detectedBeforeReleaseTimestampMs)
    ) {
      detectedBeforeReleaseTimestampMs = detectedTimestampMs;
    }
    if (
      detectedTimestampMs >= metadata.releaseProxyTimestampMs
      && (detectedAfterReleaseTimestampMs === undefined
        || detectedTimestampMs < detectedAfterReleaseTimestampMs)
    ) {
      detectedAfterReleaseTimestampMs = detectedTimestampMs;
    }
  }
  if (
    detectedBeforeReleaseTimestampMs === undefined
    || detectedAfterReleaseTimestampMs === undefined
    || detectedAfterReleaseTimestampMs - detectedBeforeReleaseTimestampMs
      > POSE_V2_ENGINEERING_DEFAULTS.maximumReleaseProxyDetectionGapMs
  ) {
    expectedQualityReasons.push("critical_phase_gap");
  }

  const reasonsMatch = sequence.quality.reasons.length === expectedQualityReasons.length
    && sequence.quality.reasons.every((reason, index) => reason === expectedQualityReasons[index]);
  if (!reasonsMatch) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["quality", "reasons"], message: "quality reasons do not match exact cropped-output evidence" });
  }
  if (sequence.quality.passed !== (expectedQualityReasons.length === 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["quality", "passed"], message: "quality passed flag disagrees with cropped-output evidence" });
  }
});

const publicFrameSchema = z.object({
  timestampMs: nonnegativeInteger,
  sourceLandmarks: z.array(landmarkSchema).length(33),
  cropRectPx: cropRectSchema,
  modelToSourcePx: z.tuple([
    finiteNumber, finiteNumber, finiteNumber,
    finiteNumber, finiteNumber, finiteNumber,
    finiteNumber, finiteNumber, finiteNumber,
  ]),
}).strict();
const publicLandmarkSequenceSchema = z.object({
  version: z.literal(2),
  view: z.enum(["front", "shooting_side"]),
  shootingHand: z.enum(["left", "right"]),
  takeIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  metadata: metadataSchema,
  frames: z.array(publicFrameSchema),
  transformConvention: z.literal("upright_source_top_left_v1"),
  quality: z.object({
    passed: z.boolean(),
    reasons: z.array(qualityReasonSchema),
  }).strict(),
}).strict().superRefine((sequence, context) => {
  const { metadata, frames } = sequence;
  if (
    metadata.decodedFrames > metadata.attemptedFrames
    || metadata.detectedFrames > metadata.decodedFrames
    || metadata.rejectedFrames !== metadata.attemptedFrames - metadata.detectedFrames
    || metadata.detectedFrames !== frames.length
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata"], message: "public counters are inconsistent" });
  }
  frames.forEach((frame, frameIndex) => {
    if (frameIndex > 0 && frame.timestampMs <= frames[frameIndex - 1].timestampMs) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["frames", frameIndex, "timestampMs"], message: "public timestamps must be strictly increasing" });
    }
    const crop = frame.cropRectPx;
    const expectedTransform = [crop.width, 0, crop.x, 0, crop.height, crop.y, 0, 0, 1];
    if (
      crop.x + crop.width > metadata.displayWidth
      || crop.y + crop.height > metadata.displayHeight
      || frame.modelToSourcePx.some((value, index) => Math.abs(value - expectedTransform[index]) > 1e-6)
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["frames", frameIndex], message: "public crop transform is inconsistent" });
    }
    const sourcePixelToleranceX = 1 / metadata.displayWidth;
    const sourcePixelToleranceY = 1 / metadata.displayHeight;
    frame.sourceLandmarks.forEach((landmark, landmarkIndex) => {
      if (
        landmark.x < -sourcePixelToleranceX
        || landmark.x > 1 + sourcePixelToleranceX
        || landmark.y < -sourcePixelToleranceY
        || landmark.y > 1 + sourcePixelToleranceY
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["frames", frameIndex, "sourceLandmarks", landmarkIndex],
          message: "restored source point lies outside the upright image by more than one source pixel",
        });
      }
    });
  });
  if (sequence.quality.passed !== (sequence.quality.reasons.length === 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["quality"], message: "public quality flag and reasons disagree" });
  }
});

/** Strict native boundary: validates crop-relative raw output and restores x/y exactly once. */
export function parseNativeLandmarkSequenceV2(value: unknown): LandmarkSequenceV2 {
  const raw = landmarkSequenceSchema.parse(value);
  return {
    version: raw.version,
    view: raw.view,
    shootingHand: raw.shootingHand,
    takeIndex: raw.takeIndex,
    metadata: raw.metadata,
    frames: raw.frames.map((frame) => ({
      timestampMs: frame.timestampMs,
      cropRectPx: frame.cropRectPx,
      modelToSourcePx: frame.modelToSourcePx,
      sourceLandmarks: frame.modelLandmarks.map((landmark) => {
        const restored = restoreSourcePoint(landmark, {
          sourceWidth: raw.metadata.displayWidth,
          sourceHeight: raw.metadata.displayHeight,
          cropRectPx: frame.cropRectPx,
          contentRect: { x: 0, y: 0, width: 1, height: 1 },
          mirrored: false,
          rotationDeg: 0,
        });
        return landmark.visibility === undefined
          ? { ...restored, z: landmark.z }
          : { ...restored, z: landmark.z, visibility: landmark.visibility };
      }),
    })),
    transformConvention: "upright_source_top_left_v1",
    quality: raw.quality,
  };
}

/** Public/local codec: validates an already-restored sequence and never applies restoration again. */
export function parseLandmarkSequenceV2(value: unknown): LandmarkSequenceV2 {
  const publicSequence = publicLandmarkSequenceSchema.parse(value);
  // Reuse the exact evidence/quality validator without invoking coordinate restoration.
  landmarkSequenceSchema.parse({
    ...publicSequence,
    frames: publicSequence.frames.map((frame) => ({
      timestampMs: frame.timestampMs,
      modelLandmarks: frame.sourceLandmarks,
      cropRectPx: frame.cropRectPx,
      modelToSourcePx: frame.modelToSourcePx,
    })),
    transformConvention: "cropped_model_to_upright_source_v1",
  });
  return publicSequence as LandmarkSequenceV2;
}
