import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";
import {
  createPoseClipDetectorV2,
  parseLandmarkSequenceV2 as parsePublicLandmarkSequenceV2,
  parseNativeLandmarkSequenceV2 as parseLandmarkSequenceV2,
  type AnalyzeClipRequestV2,
} from "@/lib/pose-detection-v2";
import type {
  FormpathPoseNativeModule,
  NativeLandmarkSequenceV2,
  NativePoseProgressV2,
} from "@/modules/formpath-pose/src/FormpathPoseModule";

vi.mock("@/modules/formpath-pose/src/FormpathPoseModule", () => ({ default: null }));

const projectFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const CRITICAL_LANDMARK_INDICES = [11, 12, 15, 16, 23, 24, 25, 26, 27, 28] as const;

function validRequest(overrides: Partial<AnalyzeClipRequestV2> = {}): AnalyzeClipRequestV2 {
  return {
    uri: "file:///private/var/mobile/clip.mov",
    requestId: "request-1234",
    view: "front",
    shootingHand: "right",
    takeIndex: 0,
    profile: "personal_v2",
    ...overrides,
  };
}

function modelLandmarks(visibility = 0.95) {
  return Array.from({ length: 33 }, (_, index) => ({
    x: index === 0 ? 0.5 : 0.2 + index / 100,
    y: index === 0 ? 0.25 : 0.15 + index / 200,
    z: index === 0 ? 0 : -index / 100,
    visibility,
  }));
}

function validSequence(): NativeLandmarkSequenceV2 {
  const detectedTimestamps = [100, 200, 300, 400, 500, 600, 700, 800];
  const attempts = Array.from({ length: 10 }, (_, index) => {
    const timestampMs = index * 100;
    const detected = detectedTimestamps.includes(timestampMs);
    return {
      requestedTimestampMs: timestampMs,
      decodedTimestampMs: timestampMs,
      detectedTimestampMs: detected ? timestampMs : null,
    };
  });
  return {
    version: 2,
    view: "front",
    shootingHand: "right",
    takeIndex: 0,
    metadata: {
      durationMs: 1_000,
      displayWidth: 1_000,
      displayHeight: 800,
      nominalFrameRate: 60,
      frameRateMode: "unknown",
      locatorAttemptedFrames: 15,
      locatorDecodedFrames: 14,
      locatorDetectedFrames: 12,
      attemptedFrames: 10,
      decodedFrames: 10,
      detectedFrames: 8,
      rejectedFrames: 2,
      releaseProxyTimestampMs: 450,
      attempts,
    },
    frames: detectedTimestamps.map((timestampMs) => ({
      timestampMs,
      modelLandmarks: modelLandmarks(),
      cropRectPx: { x: 100, y: 80, width: 400, height: 640 },
      modelToSourcePx: [400, 0, 100, 0, 640, 80, 0, 0, 1],
    })),
    transformConvention: "cropped_model_to_upright_source_v1",
    quality: { passed: true, reasons: [] },
  };
}

