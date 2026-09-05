import { describe, expect, it, vi } from "vitest";

import {
  captureSessionReducer,
  createCaptureSession,
  type CaptureSessionState,
} from "@/lib/shooting-profile/capture-session-reducer";
import { twoViewEvaluationReportSchema } from "@/lib/shooting-profile/evaluation-report";
import { buildRealVideoEvaluation } from "@/lib/shooting-profile/real-video-evaluation";
import type { LandmarkSequenceV2 } from "@/lib/shooting-profile/types";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

// The synthetic fixture cannot push a bone past the 25-degree cone gate from raw
// sequences, so the pipeline boundary is stubbed here to prove the report copies
// that reason code and its evidence verbatim.
vi.mock("@/lib/shooting-profile/two-view-pipeline", () => ({
  buildTwoViewRepresentativeProfile: () => ({
    status: "recapture_required",
    reason: "uncertainty_exceeds_limit",
    affectedAttemptIds: ["front-0", "shooting_side-0"],
    affectedBones: ["shoulder_line"],
    crossViewAlignment: {
      status: "accepted",
      version: "cross_view_phase_alignment_v1",
      confidence: 0.43,
      maximumIntermediateAnchorDelta: 0.06,
      phaseIntervalRmse: 0.0424,
      comparedPairCount: 1,
    },
  }),
}));

function acceptedSession(session: { front: LandmarkSequenceV2[]; shootingSide: LandmarkSequenceV2[] }): CaptureSessionState {
  let state = captureSessionReducer(createCaptureSession("basic_1_plus_1", "right"), { type: "START_COLLECTION" });
  for (const slot of state.slots) {
    const generation = slot.generation + 1;
    const requestId = `opaque_${slot.id.replace(/[^A-Za-z0-9]/g, "_")}_${generation}`;
    const sequence = slot.view === "front" ? session.front[0] : session.shootingSide[0];
    state = captureSessionReducer(state, { type: "SLOT_ACQUIRE_STARTED", slotId: slot.id, requestId, generation, captureSource: "camera" });
    state = captureSessionReducer(state, { type: "SLOT_ACCEPTED", slotId: slot.id, requestId, generation, sequence });
  }
  state = captureSessionReducer(state, { type: "AGGREGATE_STARTED" });
  return captureSessionReducer(state, {
    type: "AGGREGATE_RECAPTURE_REQUIRED",
    sessionGeneration: state.sessionGeneration,
    reason: "다시 촬영하세요.",
    reasonCode: "uncertainty_exceeds_limit",
  });
}

describe("private real-video evaluation reason codes", () => {
  it("preserves uncertainty_exceeds_limit and its alignment evidence verbatim", () => {
    const state = acceptedSession(syntheticLandmarkSession({ mode: "basic_1_plus_1" }));
    const result = buildRealVideoEvaluation(state, {
      sourceClass: "consented_self_capture",
      consentConfirmed: true,
      consentRecordId: "local-consent-20260902-001",
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.report.pipeline).toEqual({
      status: "recapture_required",
      reason: "uncertainty_exceeds_limit",
      affectedAttemptIds: ["front-0", "shooting_side-0"],
      affectedBones: ["shoulder_line"],
    });
    expect(result.report.crossViewAlignment).toMatchObject({
      status: "accepted",
      confidence: 0.43,
      maximumIntermediateAnchorDelta: 0.06,
    });
    expect(result.report.reconstruction).toBeUndefined();
    expect(result.report.attempts.every((attempt) => attempt.phaseDetection.status === "detected")).toBe(true);
    expect(twoViewEvaluationReportSchema.parse(result.report)).toEqual(result.report);
    expect(state.recaptureReasonCode).toBe("uncertainty_exceeds_limit");
  });
});
