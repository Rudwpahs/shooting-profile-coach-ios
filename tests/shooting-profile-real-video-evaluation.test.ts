import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FORMPATH_FLAGS } from "@/lib/feature-flags";
import { PHASE_SAMPLE_COUNT_V2 } from "@/lib/firebase-shooting-profile-contract";
import { buildCapturePlan } from "@/lib/shooting-profile/capture-plan";
import {
  captureSessionReducer,
  createCaptureSession,
  matchingShootingProfileSaveInputV2,
  type CaptureSessionState,
} from "@/lib/shooting-profile/capture-session-reducer";
import { CROSS_VIEW_PHASE_ALIGNMENT_V1 } from "@/lib/shooting-profile/cross-view-alignment";
import { ENGINEERING_THRESHOLDS_V1 } from "@/lib/shooting-profile/engineering-thresholds";
import {
  assertReportContainsNoRawEvidence,
  twoViewEvaluationReportSchema,
} from "@/lib/shooting-profile/evaluation-report";
import {
  buildRealVideoEvaluation,
  collectEvaluationAttempts,
  isDevelopmentBuild,
  isRealVideoEvaluationEnabled,
  shareRealVideoEvaluation,
  type RealVideoEvaluationBuildResult,
} from "@/lib/shooting-profile/real-video-evaluation";
import { buildTwoViewRepresentativeProfile } from "@/lib/shooting-profile/two-view-pipeline";
import {
  PERSISTED_JOINT_NAMES_V2,
  type CaptureProtocolV2,
  type LandmarkSequenceV2,
  type ShootingHandV2,
} from "@/lib/shooting-profile/types";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

type Session = { front: LandmarkSequenceV2[]; shootingSide: LandmarkSequenceV2[] };

const read = (path: string) => readFileSync(path, "utf8");

function sequenceForSlot(session: Session, slotId: string): LandmarkSequenceV2 {
  const [view, take] = slotId.split("-");
  const pool = view === "front" ? session.front : session.shootingSide;
  const sequence = pool.find((candidate) => candidate.takeIndex === Number(take));
  if (!sequence) throw new Error(`fixture has no ${slotId}`);
  return sequence;
}

function acceptedSession(
  mode: CaptureProtocolV2,
  session: Session,
  shootingHand: ShootingHandV2 = "right",
): CaptureSessionState {
  let state = captureSessionReducer(createCaptureSession(mode, shootingHand), { type: "START_COLLECTION" });
  for (const slot of state.slots) {
    const generation = slot.generation + 1;
    const requestId = `opaque_${slot.id.replace(/[^A-Za-z0-9]/g, "_")}_${generation}`;
    state = captureSessionReducer(state, { type: "SLOT_ACQUIRE_STARTED", slotId: slot.id, requestId, generation });
    state = captureSessionReducer(state, {
      type: "SLOT_ACCEPTED",
      slotId: slot.id,
      requestId,
      generation,
      sequence: sequenceForSlot(session, slot.id),
    });
  }
  expect(state.status).toBe("ready_to_aggregate");
  return captureSessionReducer(state, { type: "AGGREGATE_STARTED" });
}

function reviewState(mode: CaptureProtocolV2, session: Session): CaptureSessionState {
  const aggregating = acceptedSession(mode, session);
  const result = buildTwoViewRepresentativeProfile({
    mode,
    shootingHand: "right",
    attempts: aggregating.slots.map((slot) => ({ id: slot.id, sequence: slot.sequence! })),
  });
  expect(result.status, JSON.stringify(result).slice(0, 300)).toBe("complete");
  if (result.status !== "complete") throw new Error("unreachable");
  const state = captureSessionReducer(aggregating, {
    type: "AGGREGATE_COMPLETED",
    sessionGeneration: aggregating.sessionGeneration,
    profile: result.profile,
    confidence: result.confidence,
  });
  expect(state.status).toBe("result_review");
  return state;
}

function recaptureState(mode: CaptureProtocolV2, session: Session, reasonCode: string): CaptureSessionState {
  const aggregating = acceptedSession(mode, session);
  const state = captureSessionReducer(aggregating, {
    type: "AGGREGATE_RECAPTURE_REQUIRED",
    sessionGeneration: aggregating.sessionGeneration,
    reason: "다시 촬영하세요.",
    reasonCode,
  });
  expect(state.status).toBe("error");
  return state;
}

