import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";
import {
  createPoseClipDetectorV2,
  parseLandmarkSequenceV2,
  type AnalyzeClipRequestV2,
} from "@/lib/pose-detection-v2";
import type {
  FormpathPoseNativeModule,
  NativeLandmarkSequenceV2,
  NativePoseProgressV2,
} from "@/modules/formpath-pose/src/FormpathPoseModule";

vi.mock("@/modules/formpath-pose/src/FormpathPoseModule", () => ({ default: null }));

const projectFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function validRequest(overrides: Partial<AnalyzeClipRequestV2> = {}): AnalyzeClipRequestV2 {
  return {
    uri: "file:///private/var/mobile/clip.mov",
    requestId: "request-1234",
    view: "front",
    shootingHand: "right",
    takeIndex: 0,
    ...overrides,
  };
}

function validSequence(): NativeLandmarkSequenceV2 {
  const sourceLandmarks = Array.from({ length: 33 }, (_, index) => ({
    x: 0.25 + index / 100,
    y: 0.2 + index / 200,
    z: -index / 100,
    visibility: 0.9,
  }));
  return {
    version: 2,
    view: "front",
    shootingHand: "right",
    takeIndex: 0,
    metadata: {
      durationMs: 1_000,
      displayWidth: 1_920,
      displayHeight: 1_080,
      nominalFrameRate: 60,
      frameRateMode: "unknown",
      attemptedFrames: 4,
      decodedFrames: 2,
      detectedFrames: 2,
      rejectedFrames: 2,
    },
    frames: [100, 133].map((timestampMs) => ({
      timestampMs,
      sourceLandmarks: sourceLandmarks.map((point) => ({ ...point })),
      cropRectPx: { x: 0, y: 0, width: 1_920, height: 1_080 },
      modelToSourcePx: [1_920, 0, 0, 0, 1_080, 0, 0, 0, 1],
    })),
    transformConvention: "upright_source_top_left_v1",
    quality: {
      passed: false,
      reasons: ["too_few_detected_frames", "low_detection_ratio"],
    },
  };
}

function sequenceWithQuality(
  detectedFrames: number,
  attemptedFrames: number,
  reasons: NativeLandmarkSequenceV2["quality"]["reasons"],
): NativeLandmarkSequenceV2 {
  const sequence = structuredClone(validSequence());
  const template = sequence.frames[0];
  sequence.frames = Array.from({ length: detectedFrames }, (_, index) => ({
    ...structuredClone(template),
    timestampMs: 100 + index * 33,
  }));
  sequence.metadata = {
    ...sequence.metadata,
    attemptedFrames,
    decodedFrames: detectedFrames,
    detectedFrames,
    rejectedFrames: attemptedFrames - detectedFrames,
  };
  sequence.quality = { passed: reasons.length === 0, reasons };
  return sequence;
}

function fakeNativeModule(
  analyze: (
    request: AnalyzeClipRequestV2,
    emit: (progress: NativePoseProgressV2) => void,
  ) => Promise<NativeLandmarkSequenceV2>,
) {
  const calls: string[] = [];
  let listener: ((progress: NativePoseProgressV2) => void) | undefined;
  const nativeModule: FormpathPoseNativeModule = {
    analyzeVideoAsync: vi.fn(),
    analyzeClipAsync: async (request) => {
      calls.push("analyze");
      return analyze(request, (progress) => listener?.(progress));
    },
    cancelAnalysisAsync: vi.fn(async () => undefined),
    addListener: (eventName, nextListener) => {
      expect(eventName).toBe("onPoseAnalysisProgress");
      calls.push("subscribe");
      listener = nextListener;
      return {
        remove: () => {
          calls.push("remove");
          listener = undefined;
        },
      };
    },
  };
  return { calls, nativeModule };
}

