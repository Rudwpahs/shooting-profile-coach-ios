import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  captureSessionReducer,
  createCaptureSession,
  type CaptureSessionState,
  type CaptureSlotSourceV2,
} from "@/lib/shooting-profile/capture-session-reducer";
import {
  assessCrossViewGeometry,
  CROSS_VIEW_GEOMETRY_V1,
} from "@/lib/shooting-profile/cross-view-geometry";
import {
  buildTwoViewEvaluationReport,
  TwoViewEvaluationReportError,
  twoViewEvaluationReportSchema,
} from "@/lib/shooting-profile/evaluation-report";
import {
  admitEvaluationAttempts,
  buildRealVideoEvaluation,
  isOpaqueConsentRecordId,
  type RealVideoEvaluationBuildOptions,
} from "@/lib/shooting-profile/real-video-evaluation";
import type { CaptureProtocolV2, LandmarkSequenceV2 } from "@/lib/shooting-profile/types";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

type Session = { front: LandmarkSequenceV2[]; shootingSide: LandmarkSequenceV2[] };

const CONSENT: RealVideoEvaluationBuildOptions = {
  sourceClass: "consented_self_capture",
  consentConfirmed: true,
  consentRecordId: "local-consent-20260902-001",
};

function sequenceForSlot(session: Session, slotId: string): LandmarkSequenceV2 {
  const [view, take] = slotId.split("-");
  const pool = view === "front" ? session.front : session.shootingSide;
  const sequence = pool.find((candidate) => candidate.takeIndex === Number(take));
  if (!sequence) throw new Error(`fixture has no ${slotId}`);
  return sequence;
}

function reviewState(
  mode: CaptureProtocolV2,
  session: Session,
  captureSource: CaptureSlotSourceV2 = "camera",
  overrides: Partial<Record<string, CaptureSlotSourceV2>> = {},
): CaptureSessionState {
  let state = captureSessionReducer(createCaptureSession(mode, "right"), { type: "START_COLLECTION" });
  for (const slot of state.slots) {
    const generation = slot.generation + 1;
    const requestId = `opaque_${slot.id.replace(/[^A-Za-z0-9]/g, "_")}_${generation}`;
    state = captureSessionReducer(state, {
      type: "SLOT_ACQUIRE_STARTED",
      slotId: slot.id,
      requestId,
      generation,
      captureSource: overrides[slot.id] ?? captureSource,
    });
    state = captureSessionReducer(state, {
      type: "SLOT_ACCEPTED",
      slotId: slot.id,
      requestId,
      generation,
      sequence: sequenceForSlot(session, slot.id),
    });
  }
  state = captureSessionReducer(state, { type: "AGGREGATE_STARTED" });
  return captureSessionReducer(state, {
    type: "AGGREGATE_RECAPTURE_REQUIRED",
    sessionGeneration: state.sessionGeneration,
    reason: "다시 촬영하세요.",
    reasonCode: "cross_view_phase_mismatch",
  });
}

function relabel(sequence: LandmarkSequenceV2, view: "front" | "shooting_side"): LandmarkSequenceV2 {
  return { ...sequence, view };
}

function mirrorHorizontally(sequence: LandmarkSequenceV2): LandmarkSequenceV2 {
  return {
    ...sequence,
    frames: sequence.frames.map((frame) => ({
      ...frame,
      sourceLandmarks: frame.sourceLandmarks.map((point) => ({ ...point, x: 1 - point.x })),
    })),
  };
}

function attemptsOf(session: Session, side?: LandmarkSequenceV2) {
  return [
    { id: "front-0", sequence: session.front[0] },
    { id: "shooting_side-0", sequence: side ?? session.shootingSide[0] },
  ];
}

