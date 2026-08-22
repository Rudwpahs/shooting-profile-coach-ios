import { z } from "zod";

import FormpathPose, {
  type AnalyzeClipRequestV2 as NativeAnalyzeClipRequestV2,
  type FormpathPoseNativeModule,
  type NativeLandmarkSequenceV2,
} from "@/modules/formpath-pose/src/FormpathPoseModule";
import type { LandmarkSequenceV2 } from "@/lib/shooting-profile/types";

export type AnalyzeClipRequestV2 = NativeAnalyzeClipRequestV2;
export type PoseProgressV2 = {
  requestId: string;
  stage: "metadata" | "coarse_pose" | "dense_pose" | "quality" | "complete";
  completed: number;
  total: number;
};

export type PoseClipDetectionV2Result =
  | { status: "complete"; sequence: LandmarkSequenceV2 }
  | { status: "cancelled"; reason: "analysis_cancelled" }
  | { status: "native_build_required"; reason: "native_build_required" }
  | {
    status: "error";
    reason:
      | "invalid_request"
      | "invalid_video"
      | "model_missing"
      | "duplicate_request_id"
      | "invalid_native_result"
      | "pose_analysis_failed";
  };

const finiteNumber = z.number().finite();
const nonnegativeInteger = finiteNumber.int().nonnegative();
const positiveInteger = finiteNumber.int().positive();
const requestIdSchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/);

const analyzeClipRequestSchema = z.object({
  uri: z.string().min(1).refine((uri) => uri.startsWith("file://")),
  requestId: requestIdSchema,
  view: z.enum(["front", "shooting_side"]),
  shootingHand: z.enum(["left", "right"]),
  takeIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
}).strict();

const progressSchema = z.object({
  requestId: requestIdSchema,
  stage: z.enum(["metadata", "coarse_pose", "dense_pose", "quality", "complete"]),
  completed: nonnegativeInteger,
  total: nonnegativeInteger,
}).strict().superRefine((progress, context) => {
  if (progress.completed > progress.total) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["completed"],
      message: "Progress completed count cannot exceed total",
    });
  }
});

const landmarkSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  // This remains raw MediaPipe image-relative z for local coordinate restoration/quality only.
  z: finiteNumber,
  visibility: finiteNumber.min(0).max(1).optional(),
}).strict();

const cropRectSchema = z.object({
  x: finiteNumber.nonnegative(),
  y: finiteNumber.nonnegative(),
  width: finiteNumber.positive(),
  height: finiteNumber.positive(),
}).strict();

const frameSchema = z.object({
  timestampMs: nonnegativeInteger,
  sourceLandmarks: z.array(landmarkSchema).length(33),
  cropRectPx: cropRectSchema,
  modelToSourcePx: z.tuple([
    finiteNumber, finiteNumber, finiteNumber,
    finiteNumber, finiteNumber, finiteNumber,
    finiteNumber, finiteNumber, finiteNumber,
  ]),
}).strict();

const metadataSchema = z.object({
  durationMs: positiveInteger,
  displayWidth: positiveInteger,
  displayHeight: positiveInteger,
  nominalFrameRate: finiteNumber.nonnegative(),
  frameRateMode: z.enum(["constant", "variable", "unknown"]),
  attemptedFrames: nonnegativeInteger,
  decodedFrames: nonnegativeInteger,
  detectedFrames: nonnegativeInteger,
  rejectedFrames: nonnegativeInteger,
}).strict();

const qualityReasonSchema = z.enum(["too_few_detected_frames", "low_detection_ratio"]);
const landmarkSequenceSchema = z.object({
  version: z.literal(2),
  view: z.enum(["front", "shooting_side"]),
  shootingHand: z.enum(["left", "right"]),
  takeIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  metadata: metadataSchema,
  frames: z.array(frameSchema),
  transformConvention: z.literal("upright_source_top_left_v1"),
  quality: z.object({
    passed: z.boolean(),
    reasons: z.array(qualityReasonSchema),
  }).strict(),
}).strict().superRefine((sequence, context) => {
  const { metadata, frames } = sequence;
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
  const expectedQualityReasons: z.infer<typeof qualityReasonSchema>[] = [];
  if (metadata.detectedFrames < 8) {
    expectedQualityReasons.push("too_few_detected_frames");
  }
  const detectionRatio = metadata.attemptedFrames === 0
    ? 0
    : metadata.detectedFrames / metadata.attemptedFrames;
  if (detectionRatio < 0.6) {
    expectedQualityReasons.push("low_detection_ratio");
  }
  const reasonsMatch = sequence.quality.reasons.length === expectedQualityReasons.length
    && sequence.quality.reasons.every((reason, index) => reason === expectedQualityReasons[index]);
  if (!reasonsMatch) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["quality", "reasons"], message: "quality reasons do not match exact counter-derived reasons" });
  }
  if (sequence.quality.passed !== (expectedQualityReasons.length === 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["quality", "passed"], message: "quality passed flag disagrees with counter-derived quality" });
  }

  frames.forEach((frame, frameIndex) => {
    if (frameIndex > 0 && frame.timestampMs <= frames[frameIndex - 1].timestampMs) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["frames", frameIndex, "timestampMs"], message: "Frame timestamps must be strictly increasing" });
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
  });
});

