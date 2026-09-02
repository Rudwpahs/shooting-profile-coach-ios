import { z } from "zod";

import FormpathPose, {
  type AnalyzeClipRequestV2 as NativeAnalyzeClipRequestV2,
  type FormpathPoseNativeModule,
  type NativeLandmarkSequenceV2,
} from "@/modules/formpath-pose/src/FormpathPoseModule";
import {
  parseLandmarkSequenceV2,
  parseNativeLandmarkSequenceV2,
  POSE_V2_ENGINEERING_DEFAULTS,
} from "@/lib/shooting-profile/landmark-sequence-contract";
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
      | "person_roi_unavailable"
      | "duplicate_request_id"
      | "invalid_native_result"
      | "pose_analysis_failed";
  };

const finiteNumber = z.number().finite();
const nonnegativeInteger = finiteNumber.int().nonnegative();
const requestIdSchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/);

const analyzeClipRequestSchema = z.object({
  uri: z.string().min(1).refine((uri) => uri.startsWith("file://")),
  requestId: requestIdSchema,
  view: z.enum(["front", "shooting_side"]),
  shootingHand: z.enum(["left", "right"]),
  takeIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  profile: z.literal("personal_v2"),
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
  "person_roi_unavailable",
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
        sequence = parseNativeLandmarkSequenceV2(nativeOutput);
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
export { parseLandmarkSequenceV2, parseNativeLandmarkSequenceV2, POSE_V2_ENGINEERING_DEFAULTS };