describe("native detector V2 packaging and Swift contract", () => {
  it("declares the podspec and resolves the CocoaPods model bundle without Bundle.module", () => {
    const config = JSON.parse(projectFile("modules/formpath-pose/expo-module.config.json"));
    expect(config.apple.podspecPath).toBe("FormpathPose.podspec");

    const podspec = projectFile("modules/formpath-pose/FormpathPose.podspec");
    expect(podspec).toMatch(/s\.resource_bundles\s*=\s*\{\s*'FormpathPose'/);
    expect(podspec).toMatch(/s\.dependency\s+'MediaPipeTasksVision',\s*'[^']+'/);

    const resources = projectFile("modules/formpath-pose/ios/FormpathPoseResources.swift");
    expect(resources).toContain("Bundle(for: FormpathPoseModule.self)");
    expect(resources).toContain('forResource: "FormpathPose"');
    expect(resources).toContain('forResource: "pose_landmarker_full"');
    expect(resources).not.toContain("Bundle.module");
  });

  it("uses a bounded 15 fps coarse and at-most-30 fps dense policy", () => {
    const policy = projectFile("modules/formpath-pose/ios/PoseSamplingPolicy.swift");
    expect(policy).toContain("coarseFramesPerSecond = 15.0");
    expect(policy).toContain("denseFramesPerSecond = 30.0");
    expect(policy).toContain("maximumDenseWindowSeconds");
    expect(policy).toContain("wristElbowMotion");
  });

  it("keeps V1 while adding scoped progress, cancellation, actual times, and exact counters", () => {
    const module = projectFile("modules/formpath-pose/ios/FormpathPoseModule.swift");
    expect(module).toContain('AsyncFunction("analyzeVideoAsync")');
    expect(module).toContain('AsyncFunction("analyzeClipAsync")');
    expect(module).toContain('AsyncFunction("cancelAnalysisAsync")');
    expect(module).toContain('Events("onPoseAnalysisProgress")');
    expect(module).toMatch(/copyCGImage\(at:\s*requestedTime,\s*actualTime:\s*&actualTime\)/);
    expect(module).toMatch(/"rejectedFrames":\s*counters\.attemptedFrames\s*-\s*counters\.detectedFrames/);
    expect(module).toContain("analysis_cancelled");
    for (const stage of ["metadata", "coarse_pose", "dense_pose", "quality", "complete"]) {
      expect(module).toContain(`\"${stage}\"`);
    }
    expect(module).not.toMatch(/(?:print|NSLog|os_log)\s*\(/);
  });

  it("converts MediaPipe NSNumber visibility and retains bounded pre-begin cancellation tombstones", () => {
    const module = projectFile("modules/formpath-pose/ios/FormpathPoseModule.swift");
    expect(module.match(/point\.visibility\?\.doubleValue\s*\?\?\s*1\.0/g)).toHaveLength(2);
    expect(module).toContain("enum PoseAnalysisBeginResult");
    expect(module).toContain("case started");
    expect(module).toContain("case duplicate");
    expect(module).toContain("case cancelled");
    expect(module).toContain("preBeginCancellationTombstones");
    expect(module).toContain("maximumCancellationTombstones");
    expect(module).toMatch(/removeFirst\(.*overflow/);
    expect(module).toMatch(/case \.cancelled:[\s\S]*bridgeException\("analysis_cancelled"\)/);
  });

  it("keeps cancel -> begin -> begin cancelled until deterministic FIFO eviction", () => {
    const module = projectFile("modules/formpath-pose/ios/FormpathPoseModule.swift");
    const actorStart = module.indexOf("private actor PoseAnalysisCancellationRegistry");
    const actorEnd = module.indexOf("private struct ClipMetadata");
    const actor = module.slice(actorStart, actorEnd);

    expect(actor).toMatch(/if preBeginCancellationTombstones\.contains\(requestId\)\s*\{\s*return \.cancelled\s*\}/);
    expect(actor).not.toContain("preBeginCancellationTombstones.remove(requestId)");
    expect(actor).not.toContain("preBeginCancellationOrder.remove(at:");
    expect(actor).toContain("preBeginCancellationOrder.removeFirst(overflow)");
  });
});

describe("parseLandmarkSequenceV2", () => {
  it("accepts a URI-free, exact-counter, timestamp-ordered local sequence", () => {
    const parsed = parseLandmarkSequenceV2(validSequence());
    expect(parsed.metadata.rejectedFrames).toBe(2);
    expect(parsed.frames).toHaveLength(2);
    expect(parsed.quality).toEqual({
      passed: false,
      reasons: ["too_few_detected_frames", "low_detection_ratio"],
    });
    expect(JSON.stringify(parsed)).not.toContain("file://");
  });

  it.each([
    ["too-few threshold only", sequenceWithQuality(7, 7, ["too_few_detected_frames"])],
    ["low-ratio threshold only", sequenceWithQuality(8, 14, ["low_detection_ratio"])],
    ["exact 0.6 ratio boundary", sequenceWithQuality(9, 15, [])],
    ["both thresholds clear", sequenceWithQuality(8, 8, [])],
  ])("accepts recomputed quality at the %s", (_name, sequence) => {
    expect(parseLandmarkSequenceV2(sequence).quality).toEqual(sequence.quality);
  });

  it.each([
    ["missing reason", ["too_few_detected_frames"]],
    ["extra duplicate reason", ["too_few_detected_frames", "low_detection_ratio", "low_detection_ratio"]],
    ["out-of-order reasons", ["low_detection_ratio", "too_few_detected_frames"]],
    ["duplicate first reason", ["too_few_detected_frames", "too_few_detected_frames", "low_detection_ratio"]],
  ] as const)("rejects %s instead of trusting native quality", (_name, reasons) => {
    const sequence = validSequence();
    sequence.quality = {
      passed: false,
      reasons: [...reasons] as NativeLandmarkSequenceV2["quality"]["reasons"],
    };
    expect(() => parseLandmarkSequenceV2(sequence)).toThrow();
  });

  it("rejects a passed flag that disagrees with recomputed quality", () => {
    const sequence = validSequence();
    sequence.quality.passed = true;
    expect(() => parseLandmarkSequenceV2(sequence)).toThrow();
  });

  it.each([
    ["unknown top-level key", (value: any) => { value.uri = "file:///secret.mov"; }],
    ["unknown nested key", (value: any) => { value.frames[0].sourceLandmarks[0].reconstructedZ = 42; }],
    ["invalid view literal", (value: any) => { value.view = "side"; }],
    ["invalid quality literal", (value: any) => { value.quality.reasons = ["metric_depth_uncertain"]; }],
    ["non-finite metadata", (value: any) => { value.metadata.nominalFrameRate = Number.POSITIVE_INFINITY; }],
    ["wrong landmark count", (value: any) => { value.frames[0].sourceLandmarks.pop(); }],
    ["non-finite landmark", (value: any) => { value.frames[0].sourceLandmarks[0].z = Number.NaN; }],
    ["inconsistent detected counter", (value: any) => { value.metadata.detectedFrames = 1; }],
    ["decoded counter above attempted", (value: any) => { value.metadata.decodedFrames = 5; }],
    ["wrong rejected counter", (value: any) => { value.metadata.rejectedFrames = 0; }],
    ["duplicate timestamp", (value: any) => { value.frames[1].timestampMs = value.frames[0].timestampMs; }],
    ["nonmonotonic timestamp", (value: any) => { value.frames[1].timestampMs = value.frames[0].timestampMs - 1; }],
    ["crop outside display", (value: any) => { value.frames[0].cropRectPx.width = 2_000; }],
    ["malformed transform length", (value: any) => { value.frames[0].modelToSourcePx.pop(); }],
    ["malformed transform value", (value: any) => { value.frames[0].modelToSourcePx[0] = Number.NaN; }],
  ])("rejects %s", (_name, mutate) => {
    const value: any = structuredClone(validSequence());
    mutate(value);
    expect(() => parseLandmarkSequenceV2(value)).toThrow();
  });
});

describe("detectPoseClipV2", () => {
  it("subscribes before analysis, filters progress by requestId, and removes the listener", async () => {
    const matching: NativePoseProgressV2 = {
      requestId: "request-1234",
      stage: "coarse_pose",
      completed: 1,
      total: 3,
    };
    const { calls, nativeModule } = fakeNativeModule(async (_request, emit) => {
      emit({ ...matching, requestId: "different-request" });
      emit(matching);
      return validSequence();
    });
    const progress: NativePoseProgressV2[] = [];

    const result = await createPoseClipDetectorV2(nativeModule)(validRequest(), (event) => progress.push(event));

    expect(result.status).toBe("complete");
    expect(progress).toEqual([matching]);
    expect(calls).toEqual(["subscribe", "analyze", "remove"]);
  });

  it("always removes the listener and normalizes cancellation without leaking native details", async () => {
    const { calls, nativeModule } = fakeNativeModule(async () => {
      throw { code: "analysis_cancelled", message: "file:///private/secret.mov" };
    });

    const result = await createPoseClipDetectorV2(nativeModule)(validRequest());

    expect(result).toEqual({ status: "cancelled", reason: "analysis_cancelled" });
    expect(JSON.stringify(result)).not.toContain("secret.mov");
    expect(calls).toEqual(["subscribe", "analyze", "remove"]);
  });

  it("fails closed on a malformed native sequence and never returns the request URI", async () => {
    const { nativeModule } = fakeNativeModule(async () => ({
      ...validSequence(),
      transformConvention: "reconstructed_metric_3d" as "upright_source_top_left_v1",
    }));

    const result = await createPoseClipDetectorV2(nativeModule)(validRequest());

    expect(result).toEqual({ status: "error", reason: "invalid_native_result" });
    expect(JSON.stringify(result)).not.toContain("file:///private");
  });

  it("strictly rejects a nonlocal or unknown-key request before invoking native code", async () => {
    const { calls, nativeModule } = fakeNativeModule(async () => validSequence());
    const detector = createPoseClipDetectorV2(nativeModule);

    expect(await detector({ ...validRequest(), uri: "https://example.com/clip.mov" })).toEqual({
      status: "error",
      reason: "invalid_request",
    });
    expect(await detector({ ...validRequest(), extra: true } as AnalyzeClipRequestV2)).toEqual({
      status: "error",
      reason: "invalid_request",
    });
    expect(calls).toEqual([]);
  });
});