describe("capture provenance in reducer state", () => {
  it("stores the camera or library origin of every accepted slot without any media identity", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const state = reviewState("basic_1_plus_1", session, "camera", { "shooting_side-0": "library" });

    expect(state.slots.map((slot) => slot.captureSource)).toEqual(["camera", "library"]);
    const serialized = JSON.stringify(state).toLowerCase();
    expect(serialized).not.toContain("file://");
    expect(serialized).not.toContain("filename");
    expect(serialized).not.toContain("exif");
    expect(serialized.includes("\"uri\"")).toBe(false);
  });

  it("clears the origin when a slot is retaken so a stale provenance cannot be reused", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    let state = captureSessionReducer(createCaptureSession("basic_1_plus_1", "right"), { type: "START_COLLECTION" });
    state = captureSessionReducer(state, {
      type: "SLOT_ACQUIRE_STARTED",
      slotId: "front-0",
      requestId: "opaque_front_0_1",
      generation: 1,
      captureSource: "library",
    });
    state = captureSessionReducer(state, {
      type: "SLOT_ACCEPTED",
      slotId: "front-0",
      requestId: "opaque_front_0_1",
      generation: 1,
      sequence: session.front[0],
    });
    expect(state.slots[0].captureSource).toBe("library");

    state = captureSessionReducer(state, { type: "RETAKE_SLOT", slotId: "front-0" });
    expect(state.slots[0].captureSource).toBeUndefined();
    expect(state.slots[0].sequence).toBeUndefined();
  });

  it("hands the capture hook's picker source straight into the reducer action", () => {
    const hook = readFileSync("hooks/use-shooting-profile-capture.ts", "utf8");
    expect(hook).toContain('dispatch({ type: "SLOT_ACQUIRE_STARTED", slotId, requestId, generation, captureSource: source });');
  });
});

describe("real-video evidence admission", () => {
  it("admits only directly filmed camera clips and names the excluded origin", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });

    const camera = admitEvaluationAttempts(reviewState("basic_1_plus_1", session, "camera"));
    expect(camera.status).toBe("admitted");
    if (camera.status !== "admitted") return;
    expect(camera.attempts.map((attempt) => attempt.captureSource)).toEqual(["camera", "camera"]);

    expect(admitEvaluationAttempts(reviewState("basic_1_plus_1", session, "library"))).toEqual({
      status: "rejected",
      reason: "library_source_not_admissible",
    });
    expect(admitEvaluationAttempts(
      reviewState("basic_1_plus_1", session, "camera", { "shooting_side-0": "library" }),
    )).toEqual({ status: "rejected", reason: "library_source_not_admissible" });
    expect(admitEvaluationAttempts(createCaptureSession())).toEqual({
      status: "rejected",
      reason: "session_not_ready",
    });
  });

  it("refuses an accepted slot whose provenance was never recorded", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const state = reviewState("basic_1_plus_1", session);
    const withoutProvenance: CaptureSessionState = {
      ...state,
      slots: state.slots.map((slot, index) => (
        index === 0 ? { ...slot, captureSource: undefined } : slot
      )),
    };

    expect(admitEvaluationAttempts(withoutProvenance)).toEqual({
      status: "rejected",
      reason: "unknown_capture_source",
    });
    expect(buildRealVideoEvaluation(withoutProvenance, CONSENT)).toEqual({
      status: "build_failed",
      reason: "unknown_capture_source",
    });
  });

  it("blocks a library clip from ever reaching the derived report", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });

    expect(buildRealVideoEvaluation(reviewState("basic_1_plus_1", session, "library"), CONSENT)).toEqual({
      status: "build_failed",
      reason: "library_source_not_admissible",
    });
  });
});

describe("consent admission for consented_self_capture", () => {
  it("accepts only opaque record identifiers", () => {
    for (const value of ["local-consent-20260902-001", "owner_2026_09_02_a1", "abcd1234"]) {
      expect(isOpaqueConsentRecordId(value), value).toBe(true);
    }
    for (const value of [
      "",
      "short1",
      "HongGilDong",
      "owner@example.com",
      "/Users/owner/consent.pdf",
      "consent record 1",
      "홍길동동의기록2026",
      undefined,
      null,
      42,
    ]) {
      expect(isOpaqueConsentRecordId(value), String(value)).toBe(false);
    }
  });

  it("requires an explicit confirmation and an opaque record id before building", () => {
    const state = reviewState("basic_1_plus_1", syntheticLandmarkSession({ mode: "basic_1_plus_1" }));

    expect(buildRealVideoEvaluation(state, { ...CONSENT, consentConfirmed: false })).toEqual({
      status: "build_failed",
      reason: "consent_not_confirmed",
    });
    expect(buildRealVideoEvaluation(state, { ...CONSENT, consentRecordId: undefined })).toEqual({
      status: "build_failed",
      reason: "consent_record_invalid",
    });
    expect(buildRealVideoEvaluation(state, { ...CONSENT, consentRecordId: "owner@example.com" })).toEqual({
      status: "build_failed",
      reason: "consent_record_invalid",
    });
    expect(buildRealVideoEvaluation(state, CONSENT).status).toBe("ready");
  });

  it("does not demand consent metadata for a synthetic fixture and forbids it in the report", () => {
    const state = reviewState("basic_1_plus_1", syntheticLandmarkSession({ mode: "basic_1_plus_1" }));
    const synthetic = buildRealVideoEvaluation(state, { sourceClass: "synthetic_fixture" });

    expect(synthetic.status).toBe("ready");
    if (synthetic.status !== "ready") return;
    expect(synthetic.report.consentRecordId).toBeUndefined();
    expect(() => twoViewEvaluationReportSchema.parse({
      ...synthetic.report,
      consentRecordId: "local-consent-20260902-001",
    })).toThrow();
  });
});