function slowFirstHalf(sequence: LandmarkSequenceV2): LandmarkSequenceV2 {
  const origin = sequence.frames[0].timestampMs;
  const duration = sequence.frames[sequence.frames.length - 1].timestampMs - origin;
  const midpoint = origin + duration / 2;
  const warp = (timestampMs: number) => (
    timestampMs <= midpoint ? origin + 2 * (timestampMs - origin) : timestampMs + duration / 2
  );
  return {
    ...sequence,
    metadata: {
      ...sequence.metadata,
      durationMs: warp(sequence.metadata.durationMs),
      releaseProxyTimestampMs: warp(sequence.metadata.releaseProxyTimestampMs),
      attempts: sequence.metadata.attempts.map((attempt) => ({
        requestedTimestampMs: warp(attempt.requestedTimestampMs),
        decodedTimestampMs: attempt.decodedTimestampMs === null ? null : warp(attempt.decodedTimestampMs),
        detectedTimestampMs: attempt.detectedTimestampMs === null ? null : warp(attempt.detectedTimestampMs),
      })),
    },
    frames: sequence.frames.map((frame) => ({ ...frame, timestampMs: warp(frame.timestampMs) })),
  };
}

function freezeShootingArm(sequence: LandmarkSequenceV2): LandmarkSequenceV2 {
  const frozen = sequence.frames[0].sourceLandmarks;
  return {
    ...sequence,
    frames: sequence.frames.map((frame) => ({
      ...frame,
      sourceLandmarks: frame.sourceLandmarks.map((point, index) => (
        index >= 13 && index <= 16 ? { ...frozen[index] } : point
      )),
    })),
  };
}