function sequenceWithCounterQuality(
  detectedFrames: number,
  attemptedFrames: number,
  reasons: NativeLandmarkSequenceV2["quality"]["reasons"],
): NativeLandmarkSequenceV2 {
  const sequence = structuredClone(validSequence());
  const detectedIndices = new Set(Array.from({ length: detectedFrames }, (_, index) => index));
  sequence.metadata.attempts = Array.from({ length: attemptedFrames }, (_, index) => ({
    requestedTimestampMs: index * 33,
    decodedTimestampMs: index * 33,
    detectedTimestampMs: detectedIndices.has(index) ? index * 33 : null,
  }));
  sequence.frames = Array.from({ length: detectedFrames }, (_, index) => ({
    timestampMs: index * 33,
    modelLandmarks: modelLandmarks(),
    cropRectPx: { x: 100, y: 80, width: 400, height: 640 },
    modelToSourcePx: [400, 0, 100, 0, 640, 80, 0, 0, 1],
  }));
  sequence.metadata = {
    ...sequence.metadata,
    durationMs: Math.max(1_000, attemptedFrames * 33 + 1),
    attemptedFrames,
    decodedFrames: attemptedFrames,
    detectedFrames,
    rejectedFrames: attemptedFrames - detectedFrames,
    releaseProxyTimestampMs: Math.min(
      Math.max(0, Math.floor(detectedFrames / 2) * 33),
      (attemptedFrames - 1) * 33,
    ),
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
  const requests: AnalyzeClipRequestV2[] = [];
  let listener: ((progress: NativePoseProgressV2) => void) | undefined;
  const nativeModule: FormpathPoseNativeModule = {
    analyzeVideoAsync: vi.fn(),
    analyzeClipAsync: async (request) => {
      calls.push("analyze");
      requests.push(request);
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
  return { calls, nativeModule, requests };
}

describe("native detector V2 packaging and two-pass Swift contract", () => {
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

  it("runs a full-frame locator, derives one padded integral ROI, then crops every output frame", () => {
    const module = projectFile("modules/formpath-pose/ios/FormpathPoseModule.swift");
    expect(module).toContain("minimumLocatorDetectedFrames");
    expect(module).toContain("minimumLocatorLandmarkVisibility");
    expect(module).toContain("personROIPaddingProportion");
    expect(module).toContain("deriveStablePersonROI");
    expect(module).toContain("clampedToSourceBounds");
    expect(module).toContain(".integral");
    expect(module).toContain("let locatorLandmarker = try makeLandmarker()");
    expect(module).toContain("let outputLandmarker = try makeLandmarker()");
    expect(module).toMatch(/cropping\(to:\s*stableROI\)/);
    expect(module).toContain("detectCroppedOutputFrames");
    expect(module).toMatch(/"frames":\s*output\.frames\.map/);
    expect(module).not.toMatch(/"frames":\s*locator\.frames\.map/);
  });

  it("uses stable single-person body evidence so one extreme point cannot expand the ROI", () => {
    const module = projectFile("modules/formpath-pose/ios/FormpathPoseModule.swift");
    expect(module).toContain("LocatorFrameBodyEvidence");
    expect(module).toContain("locatorFrameBodyEvidence");
    expect(module).toContain("stableCenter");
    expect(module).toContain("stableBodyScale");
    expect(module).toContain("maximumLocatorPointDistanceBodyScales");
    expect(module).toMatch(/pointDistanceBodyScales[\s\S]*maximumLocatorPointDistanceBodyScales/);
    expect(module).toContain("inlierBodyBoxes");
  });

  it("gates locator center/scale consistency and rejects a two-person switch without unioning it", () => {
    const module = projectFile("modules/formpath-pose/ios/FormpathPoseModule.swift");
    for (const namedGate of [
      "maximumLocatorCenterDeviationBodyScales",
      "minimumLocatorBodyScaleRatio",
      "maximumLocatorBodyScaleRatio",
      "minimumLocatorInlierRatio",
    ]) {
      expect(module).toContain(namedGate);
    }
    expect(module).toMatch(/centerDeviationBodyScales[\s\S]*maximumLocatorCenterDeviationBodyScales/);
    expect(module).toMatch(/inlierRatio[\s\S]*minimumLocatorInlierRatio/);
    expect(module).toMatch(/for bodyBox in inlierBodyBoxes/);
  });

  it("uses locator motion only for dense timestamps and treats dense progress as the complete cropped pass", () => {
    const module = projectFile("modules/formpath-pose/ios/FormpathPoseModule.swift");
    expect(module).toMatch(/denseTimestamps\([\s\S]*coarseMotion:\s*locator\.motionSamples/);
    expect(module).toMatch(/requestedTimestamps:\s*mergedTimestamps[\s\S]*progressStage:\s*"dense_pose"/);
    expect(module).not.toMatch(/excludedActualTimestampMs:\s*Set\(locator\.frames/);
  });

  it("checks cancellation at the output decode, crop, and model boundaries without completing that iteration", () => {
    const module = projectFile("modules/formpath-pose/ios/FormpathPoseModule.swift");
    const locatorStart = module.indexOf("private func detectFullFrameLocatorFrames");
    const outputStart = module.indexOf("private func detectCroppedOutputFrames");
    const outputEnd = module.indexOf("private func timestampMilliseconds", outputStart);
    const locatorPass = module.slice(locatorStart, outputStart);
    const outputPass = module.slice(outputStart, outputEnd);
    expect(locatorStart).toBeGreaterThan(-1);
    expect(outputStart).toBeGreaterThan(-1);
    expect(outputPass.match(/ensureNotCancelled\(requestId\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(outputPass).toContain("// Cancellation boundary: decode");
    expect(outputPass).toContain("// Cancellation boundary: crop");
    expect(outputPass).toContain("// Cancellation boundary: detect");
    expect(locatorPass).not.toContain("defer");
    expect(outputPass).not.toContain("defer");
    expect(outputPass.lastIndexOf("// Cancellation boundary: detect"))
      .toBeLessThan(outputPass.lastIndexOf("sendProgress"));
  });

  it("keeps V1 missing visibility unchanged but treats missing V2 visibility as unavailable", () => {
    const module = projectFile("modules/formpath-pose/ios/FormpathPoseModule.swift");
    expect(module.match(/visibility\?\.doubleValue \?\? 1\.0/g)).toHaveLength(1);
    expect(module.match(/visibility\?\.doubleValue \?\? 0\.0/g)).toHaveLength(2);
  });

  it("brackets the actual locator release proxy with actual detected timestamps in Swift", () => {
    const module = projectFile("modules/formpath-pose/ios/FormpathPoseModule.swift");
    const qualityStart = module.indexOf("private func qualityReasons");
    const quality = module.slice(qualityStart);
    expect(module).toContain("timestampEvidenceIsValid");
    expect(quality).toContain("detectedTimestampMs");
    expect(quality).not.toContain("attempt.requestedTimestampMs");
  });

  it("keeps V1 unchanged while requiring the exact personal V2 request keys in Swift", () => {
    const module = projectFile("modules/formpath-pose/ios/FormpathPoseModule.swift");
    expect(module).toContain('AsyncFunction("analyzeVideoAsync")');
    expect(module).toContain('AsyncFunction("analyzeClipAsync")');
    expect(module).toContain('"profile"');
    expect(module).toContain('profile == "personal_v2"');
    expect(module).toMatch(/Set\(request\.keys\)\s*==\s*Self\.analyzeClipRequestKeys/);
    for (const key of ["uri", "requestId", "view", "shootingHand", "takeIndex", "profile"]) {
      expect(module).toContain(`"${key}"`);
    }
  });

  it("returns crop-relative model landmarks under the explicit raw transform literal without logging media", () => {
    const module = projectFile("modules/formpath-pose/ios/FormpathPoseModule.swift");
    expect(module).toContain('"modelLandmarks": landmarks');
    expect(module).not.toContain('"sourceLandmarks": landmarks');
    expect(module).toContain('"cropped_model_to_upright_source_v1"');
    expect(module).not.toContain("worldLandmarks");
    expect(module).not.toMatch(/(?:print|NSLog|os_log)\s*\(/);
  });

  it("declares a clean Expo module-core relationship using the existing SDK 54 resolution", () => {
    const localPackage = JSON.parse(projectFile("modules/formpath-pose/package.json"));
    const rootPackage = JSON.parse(projectFile("package.json"));
    const lockfile = projectFile("pnpm-lock.yaml");
    const tsconfig = JSON.parse(projectFile("tsconfig.json"));
    expect(localPackage.peerDependencies).toEqual({ "expo-modules-core": "~3.0.29" });
    expect(rootPackage.dependencies["expo-modules-core"]).toBe("~3.0.29");
    expect(lockfile).toMatch(/expo-modules-core:\n\s+specifier: ~3\.0\.29\n\s+version: 3\.0\.29\(/);
    expect(lockfile).toContain("expo-modules-core@3.0.29:");
    expect(tsconfig.compilerOptions.skipLibCheck).not.toBe(true);
  });

  it("requires all locator, release-proxy, and final-attempt evidence in the public type", () => {
    const types = projectFile("lib/shooting-profile/types.ts");
    for (const field of [
      "locatorAttemptedFrames",
      "locatorDecodedFrames",
      "locatorDetectedFrames",
      "releaseProxyTimestampMs",
      "attempts",
    ]) {
      expect(types).toMatch(new RegExp(`${field}:`));
      expect(types).not.toMatch(new RegExp(`${field}\\?:`));
    }
  });
});

describe("parseLandmarkSequenceV2 raw-to-public boundary", () => {
  it("restores a non-full crop exactly once and keeps crop metadata auditable", () => {
    const parsed = parseLandmarkSequenceV2(validSequence());
    expect(parsed.frames[0].sourceLandmarks[0]).toEqual({
      x: 0.3,
      y: 0.3,
      z: 0,
      visibility: 0.95,
    });
    expect(parsed.frames[0].cropRectPx).toEqual({ x: 100, y: 80, width: 400, height: 640 });
    expect(parsed.frames[0].modelToSourcePx).toEqual([400, 0, 100, 0, 640, 80, 0, 0, 1]);
    expect(parsed.transformConvention).toBe("upright_source_top_left_v1");
    expect(JSON.stringify(parsed)).not.toContain("modelLandmarks");
    expect(JSON.stringify(parsed)).not.toContain("file://");
    expect(parsePublicLandmarkSequenceV2(parsed)).toEqual(parsed);
  });

  it("keeps the public codec exact and rejects evidence-less legacy public objects", () => {
    const publicSequence: any = parseLandmarkSequenceV2(validSequence());
    delete publicSequence.metadata.attempts;
    expect(() => parsePublicLandmarkSequenceV2(publicSequence)).toThrow();
  });

  it("preserves exact locator/output evidence while recomputing quality from output only", () => {
    const raw = validSequence();
    raw.metadata.locatorAttemptedFrames = 100;
    raw.metadata.locatorDecodedFrames = 99;
    raw.metadata.locatorDetectedFrames = 50;
    const parsed = parseLandmarkSequenceV2(raw);
    expect(parsed.metadata.locatorAttemptedFrames).toBe(100);
    expect(parsed.metadata.attempts).toEqual(raw.metadata.attempts);
    expect(parsed.quality).toEqual({ passed: true, reasons: [] });
  });

  it.each([
    ["fewer than five locator detections", 8, 8, 4],
    ["less than a 50% locator ratio", 11, 11, 5],
  ])("rejects impossible completed locator evidence: %s", (_name, attempted, decoded, detected) => {
    const raw = validSequence();
    raw.metadata.locatorAttemptedFrames = attempted;
    raw.metadata.locatorDecodedFrames = decoded;
    raw.metadata.locatorDetectedFrames = detected;
    expect(raw.quality).toEqual({ passed: true, reasons: [] });
    expect(() => parseLandmarkSequenceV2(raw)).toThrow();
  });

  it.each([
    ["9/15", sequenceWithCounterQuality(9, 15, ["low_detection_ratio"])],
    ["12/20", sequenceWithCounterQuality(12, 20, ["low_detection_ratio"])],
    ["exact 80%", sequenceWithCounterQuality(12, 15, [])],
  ])("enforces the final-output 80% gate at %s", (_name, sequence) => {
    expect(parseLandmarkSequenceV2(sequence).quality).toEqual(sequence.quality);
  });

  it("fails low critical-joint coverage even when every frame has a pose", () => {
    const sequence = sequenceWithCounterQuality(10, 10, ["low_critical_joint_coverage"]);
    sequence.frames[0].modelLandmarks[11].visibility = 0;
    sequence.frames[1].modelLandmarks[11].visibility = 0;
    expect(parseLandmarkSequenceV2(sequence).quality).toEqual(sequence.quality);
    expect(CRITICAL_LANDMARK_INDICES).toContain(11);
  });

  it("fails a missed-detection interval spanning the locator release proxy despite an 80% global ratio", () => {
    const sequence = sequenceWithCounterQuality(16, 20, ["critical_phase_gap"]);
    const missed = new Set([7, 8, 9, 10]);
    sequence.metadata.attempts = sequence.metadata.attempts.map((attempt, index) => ({
      ...attempt,
      detectedTimestampMs: missed.has(index) ? null : attempt.requestedTimestampMs,
    }));
    sequence.frames = sequence.metadata.attempts
      .filter((attempt) => attempt.detectedTimestampMs !== null)
      .map((attempt) => ({
        timestampMs: attempt.detectedTimestampMs as number,
        modelLandmarks: modelLandmarks(),
        cropRectPx: { x: 100, y: 80, width: 400, height: 640 },
        modelToSourcePx: [400, 0, 100, 0, 640, 80, 0, 0, 1],
      }));
    sequence.metadata.releaseProxyTimestampMs = 8 * 33 + 16;
    expect(parseLandmarkSequenceV2(sequence).quality).toEqual(sequence.quality);
  });

  it("uses actual detected times when dense requested VFR samples hide a large release gap", () => {
    const sequence = structuredClone(validSequence());
    const requested = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270];
    const detectedActual = [0, 40, 80, 120, 160, null, null, 400, 440, 480] as const;
    sequence.metadata.attempts = requested.map((requestedTimestampMs, index) => ({
      requestedTimestampMs,
      decodedTimestampMs: detectedActual[index] ?? requestedTimestampMs,
      detectedTimestampMs: detectedActual[index],
    }));
    sequence.frames = detectedActual
      .filter((timestampMs): timestampMs is number => timestampMs !== null)
      .map((timestampMs) => ({
        timestampMs,
        modelLandmarks: modelLandmarks(),
        cropRectPx: { x: 100, y: 80, width: 400, height: 640 },
        modelToSourcePx: [400, 0, 100, 0, 640, 80, 0, 0, 1],
      }));
    sequence.metadata.attemptedFrames = 10;
    sequence.metadata.decodedFrames = 10;
    sequence.metadata.detectedFrames = 8;
    sequence.metadata.rejectedFrames = 2;
    sequence.metadata.releaseProxyTimestampMs = 220;
    sequence.quality = { passed: false, reasons: ["critical_phase_gap"] };

    expect(parseLandmarkSequenceV2(sequence).quality).toEqual(sequence.quality);
  });

  it.each([
    ["requested timestamp at duration", (value: NativeLandmarkSequenceV2) => {
      value.metadata.attempts[9].requestedTimestampMs = value.metadata.durationMs;
    }],
    ["decoded actual timestamp beyond duration", (value: NativeLandmarkSequenceV2) => {
      value.metadata.attempts[0].decodedTimestampMs = value.metadata.durationMs + 1;
    }],
    ["detected actual timestamp beyond duration", (value: NativeLandmarkSequenceV2) => {
      const outside = value.metadata.durationMs + 1;
      value.metadata.attempts[8].decodedTimestampMs = outside;
      value.metadata.attempts[8].detectedTimestampMs = outside;
      value.frames[7].timestampMs = outside;
    }],
    ["release proxy beyond duration", (value: NativeLandmarkSequenceV2) => {
      value.metadata.releaseProxyTimestampMs = value.metadata.durationMs + 1;
    }],
  ])("rejects %s", (_name, mutate) => {
    const value = structuredClone(validSequence());
    mutate(value);
    expect(() => parseLandmarkSequenceV2(value)).toThrow();
  });

  it("allows one source-pixel restoration tolerance and rejects anything farther outside", () => {
    const atTolerance = parseLandmarkSequenceV2(validSequence());
    atTolerance.frames[0].sourceLandmarks[0].x = -1 / atTolerance.metadata.displayWidth;
    atTolerance.frames[0].sourceLandmarks[0].y = 1 + 1 / atTolerance.metadata.displayHeight;
    expect(parsePublicLandmarkSequenceV2(atTolerance)).toEqual(atTolerance);

    for (const mutate of [
      (value: typeof atTolerance) => { value.frames[0].sourceLandmarks[0].x = -1 / value.metadata.displayWidth - 1e-6; },
      (value: typeof atTolerance) => { value.frames[0].sourceLandmarks[0].x = 1 + 1 / value.metadata.displayWidth + 1e-6; },
      (value: typeof atTolerance) => { value.frames[0].sourceLandmarks[0].y = -1 / value.metadata.displayHeight - 1e-6; },
      (value: typeof atTolerance) => { value.frames[0].sourceLandmarks[0].y = 1 + 1 / value.metadata.displayHeight + 1e-6; },
    ]) {
      const outside = structuredClone(atTolerance);
      mutate(outside);
      expect(() => parsePublicLandmarkSequenceV2(outside)).toThrow();
    }
  });

  it.each([
    ["unknown top-level key", (value: any) => { value.uri = "file:///secret.mov"; }],
    ["unknown raw landmark key", (value: any) => { value.frames[0].modelLandmarks[0].reconstructedZ = 42; }],
    ["old sourceLandmarks field", (value: any) => {
      value.frames[0].sourceLandmarks = value.frames[0].modelLandmarks;
      delete value.frames[0].modelLandmarks;
    }],
    ["public transform at raw boundary", (value: any) => { value.transformConvention = "upright_source_top_left_v1"; }],
    ["nonintegral crop", (value: any) => { value.frames[0].cropRectPx.x = 100.5; }],
    ["negative crop", (value: any) => { value.frames[0].cropRectPx.x = -1; }],
    ["crop outside display", (value: any) => { value.frames[0].cropRectPx.width = 901; }],
    ["matrix inconsistent crop", (value: any) => { value.frames[0].modelToSourcePx[2] = 99; }],
    ["changing per-frame crop", (value: any) => {
      value.frames[1].cropRectPx.x = 101;
      value.frames[1].modelToSourcePx[2] = 101;
    }],
    ["locator decoded above attempted", (value: any) => { value.metadata.locatorDecodedFrames = 16; }],
    ["locator detected above decoded", (value: any) => { value.metadata.locatorDetectedFrames = 15; }],
    ["attempt evidence length mismatch", (value: any) => { value.metadata.attempts.pop(); }],
    ["attempt detected without decode", (value: any) => { value.metadata.attempts[1].decodedTimestampMs = null; }],
    ["attempt/frame mismatch", (value: any) => { value.metadata.attempts[1].detectedTimestampMs = 101; }],
    ["duplicate output timestamp", (value: any) => { value.frames[1].timestampMs = value.frames[0].timestampMs; }],
    ["wrong landmark count", (value: any) => { value.frames[0].modelLandmarks.pop(); }],
    ["non-finite landmark", (value: any) => { value.frames[0].modelLandmarks[0].z = Number.NaN; }],
  ])("rejects %s", (_name, mutate) => {
    const value: any = structuredClone(validSequence());
    mutate(value);
    expect(() => parseLandmarkSequenceV2(value)).toThrow();
  });

  it("rejects a native quality claim that disagrees with recomputed output evidence", () => {
    const sequence = sequenceWithCounterQuality(9, 15, []);
    expect(() => parseLandmarkSequenceV2(sequence)).toThrow();
  });
});

describe("detectPoseClipV2", () => {
  it("subscribes before analysis, forwards the exact profile, filters progress, and removes the listener", async () => {
    const matching: NativePoseProgressV2 = {
      requestId: "request-1234",
      stage: "coarse_pose",
      completed: 1,
      total: 3,
    };
    const { calls, nativeModule, requests } = fakeNativeModule(async (_request, emit) => {
      emit({ ...matching, requestId: "different-request" });
      emit(matching);
      return validSequence();
    });
    const progress: NativePoseProgressV2[] = [];
    const result = await createPoseClipDetectorV2(nativeModule)(validRequest(), (event) => progress.push(event));
    expect(result.status).toBe("complete");
    expect(requests).toEqual([validRequest()]);
    expect(progress).toEqual([matching]);
    expect(calls).toEqual(["subscribe", "analyze", "remove"]);
  });

  it.each([
    ["missing profile", (() => {
      const request: Record<string, unknown> = { ...validRequest() };
      delete request.profile;
      return request;
    })()],
    ["wrong profile", { ...validRequest(), profile: "generic_v2" }],
    ["extra field", { ...validRequest(), extra: true }],
    ["nonlocal URI", { ...validRequest(), uri: "https://example.com/clip.mov" }],
  ])("rejects an exact-request violation: %s", async (_name, request) => {
    const { calls, nativeModule } = fakeNativeModule(async () => validSequence());
    const result = await createPoseClipDetectorV2(nativeModule)(request as AnalyzeClipRequestV2);
    expect(result).toEqual({ status: "error", reason: "invalid_request" });
    expect(calls).toEqual([]);
  });

  it("maps locator failure to one stable recapture-safe result", async () => {
    const { nativeModule } = fakeNativeModule(async () => {
      throw { code: "person_roi_unavailable", message: "file:///private/secret.mov" };
    });
    const result = await createPoseClipDetectorV2(nativeModule)(validRequest());
    expect(result).toEqual({ status: "error", reason: "person_roi_unavailable" });
    expect(JSON.stringify(result)).not.toContain("secret.mov");
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

  it("fails closed on malformed native output and never returns the request URI", async () => {
    const { nativeModule } = fakeNativeModule(async () => ({
      ...validSequence(),
      transformConvention: "reconstructed_metric_3d" as NativeLandmarkSequenceV2["transformConvention"],
    }));
    const result = await createPoseClipDetectorV2(nativeModule)(validRequest());
    expect(result).toEqual({ status: "error", reason: "invalid_native_result" });
    expect(JSON.stringify(result)).not.toContain("file:///private");
  });

  it("rejects an already-restored public sequence at the strict native boundary", async () => {
    const publicSequence = parseLandmarkSequenceV2(validSequence());
    const { nativeModule } = fakeNativeModule(async () => (
      publicSequence as unknown as NativeLandmarkSequenceV2
    ));
    const result = await createPoseClipDetectorV2(nativeModule)(validRequest());
    expect(result).toEqual({ status: "error", reason: "invalid_native_result" });
  });

  it("keeps the capture hook on the exact profile and stable ROI recapture copy", () => {
    const hook = projectFile("hooks/use-shooting-profile-capture.ts");
    expect(hook).toMatch(/detectPoseClipV2\(\{[\s\S]*profile:\s*"personal_v2"/);
    expect(hook).toContain('reason === "person_roi_unavailable"');
    expect(hook).not.toMatch(/(?:console\.(?:log|warn|error)|print)\s*\(/);
  });
});