describe("cross-view geometry admission", () => {
  it("accepts a genuine front and shooting-side pair for both hands and both modes", () => {
    for (const shootingHand of ["right", "left"] as const) {
      for (const mode of ["basic_1_plus_1", "high_accuracy_3_plus_3"] as const) {
        const session = syntheticLandmarkSession({ mode, shootingHand });
        const attempts = [...session.front, ...session.shootingSide].map((sequence) => ({
          id: `${sequence.view}-${sequence.takeIndex}`,
          sequence,
        }));
        const result = assessCrossViewGeometry(attempts);

        expect(result.status, `${shootingHand}/${mode} ${JSON.stringify(result)}`).toBe("accepted");
        if (result.status !== "accepted") continue;
        expect(result.minimumNormalizedViewDistance).toBeGreaterThan(
          CROSS_VIEW_GEOMETRY_V1.minimumNormalizedViewDistance * 2,
        );
        expect(result.comparedPairCount).toBe(mode === "basic_1_plus_1" ? 1 : 9);
      }
    }
  });

  it("rejects the same clip relabelled as the other view", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const result = assessCrossViewGeometry(
      attemptsOf(session, relabel(session.front[0], "shooting_side")),
    );

    expect(result).toMatchObject({ status: "rejected", reason: "duplicate_view_projection" });
    if (result.status !== "rejected") return;
    expect(result.minimumNormalizedViewDistance).toBeLessThan(
      CROSS_VIEW_GEOMETRY_V1.minimumNormalizedViewDistance,
    );
  });

  it("rejects a second take of the same angle presented as the other view", () => {
    const session = syntheticLandmarkSession({ mode: "high_accuracy_3_plus_3" });
    const result = assessCrossViewGeometry([
      { id: "front-0", sequence: session.front[0] },
      { id: "shooting_side-0", sequence: relabel(session.front[2], "shooting_side") },
    ]);

    expect(result).toMatchObject({ status: "rejected", reason: "duplicate_view_projection" });
  });

  it("rejects one-sided and both-sided mirroring of the same clip", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const oneSided = assessCrossViewGeometry(
      attemptsOf(session, relabel(mirrorHorizontally(session.front[0]), "shooting_side")),
    );
    const bothSided = assessCrossViewGeometry([
      { id: "front-0", sequence: mirrorHorizontally(session.front[0]) },
      { id: "shooting_side-0", sequence: relabel(mirrorHorizontally(session.front[0]), "shooting_side") },
    ]);

    expect(oneSided).toMatchObject({ status: "rejected", reason: "mirrored_view_projection" });
    expect(bothSided).toMatchObject({ status: "rejected", reason: "duplicate_view_projection" });
  });

  it("reports indeterminate geometry instead of guessing when a view has no usable phase", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const frozen = session.shootingSide[0];
    const stalled: LandmarkSequenceV2 = {
      ...frozen,
      frames: frozen.frames.map((frame) => ({
        ...frame,
        sourceLandmarks: frozen.frames[0].sourceLandmarks.map((point) => ({ ...point })),
      })),
    };

    expect(assessCrossViewGeometry(attemptsOf(session, stalled))).toMatchObject({
      status: "rejected",
      reason: "insufficient_view_evidence",
    });
    expect(assessCrossViewGeometry([{ id: "front-0", sequence: session.front[0] }])).toMatchObject({
      status: "rejected",
      reason: "insufficient_view_evidence",
    });
  });

  it("defers to the pipeline's own reason when a view cannot be measured at all", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const frozen = session.shootingSide[0];
    const stalled: LandmarkSequenceV2 = {
      ...frozen,
      frames: frozen.frames.map((frame) => ({
        ...frame,
        sourceLandmarks: frozen.frames[0].sourceLandmarks.map((point) => ({ ...point })),
      })),
    };
    const result = buildRealVideoEvaluation(
      reviewState("basic_1_plus_1", { ...session, shootingSide: [stalled] }),
      CONSENT,
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.report.pipeline).toMatchObject({
      status: "recapture_required",
      reason: "phase_detection_failed",
    });
  });

  it("stops a relabelled clip from producing a derived report", () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    const duplicated = { ...session, shootingSide: [relabel(session.front[0], "shooting_side")] };
    const mirrored = { ...session, shootingSide: [relabel(mirrorHorizontally(session.front[0]), "shooting_side")] };

    expect(buildRealVideoEvaluation(reviewState("basic_1_plus_1", duplicated), CONSENT)).toEqual({
      status: "build_failed",
      reason: "duplicate_view_projection",
    });
    expect(buildRealVideoEvaluation(reviewState("basic_1_plus_1", mirrored), CONSENT)).toEqual({
      status: "build_failed",
      reason: "mirrored_view_projection",
    });
  });
});