function expectReady(result: RealVideoEvaluationBuildResult): Extract<RealVideoEvaluationBuildResult, { status: "ready" }> {
  expect(result.status, JSON.stringify(result).slice(0, 300)).toBe("ready");
  if (result.status !== "ready") throw new Error("unreachable");
  return result;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("private real-video evaluation gate", () => {
  it("enables only when the public flag is exactly \"1\" inside a development build", () => {
    const flags = read("lib/feature-flags.ts");
    expect(flags).toMatch(/^\s*realVideoEvaluation:\s*process\.env\.EXPO_PUBLIC_FORMPATH_REAL_VIDEO_EVAL === "1",\s*$/m);
    expect(process.env.EXPO_PUBLIC_FORMPATH_REAL_VIDEO_EVAL).toBeUndefined();
    expect(FORMPATH_FLAGS.realVideoEvaluation).toBe(false);

    expect(isRealVideoEvaluationEnabled({ realVideoEvaluation: true }, true)).toBe(true);
    expect(isRealVideoEvaluationEnabled({ realVideoEvaluation: true }, false)).toBe(false);
    expect(isRealVideoEvaluationEnabled({ realVideoEvaluation: false }, true)).toBe(false);
    expect(isRealVideoEvaluationEnabled({ realVideoEvaluation: false }, false)).toBe(false);
    // Vitest has no React Native __DEV__ global, which must read as a release build.
    expect(isDevelopmentBuild()).toBe(false);
  });

  it("keeps the evaluation panel and export code unreachable in a default build", () => {
    const hook = read("hooks/use-shooting-profile-capture.ts");
    const session = read("components/shooting-profile/capture-session.tsx");
    const panel = read("components/shooting-profile/real-video-evaluation-panel.tsx");

    expect(hook).toContain("isRealVideoEvaluationEnabled(FORMPATH_FLAGS, isDevelopmentBuild())");
    expect(hook.match(/if \(!evaluationEnabled\) return;/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(session).toContain("capture.evaluationEnabled ? (");
    expect(session).toContain("RealVideoEvaluationPanel");
    expect(panel).toContain('accessibilityRole="button"');
    expect(panel).toContain("minHeight: 44");
    expect(panel).not.toMatch(/useEffect|Share\.share|fetch\(|firebase/);
  });

  it("never hands sequences to Firestore, the network, or the clipboard", () => {
    const evaluationModule = read("lib/shooting-profile/real-video-evaluation.ts");
    const panel = read("components/shooting-profile/real-video-evaluation-panel.tsx");
    const hook = read("hooks/use-shooting-profile-capture.ts");
    const evaluationSection = hook.slice(
      hook.indexOf("const buildEvaluationReport = useCallback"),
      hook.indexOf("const save = useCallback"),
    );
    for (const source of [evaluationModule, panel, evaluationSection]) {
      expect(source).not.toMatch(/firebase|firestore|fetch\(|axios|XMLHttpRequest|WebSocket|trpc|Clipboard|analytics|saveProfile|runCaptureSaveOperationV2/i);
    }
    expect(evaluationSection.length).toBeGreaterThan(0);
    expect(evaluationSection).toContain("Share.share({");
    expect(evaluationSection).not.toMatch(/url:/);

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = expectReady(buildRealVideoEvaluation(
      reviewState("basic_1_plus_1", syntheticLandmarkSession({ mode: "basic_1_plus_1" })),
      { sourceClass: "consented_self_capture" },
    ));
    vi.unstubAllGlobals();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(Object.keys(result).sort()).toEqual(["json", "report", "status"]);
    expect("saveInput" in result).toBe(false);
    expect("normalizedAttempts" in result).toBe(false);
  });

  it("builds a strict-schema derived report from the sequences already held in reducer memory", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const state = reviewState("basic_1_plus_1", session);
    const attempts = collectEvaluationAttempts(state);
    expect(attempts?.map((attempt) => attempt.id)).toEqual(["front-0", "shooting_side-0"]);
    expect(attempts?.every((attempt) => attempt.sequence === state.slots.find((slot) => slot.id === attempt.id)?.sequence)).toBe(true);

    const result = expectReady(buildRealVideoEvaluation(state, {
      sourceClass: "consented_self_capture",
      consentRecordId: "local-consent-20260902-001",
    }));

    expect(twoViewEvaluationReportSchema.parse(result.report)).toEqual(result.report);
    expect(JSON.parse(result.json)).toEqual(result.report);
    expect(result.report.sourceClass).toBe("consented_self_capture");
    expect(result.report.consentRecordId).toBe("local-consent-20260902-001");
    expect(result.report.pipeline.status).toBe("complete");
    expect(result.report.mode).toBe("basic_1_plus_1");
    expect(result.report.attempts).toHaveLength(2);
    expect(result.report.reconstruction?.boneLengthDriftWithinTolerance).toBe(true);
    expect(() => assertReportContainsNoRawEvidence(result.report)).not.toThrow();
    expect(result.json).not.toMatch(/sourceLandmarks|timestampMs|"z"\s*:|file:\/\/|\.mp4|\.mov|displayWidth|cropRectPx/);
  });

  it("builds the same derived report for a High session and for a recapture session", () => {
    const high = expectReady(buildRealVideoEvaluation(
      reviewState("high_accuracy_3_plus_3", syntheticLandmarkSession({ mode: "high_accuracy_3_plus_3" })),
      { sourceClass: "internal_test_capture" },
    ));
    expect(high.report.attempts).toHaveLength(6);
    expect(high.report.pipeline.status).toBe("complete");

    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const mismatched = { ...session, shootingSide: [slowFirstHalf(session.shootingSide[0])] };
    const state = recaptureState("basic_1_plus_1", mismatched, "cross_view_phase_mismatch");
    const recapture = expectReady(buildRealVideoEvaluation(state, { sourceClass: "consented_self_capture" }));
    expect(recapture.report.pipeline.status).toBe("recapture_required");
    expect(recapture.report.pipeline.reason).toBe(state.recaptureReasonCode);
    expect(recapture.report.reconstruction).toBeUndefined();
    expect(twoViewEvaluationReportSchema.parse(recapture.report)).toEqual(recapture.report);
  });

  it("rejects raw landmarks, native z, timestamps, URIs, and file names before anything can leave the app", () => {
    const { report } = expectReady(buildRealVideoEvaluation(
      reviewState("basic_1_plus_1", syntheticLandmarkSession({ mode: "basic_1_plus_1" })),
      { sourceClass: "consented_self_capture" },
    ));
    const poisoned: unknown[] = [
      { ...report, sourceLandmarks: [{ x: 0.1, y: 0.2 }] },
      { ...report, z: 0.01 },
      { ...report, timestampMs: 1234 },
      { ...report, consentRecordId: "file:///var/mobile/Containers/clip.mp4" },
      { ...report, consentRecordId: "IMG_0001.mov" },
      { ...report, consentRecordId: "filename=front" },
      { ...report, consentRecordId: "uri content://x" },
    ];
    for (const candidate of poisoned) {
      expect(() => assertReportContainsNoRawEvidence(candidate as typeof report)).toThrow(/raw evidence/);
    }
    expect(() => twoViewEvaluationReportSchema.parse({ ...report, sourceLandmarks: [] })).toThrow();
    expect(() => twoViewEvaluationReportSchema.parse({ ...report, frames: [] })).toThrow();
  });

  it("treats a dismissed share sheet as its own state and a thrown share as a failure", async () => {
    const { json } = expectReady(buildRealVideoEvaluation(
      reviewState("basic_1_plus_1", syntheticLandmarkSession({ mode: "basic_1_plus_1" })),
      { sourceClass: "consented_self_capture" },
    ));
    const payloads: { message: string; title: string }[] = [];

    await expect(shareRealVideoEvaluation(json, async (payload) => {
      payloads.push(payload);
      return { action: "dismissedAction" };
    })).resolves.toBe("share_dismissed");
    await expect(shareRealVideoEvaluation(json, async () => ({ action: "sharedAction" }))).resolves.toBe("shared");
    await expect(shareRealVideoEvaluation(json, async () => {
      throw new Error("share sheet unavailable");
    })).resolves.toBe("share_failed");

    expect(payloads).toHaveLength(1);
    expect(payloads[0].message).toBe(json);
    expect(Object.keys(payloads[0]).sort()).toEqual(["message", "title"]);
  });

  it("preserves stable recapture reason codes verbatim in the derived report", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const cases: [string, Session][] = [
      ["cross_view_phase_mismatch", { ...session, shootingSide: [slowFirstHalf(session.shootingSide[0])] }],
      ["phase_detection_failed", { ...session, shootingSide: [freezeShootingArm(session.shootingSide[0])] }],
    ];
    for (const [reasonCode, corrupted] of cases) {
      const state = recaptureState("basic_1_plus_1", corrupted, reasonCode);
      const { report } = expectReady(buildRealVideoEvaluation(state, { sourceClass: "consented_self_capture" }));
      expect(report.pipeline).toMatchObject({ status: "recapture_required", reason: reasonCode });
      expect(state.recaptureReasonCode).toBe(reasonCode);
    }
  });

  it("does not create or persist a save envelope when evaluation runs or fails", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const mismatched = { ...session, shootingSide: [slowFirstHalf(session.shootingSide[0])] };
    const state = recaptureState("basic_1_plus_1", mismatched, "cross_view_phase_mismatch");
    const retained = {
      sessionGeneration: state.sessionGeneration,
      mode: "basic_1_plus_1" as const,
      shootingHand: "right" as const,
      normalizedAttempts: [],
    };

    expect(matchingShootingProfileSaveInputV2(state, retained)).toBeNull();
    const built = buildRealVideoEvaluation(state, { sourceClass: "consented_self_capture" });
    expect(built.status).toBe("ready");
    expect(matchingShootingProfileSaveInputV2(state, retained)).toBeNull();
    expect(state.profile).toBeUndefined();

    const notReady = buildRealVideoEvaluation(createCaptureSession("basic_1_plus_1", "right"), {
      sourceClass: "consented_self_capture",
    });
    expect(notReady).toEqual({ status: "build_failed", reason: "session_not_ready" });
    expect(collectEvaluationAttempts(createCaptureSession())).toBeUndefined();
  });

  it("leaves the frozen V2 contracts untouched", () => {
    expect(PHASE_SAMPLE_COUNT_V2).toBe(101);
    expect(PERSISTED_JOINT_NAMES_V2).toHaveLength(12);
    expect(ENGINEERING_THRESHOLDS_V1.basicConfidenceCap).toBe(0.65);
    expect(ENGINEERING_THRESHOLDS_V1.maximumAcceptedDirectionalConeDegrees).toBe(25);
    expect(buildCapturePlan("basic_1_plus_1")).toHaveLength(2);
    expect(buildCapturePlan("high_accuracy_3_plus_3")).toHaveLength(6);
    expect(CROSS_VIEW_PHASE_ALIGNMENT_V1.maximumIntermediateAnchorDelta).toBe(0.10);
    expect(CROSS_VIEW_PHASE_ALIGNMENT_V1.maximumPhaseIntervalRmse).toBe(0.08);
    expect(CROSS_VIEW_PHASE_ALIGNMENT_V1.uncertaintyPropagation).toEqual({
      coneDegreesAtLimit: 3,
      varianceAtLimit: 0.015,
      confidencePenaltyAtLimit: 0.5,
    });
    const flags = read("lib/feature-flags.ts");
    expect(flags).toMatch(/captureV2:\s*process\.env\.EXPO_PUBLIC_FORMPATH_CAPTURE_V2 === "1"/);
    expect(flags).toMatch(/profileV2:\s*process\.env\.EXPO_PUBLIC_FORMPATH_PROFILE_V2 === "1"/);
    expect(flags).toMatch(/representative4DViewer:\s*process\.env\.EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D === "1"/);
  });
});