export function parseLandmarkSequenceV2(value: unknown): LandmarkSequenceV2 {
  return landmarkSequenceSchema.parse(value) as LandmarkSequenceV2;
}

function requestMatchesSequence(
  request: AnalyzeClipRequestV2,
  sequence: LandmarkSequenceV2,
): boolean {
  return request.view === sequence.view
    && request.shootingHand === sequence.shootingHand
    && request.takeIndex === sequence.takeIndex;
}

function hasV2Contract(module: FormpathPoseNativeModule | null): module is FormpathPoseNativeModule {
  return module !== null
    && typeof module.analyzeClipAsync === "function"
    && typeof module.cancelAnalysisAsync === "function"
    && typeof module.addListener === "function";
}

const stableNativeErrors = [
  "analysis_cancelled",
  "invalid_request",
  "invalid_video",
  "model_missing",
  "duplicate_request_id",
] as const;

function stableNativeError(error: unknown): (typeof stableNativeErrors)[number] | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const candidate = error as { code?: unknown; message?: unknown };
  const fields = [candidate.code, candidate.message].filter((value): value is string => typeof value === "string");
  return stableNativeErrors.find((code) => fields.some((field) => field === code || field.includes(code)));
}

export function createPoseClipDetectorV2(nativeModule: FormpathPoseNativeModule | null) {
  return async function detectWithModule(
    requestValue: AnalyzeClipRequestV2,
    onProgress?: (progress: PoseProgressV2) => void,
  ): Promise<PoseClipDetectionV2Result> {
    const parsedRequest = analyzeClipRequestSchema.safeParse(requestValue);
    if (!parsedRequest.success) {
      return { status: "error", reason: "invalid_request" };
    }
    const request = parsedRequest.data;
    if (!hasV2Contract(nativeModule)) {
      return { status: "native_build_required", reason: "native_build_required" };
    }

    let subscription: { remove(): void } | undefined;
    try {
      subscription = nativeModule.addListener("onPoseAnalysisProgress", (event: unknown) => {
        if (
          typeof event !== "object"
          || event === null
          || (event as { requestId?: unknown }).requestId !== request.requestId
        ) {
          return;
        }
        const parsedProgress = progressSchema.safeParse(event);
        if (parsedProgress.success) {
          onProgress?.(parsedProgress.data);
        }
      });

      const nativeOutput: unknown = await nativeModule.analyzeClipAsync(request);
      let sequence: LandmarkSequenceV2;
      try {
        sequence = parseLandmarkSequenceV2(nativeOutput);
      } catch {
        return { status: "error", reason: "invalid_native_result" };
      }
      if (!requestMatchesSequence(request, sequence)) {
        return { status: "error", reason: "invalid_native_result" };
      }
      return { status: "complete", sequence };
    } catch (error) {
      const code = stableNativeError(error);
      if (code === "analysis_cancelled") {
        return { status: "cancelled", reason: "analysis_cancelled" };
      }
      if (code) {
        return { status: "error", reason: code };
      }
      return { status: "error", reason: "pose_analysis_failed" };
    } finally {
      try {
        subscription?.remove();
      } catch {
        // Listener cleanup failures are deliberately not logged with request/media context.
      }
    }
  };
}

export const detectPoseClipV2 = createPoseClipDetectorV2(FormpathPose);

export async function cancelPoseClipV2(requestId: string): Promise<boolean> {
  if (!requestIdSchema.safeParse(requestId).success || !hasV2Contract(FormpathPose)) {
    return false;
  }
  try {
    await FormpathPose.cancelAnalysisAsync(requestId);
    return true;
  } catch {
    return false;
  }
}

// Native output stays local. In particular, image-relative z is not forwarded to
// Task 4 reconstruction/cloud persistence by this adapter.
export type { NativeLandmarkSequenceV2 };