describe("derived report semantic schema", () => {
  it("requires the exact attempt set for the declared capture mode", () => {
    const state = reviewState("basic_1_plus_1", syntheticLandmarkSession({ mode: "basic_1_plus_1" }));
    const basic = buildRealVideoEvaluation(state, CONSENT);
    expect(basic.status).toBe("ready");
    if (basic.status !== "ready") return;

    expect(basic.report.attempts).toHaveLength(2);
    expect(() => twoViewEvaluationReportSchema.parse({
      ...basic.report,
      attempts: [basic.report.attempts[0]],
    })).toThrow();
    expect(() => twoViewEvaluationReportSchema.parse({
      ...basic.report,
      attempts: [...basic.report.attempts, basic.report.attempts[0]],
    })).toThrow();
    expect(() => twoViewEvaluationReportSchema.parse({
      ...basic.report,
      mode: "high_accuracy_3_plus_3",
    })).toThrow();

    const high = buildRealVideoEvaluation(
      reviewState("high_accuracy_3_plus_3", syntheticLandmarkSession({ mode: "high_accuracy_3_plus_3" })),
      CONSENT,
    );
    expect(high.status).toBe("ready");
    if (high.status !== "ready") return;
    expect(high.report.attempts).toHaveLength(6);
    expect(new Set(high.report.attempts.map((attempt) => attempt.attemptId)).size).toBe(6);
  });

  it("admits only stable pipeline detail codes and never a free-form message", () => {
    const state = reviewState("basic_1_plus_1", syntheticLandmarkSession({ mode: "basic_1_plus_1" }));
    const built = buildRealVideoEvaluation(state, CONSENT);
    expect(built.status).toBe("ready");
    if (built.status !== "ready") return;

    expect(() => twoViewEvaluationReportSchema.parse({
      ...built.report,
      pipeline: { ...built.report.pipeline, detail: "missing_release_proxy" },
    })).not.toThrow();
    for (const detail of [
      "Basic capture confidence must not exceed 0.65",
      "/Users/owner/clip.mov could not be read",
      "unexpected",
    ]) {
      expect(() => twoViewEvaluationReportSchema.parse({
        ...built.report,
        pipeline: { ...built.report.pipeline, detail },
      }), detail).toThrow();
    }
  });

  it("separates a raw-evidence failure from a schema failure and from a builder failure", () => {
    const attempts = [] as const;

    expect(() => buildTwoViewEvaluationReport({
      sourceClass: "synthetic_fixture",
      mode: "basic_1_plus_1",
      shootingHand: "right",
      attempts,
    })).toThrow(TwoViewEvaluationReportError);

    try {
      buildTwoViewEvaluationReport({
        sourceClass: "synthetic_fixture",
        mode: "basic_1_plus_1",
        shootingHand: "right",
        attempts,
      });
      expect.unreachable("empty attempts must not build a report");
    } catch (error) {
      expect(error).toBeInstanceOf(TwoViewEvaluationReportError);
      expect((error as TwoViewEvaluationReportError).reason).toBe("schema_invalid");
    }

    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    expect(buildRealVideoEvaluation(reviewState("basic_1_plus_1", session), {
      sourceClass: "consented_self_capture",
      consentConfirmed: true,
      consentRecordId: "local-consent-20260902-001",
      evaluatedCommitSha: "not-a-commit-sha",
    })).toEqual({ status: "build_failed", reason: "schema_invalid" });
  });
});
