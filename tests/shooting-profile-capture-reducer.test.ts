import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  admitCaptureSaveOperationV2,
  captureSaveOperationMatches,
  captureSessionRetainsSaveToken,
  captureSessionReducer,
  clearCaptureSaveOperationIfMatching,
  clearOwnerOperationIfMatching,
  createCaptureSession,
  matchingShootingProfileSaveInputV2,
  ownerGenerationMatches,
  ownerOperationMatches,
  runCaptureSaveOperationV2,
  runOwnerBoundDeleteOperationV2,
  valueForExactOwner,
  type CaptureSaveOperationTokenV2,
  type CaptureSessionState,
  type OwnerOperationToken,
} from "@/lib/shooting-profile/capture-session-reducer";
import { parseRepresentativePose4D } from "@/lib/shooting-profile/codec";
import type { SaveShootingProfileInputV2 } from "@/lib/firebase-shooting-profile-contract";
import { parseLandmarkSequenceV2 } from "@/lib/pose-detection-v2";
import {
  PERSISTED_JOINT_NAMES_V2,
  type CaptureProtocolV2,
  type LandmarkSequenceV2,
  type RepresentativePoseFrameV2,
  type RepresentativePose4DV2,
  type ShootingHandV2,
} from "@/lib/shooting-profile/types";
import type { NormalizedViewAttemptV2 } from "@/lib/shooting-profile/repeated-shot";

function landmarkSequence(
  slotId: string,
  shootingHand: ShootingHandV2 = "right",
): LandmarkSequenceV2 {
  const [view, take] = slotId.split("-");
  const displayWidth = 1_080;
  const displayHeight = 1_920;
  const frames = Array.from({ length: 8 }, (_, frameIndex) => ({
    timestampMs: frameIndex * 500,
    sourceLandmarks: Array.from({ length: 33 }, (_, landmarkIndex) => ({
      x: 0.2 + landmarkIndex * 0.01,
      y: 0.3 + frameIndex * 0.005,
      z: -0.1 + landmarkIndex * 0.001,
      visibility: 0.95,
    })),
    cropRectPx: { x: 0, y: 0, width: displayWidth, height: displayHeight },
    modelToSourcePx: [
      displayWidth, 0, 0,
      0, displayHeight, 0,
      0, 0, 1,
    ],
  }));
  return {
    version: 2,
    view: view === "front" ? "front" : "shooting_side",
    shootingHand,
    takeIndex: Number(take) as 0 | 1 | 2,
    metadata: {
      durationMs: 4_000,
      displayWidth,
      displayHeight,
      nominalFrameRate: 30,
      frameRateMode: "constant",
      attemptedFrames: 10,
      decodedFrames: 10,
      detectedFrames: 8,
      rejectedFrames: 2,
    },
    frames,
    transformConvention: "upright_source_top_left_v1",
    quality: { passed: true, reasons: [] },
  };
}

function profile(mode: CaptureProtocolV2): RepresentativePose4DV2 {
  const frames = Array.from({ length: 101 }, (_, index): RepresentativePoseFrameV2 => ({
    phase: index / 100,
    joints: Object.fromEntries(PERSISTED_JOINT_NAMES_V2.map((joint, jointIndex) => [
      joint,
      { x: 0.01 * jointIndex, y: 0.2 + index * 0.001, z: -0.05 },
    ])) as RepresentativePoseFrameV2["joints"],
    uncertainty: Object.fromEntries(PERSISTED_JOINT_NAMES_V2.map((joint) => [
      joint,
      {
        model: "heuristic_v1",
        covariance: [0.01, 0, 0, 0.01, 0, 0.01],
        directionalConeDegrees: 12,
      },
    ])) as RepresentativePoseFrameV2["uncertainty"],
  }));
  return {
    schemaVersion: 2,
    boundary: "representative_phase_fused_4d_estimate_not_actual_3d",
    mode,
    timeBasis: "normalized_shot_phase",
    units: "template_shoulder_breadths",
    frames,
    phaseAnchors: [
      { id: "ready", phase: 0 },
      { id: "deepestDip", phase: 0.25 },
      { id: "rise", phase: 0.5 },
      { id: "releaseProxy", phase: 0.75 },
      { id: "followThrough", phase: 1 },
    ],
    quality: { passed: true, reasons: [] },
  };
}

function normalizedAttempt(id: string, view: "front" | "shooting_side", takeIndex: 0 | 1 | 2): NormalizedViewAttemptV2 {
  return {
    id,
    phaseAnchors: [
      { id: "ready", timestampMs: 0, phase: 0 },
      { id: "deepestDip", timestampMs: 250, phase: 0.25 },
      { id: "rise", timestampMs: 500, phase: 0.5 },
      { id: "releaseProxy", timestampMs: 750, phase: 0.75 },
      { id: "followThrough", timestampMs: 1_000, phase: 1 },
    ],
    frames: [{ phase: 0, sourceTimestampMs: 0, view, shootingHand: "right", takeIndex, sourceLandmarks: [] }],
  };
}

function collecting(
  mode: CaptureProtocolV2,
  shootingHand: ShootingHandV2 = "right",
): CaptureSessionState {
  return captureSessionReducer(createCaptureSession(mode, shootingHand), {
    type: "START_COLLECTION",
  });
}

function acceptSlot(state: CaptureSessionState, slotId: string): CaptureSessionState {
  const slot = state.slots.find((candidate) => candidate.id === slotId);
  if (!slot) throw new Error(`Missing test slot ${slotId}`);
  const generation = slot.generation + 1;
  const requestId = `opaque_${slotId.replace(/[^A-Za-z0-9]/g, "_")}_${generation}`;
  const acquiring = captureSessionReducer(state, {
    type: "SLOT_ACQUIRE_STARTED",
    slotId,
    requestId,
    generation,
  });
  return captureSessionReducer(acquiring, {
    type: "SLOT_ACCEPTED",
    slotId,
    requestId,
    generation,
    sequence: landmarkSequence(slotId, state.shootingHand),
  });
}

function acceptedSession(mode: CaptureProtocolV2): CaptureSessionState {
  const state = collecting(mode);
  return state.slots.reduce(
    (state, slot) => acceptSlot(state, slot.id),
    state,
  );
}

describe("captureSessionReducer", () => {
  it("hides owner A values immediately when the current owner becomes B", () => {
    const ownerARecords = [{ id: "owner-a-private-record" }];
    const ownerAViewer = { id: "owner-a-selected-viewer" };

    expect(valueForExactOwner("owner-a", { ownerUid: "owner-a", value: ownerARecords })).toBe(ownerARecords);
    expect(valueForExactOwner("owner-b", { ownerUid: "owner-a", value: ownerARecords })).toBeUndefined();
    expect(valueForExactOwner("owner-b", { ownerUid: "owner-a", value: ownerAViewer })).toBeUndefined();
    expect(valueForExactOwner(null, { ownerUid: "owner-a", value: ownerARecords })).toBeUndefined();
  });

  it("rejects deferred load and delete tokens after an owner changes", () => {
    const ownerADelete = { ownerUid: "owner-a", profileId: "profile_a", token: 1 };
    const ownerBDelete = { ownerUid: "owner-b", profileId: "profile_b", token: 2 };

    expect(ownerGenerationMatches("owner-a", "owner-a", 3, 3)).toBe(true);
    expect(ownerGenerationMatches("owner-b", "owner-a", 3, 3)).toBe(false);
    expect(ownerGenerationMatches("owner-a", "owner-a", 4, 3)).toBe(false);
    expect(ownerOperationMatches("owner-b", ownerADelete, 1)).toBe(false);
    expect(ownerOperationMatches("owner-b", ownerBDelete, 2)).toBe(true);
    expect(ownerOperationMatches("owner-b", ownerBDelete, 1)).toBe(false);
    expect(ownerOperationMatches("owner-b", null, 2)).toBe(false);
  });

  it("lets a new owner delete while the old owner's request hangs and suppresses the late result", async () => {
    let currentOwnerUid: string | null = "owner-a";
    let active: OwnerOperationToken | null = { ownerUid: "owner-a", profileId: "profile_a", token: 1 };
    let resolveOwnerA!: () => void;
    const ownerAPromise = new Promise<void>((resolve) => { resolveOwnerA = resolve; });
    const completions: string[] = [];
    const failures: string[] = [];
    const ownerACompletion = runOwnerBoundDeleteOperationV2({
      deleteProfile: () => ownerAPromise,
      isCurrent: () => ownerOperationMatches(currentOwnerUid, active, 1),
      onSucceeded: () => completions.push("owner-a"),
      onFailed: () => failures.push("owner-a"),
      onFinally: () => { active = clearOwnerOperationIfMatching(active, 1); },
    });

    currentOwnerUid = "owner-b";
    active = { ownerUid: "owner-b", profileId: "profile_b", token: 2 };
    let resolveOwnerB!: () => void;
    const ownerBPromise = new Promise<void>((resolve) => { resolveOwnerB = resolve; });
    const ownerBCompletion = runOwnerBoundDeleteOperationV2({
      deleteProfile: () => ownerBPromise,
      isCurrent: () => ownerOperationMatches(currentOwnerUid, active, 2),
      onSucceeded: () => completions.push("owner-b"),
      onFailed: () => failures.push("owner-b"),
      onFinally: () => { active = clearOwnerOperationIfMatching(active, 2); },
    });

    expect(completions).toEqual([]);
    resolveOwnerB();
    await expect(ownerBCompletion).resolves.toBe("succeeded");
    expect(completions).toEqual(["owner-b"]);
    expect(active).toBeNull();

    resolveOwnerA();
    await expect(ownerACompletion).resolves.toBe("ignored");
    expect(completions).toEqual(["owner-b"]);
    expect(failures).toEqual([]);
    expect(active).toBeNull();
  });

  it("reports a current deletion failure and still performs matching-token cleanup", async () => {
    let active: OwnerOperationToken | null = {
      ownerUid: "owner-a",
      profileId: "profile_a",
      token: 8,
    };
    const failures: string[] = [];

    await expect(runOwnerBoundDeleteOperationV2({
      deleteProfile: async () => { throw new Error("service detail must not escape"); },
      isCurrent: () => ownerOperationMatches("owner-a", active, 8),
      onSucceeded: () => { throw new Error("unexpected success"); },
      onFailed: () => failures.push("stable Korean UI error"),
      onFinally: () => { active = clearOwnerOperationIfMatching(active, 8); },
    })).resolves.toBe("failed");

    expect(failures).toEqual(["stable Korean UI error"]);
    expect(active).toBeNull();
  });

  it("builds only a matching strict save envelope and preserves normalized-attempt identity", () => {
    const attempts = [
      normalizedAttempt("front-0", "front", 0),
      normalizedAttempt("shooting_side-0", "shooting_side", 0),
    ];
    const state: CaptureSessionState = {
      ...createCaptureSession("basic_1_plus_1", "right"),
      status: "result_review",
      sessionGeneration: 7,
      profile: profile("basic_1_plus_1"),
      confidence: 0.61,
    };
    const retained = {
      sessionGeneration: 7,
      mode: "basic_1_plus_1" as const,
      shootingHand: "right" as const,
      normalizedAttempts: attempts,
    };

    const input = matchingShootingProfileSaveInputV2(state, retained);

    expect(Object.keys(input ?? {}).sort()).toEqual(["confidence", "normalizedAttempts", "profile", "shootingHand"]);
    expect(input?.normalizedAttempts).toBe(attempts);
    expect(input).toMatchObject({ profile: state.profile, shootingHand: "right", confidence: 0.61 });
    expect(matchingShootingProfileSaveInputV2({ ...state, sessionGeneration: 8 }, retained)).toBeNull();
    expect(matchingShootingProfileSaveInputV2(state, { ...retained, normalizedAttempts: attempts.slice(0, 1) })).toBeNull();
    expect(matchingShootingProfileSaveInputV2(state, {
      ...retained,
      normalizedAttempts: [
        normalizedAttempt("front-0", "front", 0),
        normalizedAttempt("front-1", "front", 1),
      ],
    })).toBeNull();

    const highAttempts = [
      normalizedAttempt("front-0", "front", 0),
      normalizedAttempt("front-1", "front", 1),
      normalizedAttempt("front-2", "front", 2),
      normalizedAttempt("shooting_side-0", "shooting_side", 0),
      normalizedAttempt("shooting_side-1", "shooting_side", 1),
      normalizedAttempt("shooting_side-2", "shooting_side", 2),
    ];
    const highState: CaptureSessionState = {
      ...state,
      mode: "high_accuracy_3_plus_3",
      profile: profile("high_accuracy_3_plus_3"),
    };
    const highRetained = {
      ...retained,
      mode: "high_accuracy_3_plus_3" as const,
      normalizedAttempts: highAttempts,
    };
    expect(matchingShootingProfileSaveInputV2(highState, highRetained)?.normalizedAttempts).toBe(highAttempts);
    expect(matchingShootingProfileSaveInputV2(highState, { ...highRetained, normalizedAttempts: highAttempts.slice(0, 5) })).toBeNull();
  });

  it("runs one exact save envelope and reaches complete only after a valid returned ID", async () => {
    const attempts = [
      normalizedAttempt("front-0", "front", 0),
      normalizedAttempt("shooting_side-0", "shooting_side", 0),
    ];
    let state: CaptureSessionState = {
      ...createCaptureSession("basic_1_plus_1", "right"),
      status: "result_review",
      sessionGeneration: 11,
      profile: profile("basic_1_plus_1"),
      confidence: 0.62,
    };
    const retained = {
      sessionGeneration: 11,
      mode: "basic_1_plus_1" as const,
      shootingHand: "right" as const,
      normalizedAttempts: attempts,
    };
    let resolveSave!: (profileId: string) => void;
    const deferredSave = new Promise<string>((resolve) => { resolveSave = resolve; });
    let serviceInput: SaveShootingProfileInputV2 | null = null;
    let active: CaptureSaveOperationTokenV2 | null = null;
    const operation = { token: "save_opaque_11", sessionGeneration: 11 };
    active = admitCaptureSaveOperationV2(active, operation);
    expect(active).toEqual(operation);
    expect(admitCaptureSaveOperationV2(active, { token: "second", sessionGeneration: 11 })).toBeNull();

    const completion = runCaptureSaveOperationV2({
      state,
      retained,
      saveProfile: (input) => {
        serviceInput = input;
        return deferredSave;
      },
      isCurrent: () => captureSaveOperationMatches(active, operation, state.sessionGeneration),
      onStarted: () => { state = captureSessionReducer(state, { type: "SAVE_STARTED" }); },
      onSucceeded: (profileId, sessionGeneration) => {
        state = captureSessionReducer(state, { type: "SAVE_SUCCEEDED", profileId, sessionGeneration });
      },
      onFailed: (sessionGeneration) => {
        state = captureSessionReducer(state, { type: "SAVE_FAILED", sessionGeneration, reason: "stable failure" });
      },
      onFinally: () => { active = clearCaptureSaveOperationIfMatching(active, operation); },
    });

    expect(state.status).toBe("saving");
    expect(serviceInput).toMatchObject({ profile: state.profile, shootingHand: "right", confidence: 0.62 });
    expect(serviceInput?.normalizedAttempts).toBe(attempts);
    resolveSave("profile_valid_11");
    await expect(completion).resolves.toBe("succeeded");
    expect(state).toMatchObject({ status: "complete", savedProfileId: "profile_valid_11" });
    expect(active).toBeNull();
  });

  it("fails closed on a malformed returned ID and suppresses a late save after generation invalidation", async () => {
    const attempts = [
      normalizedAttempt("front-0", "front", 0),
      normalizedAttempt("shooting_side-0", "shooting_side", 0),
    ];
    const retained = {
      sessionGeneration: 13,
      mode: "basic_1_plus_1" as const,
      shootingHand: "right" as const,
      normalizedAttempts: attempts,
    };
    const reviewState: CaptureSessionState = {
      ...createCaptureSession("basic_1_plus_1", "right"),
      status: "result_review",
      sessionGeneration: 13,
      profile: profile("basic_1_plus_1"),
      confidence: 0.63,
    };
    let malformedState = reviewState;
    const malformedOperation = { token: "save_malformed_13", sessionGeneration: 13 };
    let malformedActive: CaptureSaveOperationTokenV2 | null = malformedOperation;
    await expect(runCaptureSaveOperationV2({
      state: reviewState,
      retained,
      saveProfile: async () => "bad/id",
      isCurrent: () => captureSaveOperationMatches(malformedActive, malformedOperation, malformedState.sessionGeneration),
      onStarted: () => { malformedState = captureSessionReducer(malformedState, { type: "SAVE_STARTED" }); },
      onSucceeded: (profileId, sessionGeneration) => {
        malformedState = captureSessionReducer(malformedState, { type: "SAVE_SUCCEEDED", profileId, sessionGeneration });
      },
      onFailed: (sessionGeneration) => {
        malformedState = captureSessionReducer(malformedState, { type: "SAVE_FAILED", sessionGeneration, reason: "stable failure" });
      },
      onFinally: () => { malformedActive = clearCaptureSaveOperationIfMatching(malformedActive, malformedOperation); },
    })).resolves.toBe("failed");
    expect(malformedState).toMatchObject({ status: "error", errorMessage: "stable failure" });
    expect(malformedState.savedProfileId).toBeUndefined();

    let resolveLate!: (profileId: string) => void;
    const deferredLate = new Promise<string>((resolve) => { resolveLate = resolve; });
    let staleState = reviewState;
    const staleOperation = { token: "save_stale_13", sessionGeneration: 13 };
    let staleActive: CaptureSaveOperationTokenV2 | null = staleOperation;
    const staleCompletion = runCaptureSaveOperationV2({
      state: reviewState,
      retained,
      saveProfile: () => deferredLate,
      isCurrent: () => captureSaveOperationMatches(staleActive, staleOperation, staleState.sessionGeneration),
      onStarted: () => { staleState = captureSessionReducer(staleState, { type: "SAVE_STARTED" }); },
      onSucceeded: (profileId, sessionGeneration) => {
        staleState = captureSessionReducer(staleState, { type: "SAVE_SUCCEEDED", profileId, sessionGeneration });
      },
      onFailed: (sessionGeneration) => {
        staleState = captureSessionReducer(staleState, { type: "SAVE_FAILED", sessionGeneration, reason: "stable failure" });
      },
      onFinally: () => { staleActive = clearCaptureSaveOperationIfMatching(staleActive, staleOperation); },
    });
    staleState = { ...staleState, sessionGeneration: 14 };
    resolveLate("profile_late_13");
    await expect(staleCompletion).resolves.toBe("ignored");
    expect(staleState.savedProfileId).toBeUndefined();
    expect(staleState.status).toBe("saving");
  });

  it("uses fixtures accepted by the production clip and profile codecs", () => {
    expect(parseLandmarkSequenceV2(landmarkSequence("front-0"))).toEqual(landmarkSequence("front-0"));
    expect(parseRepresentativePose4D(profile("basic_1_plus_1"))).toEqual(profile("basic_1_plus_1"));
  });

  it.each([
    ["basic_1_plus_1", 2],
    ["high_accuracy_3_plus_3", 6],
  ] as const)("%s requires every one of its %i slots before aggregation", (mode, count) => {
    let state = collecting(mode);
    expect(state.slots).toHaveLength(count);

    for (const slot of state.slots.slice(0, -1)) {
      state = acceptSlot(state, slot.id);
    }
    expect(state.status).toBe("collecting");

    state = acceptSlot(state, state.slots.at(-1)!.id);
    expect(state.status).toBe("ready_to_aggregate");
  });

  it("enables slots strictly front-first and one take at a time", () => {
    let state = collecting("high_accuracy_3_plus_3");
    expect(state.slots.map((slot) => [slot.id, slot.enabled])).toEqual([
      ["front-0", true],
      ["front-1", false],
      ["front-2", false],
      ["shooting_side-0", false],
      ["shooting_side-1", false],
      ["shooting_side-2", false],
    ]);

    state = acceptSlot(state, "front-0");
    expect(state.slots.find((slot) => slot.id === "front-1")?.enabled).toBe(true);
    expect(state.slots.find((slot) => slot.id === "shooting_side-0")?.enabled).toBe(false);
    state = acceptSlot(acceptSlot(state, "front-1"), "front-2");
    expect(state.slots.find((slot) => slot.id === "shooting_side-0")?.enabled).toBe(true);
  });

  it("retakes only the selected slot and invalidates an aggregate", () => {
    let state = acceptedSession("basic_1_plus_1");
    state = captureSessionReducer(state, { type: "AGGREGATE_STARTED" });
    state = captureSessionReducer(state, {
      type: "AGGREGATE_COMPLETED",
      sessionGeneration: state.sessionGeneration,
      profile: profile("basic_1_plus_1"),
      confidence: 0.6,
    });
    const previousGeneration = state.slots[0].generation;

    state = captureSessionReducer(state, { type: "RETAKE_SLOT", slotId: "front-0" });

    expect(state.status).toBe("collecting");
    expect(state.slots.find((slot) => slot.id === "front-0")).toMatchObject({
      status: "empty",
      generation: previousGeneration + 1,
    });
    expect(state.slots.find((slot) => slot.id === "shooting_side-0")?.status).toBe("accepted");
    expect(state.profile).toBeUndefined();
    expect(state.confidence).toBeUndefined();
  });

  it("ignores progress and results from an obsolete slot request generation", () => {
    let state = collecting("basic_1_plus_1");
    state = captureSessionReducer(state, {
      type: "SLOT_ACQUIRE_STARTED",
      slotId: "front-0",
      requestId: "opaque_old_request",
      generation: 1,
    });
    state = captureSessionReducer(state, { type: "RETAKE_SLOT", slotId: "front-0" });
    expect(state.slots[0]).toMatchObject({
      status: "empty",
      generation: 2,
      requestId: undefined,
    });
    state = captureSessionReducer(state, {
      type: "SLOT_ACQUIRE_STARTED",
      slotId: "front-0",
      requestId: "opaque_new_request",
      generation: 3,
    });
    const current = state;

    state = captureSessionReducer(state, {
      type: "SLOT_PROGRESS",
      slotId: "front-0",
      requestId: "opaque_old_request",
      generation: 1,
      progress: { stage: "dense_pose", completed: 19, total: 20 },
    });
    state = captureSessionReducer(state, {
      type: "SLOT_ACCEPTED",
      slotId: "front-0",
      requestId: "opaque_old_request",
      generation: 1,
      sequence: landmarkSequence("front-0"),
    });

    expect(state).toBe(current);
    expect(state.slots[0]).toMatchObject({
      status: "acquiring",
      requestId: "opaque_new_request",
      generation: 3,
    });
  });

  it.each(["acquiring", "analyzing"] as const)(
    "active retake invalidates an %s request and rejects its late result",
    (activeStatus) => {
      let state = collecting("basic_1_plus_1");
      state = captureSessionReducer(state, {
        type: "SLOT_ACQUIRE_STARTED",
        slotId: "front-0",
        requestId: "opaque_active_retake",
        generation: 1,
      });
      if (activeStatus === "analyzing") {
        state = captureSessionReducer(state, {
          type: "SLOT_PROGRESS",
          slotId: "front-0",
          requestId: "opaque_active_retake",
          generation: 1,
          progress: { stage: "coarse_pose", completed: 1, total: 8 },
        });
      }
      expect(state.slots[0].status).toBe(activeStatus);

      state = captureSessionReducer(state, { type: "RETAKE_SLOT", slotId: "front-0" });
      expect(state.slots[0]).toMatchObject({ status: "empty", generation: 2, requestId: undefined });
      const invalidated = state;
      state = captureSessionReducer(state, {
        type: "SLOT_ACCEPTED",
        slotId: "front-0",
        requestId: "opaque_active_retake",
        generation: 1,
        sequence: landmarkSequence("front-0"),
      });
      expect(state).toBe(invalidated);
    },
  );

  it.each([
    ["result_review", true],
    ["saving", true],
    ["complete", false],
    ["error", false],
    ["cancelled", false],
    ["collecting", false],
    ["mode_select", false],
  ] as const)("save-token retention for %s is %s", (status, retained) => {
    expect(captureSessionRetainsSaveToken(status)).toBe(retained);
  });

  it("keeps rejected clips incomplete and supports aggregate recapture recovery", () => {
    let state = collecting("basic_1_plus_1");
    state = captureSessionReducer(state, {
      type: "SLOT_ACQUIRE_STARTED",
      slotId: "front-0",
      requestId: "opaque_rejected_request",
      generation: 1,
    });
    state = captureSessionReducer(state, {
      type: "SLOT_REJECTED",
      slotId: "front-0",
      requestId: "opaque_rejected_request",
      generation: 1,
      reason: "전신 관절을 충분히 찾지 못했습니다.",
    });
    expect(state.status).toBe("collecting");
    expect(state.slots[0]).toMatchObject({
      status: "rejected",
      rejectionReason: "전신 관절을 충분히 찾지 못했습니다.",
    });

    state = acceptedSession("basic_1_plus_1");
    state = captureSessionReducer(state, { type: "AGGREGATE_STARTED" });
    state = captureSessionReducer(state, {
      type: "AGGREGATE_RECAPTURE_REQUIRED",
      sessionGeneration: state.sessionGeneration,
      reason: "두 시점의 위상 결합 품질이 부족합니다.",
    });
    expect(state).toMatchObject({
      status: "error",
      recoveryStatus: "collecting",
      errorMessage: "두 시점의 위상 결합 품질이 부족합니다.",
    });
    state = captureSessionReducer(state, { type: "RETRY_SESSION" });
    expect(state.status).toBe("collecting");
    expect(state.profile).toBeUndefined();
  });

  it("cancels an active slot and retries without accepting its late result", () => {
    let state = collecting("basic_1_plus_1");
    state = captureSessionReducer(state, {
      type: "SLOT_ACQUIRE_STARTED",
      slotId: "front-0",
      requestId: "opaque_active_request",
      generation: 1,
    });
    state = captureSessionReducer(state, { type: "CANCEL_SESSION" });
    expect(state.status).toBe("cancelled");
    expect(state.slots[0].status).toBe("cancelled");

    const cancelled = state;
    state = captureSessionReducer(state, {
      type: "SLOT_ACCEPTED",
      slotId: "front-0",
      requestId: "opaque_active_request",
      generation: 1,
      sequence: landmarkSequence("front-0"),
    });
    expect(state).toBe(cancelled);
    state = captureSessionReducer(state, { type: "RETRY_SESSION" });
    expect(state.status).toBe("collecting");
  });

  it("cancels mode selection idempotently and retries the original mode-selection state", () => {
    const initial = createCaptureSession();
    const cancelled = captureSessionReducer(initial, { type: "CANCEL_SESSION" });
    expect(cancelled).toMatchObject({ status: "cancelled", recoveryStatus: "mode_select" });
    expect(captureSessionReducer(cancelled, { type: "CANCEL_SESSION" })).toBe(cancelled);
    expect(captureSessionReducer(cancelled, { type: "RETRY_SESSION" })).toMatchObject({
      status: "mode_select",
      recoveryStatus: undefined,
    });
  });

  it("preserves the original review recovery target when cancellation is repeated", () => {
    let state = acceptedSession("basic_1_plus_1");
    state = captureSessionReducer(state, { type: "AGGREGATE_STARTED" });
    state = captureSessionReducer(state, {
      type: "AGGREGATE_COMPLETED",
      sessionGeneration: state.sessionGeneration,
      profile: profile("basic_1_plus_1"),
      confidence: 0.6,
    });
    const cancelled = captureSessionReducer(state, { type: "CANCEL_SESSION" });
    expect(cancelled.recoveryStatus).toBe("result_review");
    expect(captureSessionReducer(cancelled, { type: "CANCEL_SESSION" })).toBe(cancelled);
  });

  it("retakes only eligible resolved slots from valid capture/review states", () => {
    const setup = createCaptureSession("basic_1_plus_1", "right");
    expect(captureSessionReducer(setup, { type: "RETAKE_SLOT", slotId: "front-0" })).toBe(setup);

    const emptyCollecting = collecting("basic_1_plus_1");
    expect(captureSessionReducer(emptyCollecting, { type: "RETAKE_SLOT", slotId: "front-0" })).toBe(emptyCollecting);

    const accepted = acceptSlot(emptyCollecting, "front-0");
    const retaken = captureSessionReducer(accepted, { type: "RETAKE_SLOT", slotId: "front-0" });
    expect(retaken.slots[0].status).toBe("empty");
  });

  it("blocks retake during saving and non-recapture errors", () => {
    let review = acceptedSession("basic_1_plus_1");
    review = captureSessionReducer(review, { type: "AGGREGATE_STARTED" });
    review = captureSessionReducer(review, {
      type: "AGGREGATE_COMPLETED",
      sessionGeneration: review.sessionGeneration,
      profile: profile("basic_1_plus_1"),
      confidence: 0.6,
    });
    const saving = captureSessionReducer(review, { type: "SAVE_STARTED" });
    expect(captureSessionReducer(saving, { type: "RETAKE_SLOT", slotId: "front-0" })).toBe(saving);
    const saveError = captureSessionReducer(saving, {
      type: "SAVE_FAILED",
      sessionGeneration: saving.sessionGeneration,
      reason: "저장 실패",
    });
    expect(captureSessionReducer(saveError, { type: "RETAKE_SLOT", slotId: "front-0" })).toBe(saveError);
  });

  it("resets slots, profile, and generations when mode or shooting hand changes", () => {
    let state = acceptSlot(collecting("basic_1_plus_1"), "front-0");
    const initialSessionGeneration = state.sessionGeneration;
    state = captureSessionReducer(state, {
      type: "SELECT_MODE",
      mode: "high_accuracy_3_plus_3",
    });
    expect(state.status).toBe("setup");
    expect(state.slots).toHaveLength(6);
    expect(state.slots.every((slot) => slot.status === "empty")).toBe(true);
    expect(state.sessionGeneration).toBe(initialSessionGeneration + 1);

    state = captureSessionReducer(state, { type: "START_COLLECTION" });
    state = acceptSlot(state, "front-0");
    state = captureSessionReducer(state, { type: "SET_SHOOTING_HAND", shootingHand: "left" });
    expect(state.status).toBe("setup");
    expect(state.shootingHand).toBe("left");
    expect(state.slots.every((slot) => slot.status === "empty")).toBe(true);
  });

  it("models save start, recoverable failure, retry, and success explicitly", () => {
    let state = acceptedSession("basic_1_plus_1");
    state = captureSessionReducer(state, { type: "AGGREGATE_STARTED" });
    state = captureSessionReducer(state, {
      type: "AGGREGATE_COMPLETED",
      sessionGeneration: state.sessionGeneration,
      profile: profile("basic_1_plus_1"),
      confidence: 0.61,
    });
    state = captureSessionReducer(state, { type: "SAVE_STARTED" });
    expect(state.status).toBe("saving");
    state = captureSessionReducer(state, {
      type: "SAVE_FAILED",
      sessionGeneration: state.sessionGeneration,
      reason: "비공개 저장을 완료하지 못했습니다.",
    });
    expect(state).toMatchObject({ status: "error", recoveryStatus: "result_review" });
    state = captureSessionReducer(state, { type: "RETRY_SESSION" });
    expect(state.status).toBe("result_review");
    state = captureSessionReducer(state, { type: "SAVE_STARTED" });
    state = captureSessionReducer(state, {
      type: "SAVE_SUCCEEDED",
      sessionGeneration: state.sessionGeneration,
      profileId: "profile_opaque_01",
    });
    expect(state.status).toBe("complete");
    expect(state.savedProfileId).toBe("profile_opaque_01");
  });

  it("ignores a late save ID from an older session generation", () => {
    let state = acceptedSession("basic_1_plus_1");
    state = captureSessionReducer(state, { type: "AGGREGATE_STARTED" });
    state = captureSessionReducer(state, {
      type: "AGGREGATE_COMPLETED",
      sessionGeneration: state.sessionGeneration,
      profile: profile("basic_1_plus_1"),
      confidence: 0.61,
    });
    state = captureSessionReducer(state, { type: "SAVE_STARTED" });
    const staleGeneration = state.sessionGeneration;
    state = captureSessionReducer(state, {
      type: "SELECT_MODE",
      mode: "high_accuracy_3_plus_3",
    });
    const newerSession = state;

    state = captureSessionReducer(state, {
      type: "SAVE_SUCCEEDED",
      sessionGeneration: staleGeneration,
      profileId: "stale_profile_id",
    });

    expect(state).toBe(newerSession);
    expect(state.savedProfileId).toBeUndefined();
  });

  it("fails closed when a matching save action carries a malformed profile ID", () => {
    let state = acceptedSession("basic_1_plus_1");
    state = captureSessionReducer(state, { type: "AGGREGATE_STARTED" });
    state = captureSessionReducer(state, {
      type: "AGGREGATE_COMPLETED",
      sessionGeneration: state.sessionGeneration,
      profile: profile("basic_1_plus_1"),
      confidence: 0.61,
    });
    state = captureSessionReducer(state, { type: "SAVE_STARTED" });
    const saving = state;

    state = captureSessionReducer(state, {
      type: "SAVE_SUCCEEDED",
      sessionGeneration: state.sessionGeneration,
      profileId: "not/a/valid/id",
    });

    expect(state).toBe(saving);
    expect(state.savedProfileId).toBeUndefined();
  });

  it("clears a saved profile ID with the other derived session state", () => {
    let state = acceptedSession("basic_1_plus_1");
    state = captureSessionReducer(state, { type: "AGGREGATE_STARTED" });
    state = captureSessionReducer(state, {
      type: "AGGREGATE_COMPLETED",
      sessionGeneration: state.sessionGeneration,
      profile: profile("basic_1_plus_1"),
      confidence: 0.61,
    });
    state = captureSessionReducer(state, { type: "SAVE_STARTED" });
    state = captureSessionReducer(state, {
      type: "SAVE_SUCCEEDED",
      sessionGeneration: state.sessionGeneration,
      profileId: "profile_to_clear",
    });

    state = captureSessionReducer(state, {
      type: "SELECT_MODE",
      mode: "high_accuracy_3_plus_3",
    });

    expect(state.savedProfileId).toBeUndefined();
    expect(state.profile).toBeUndefined();
    expect(state.confidence).toBeUndefined();
  });

  it("never stores media URI, filename, EXIF, or raw-byte fields in reducer state", () => {
    const state = acceptSlot(collecting("basic_1_plus_1"), "front-0");
    const serialized = JSON.stringify(state).toLowerCase();
    expect(serialized).not.toContain("file://");
    expect(serialized).not.toContain("filename");
    expect(serialized).not.toContain("exif");
    expect(serialized).not.toContain("rawbytes");
    expect(Object.keys(state.slots[0])).not.toContain("uri");
  });
});

describe("guided capture static integration contract", () => {
  function expectEveryPressableToBeAccessible(source: string) {
    const pressables = [...source.matchAll(/<Pressable\b[\s\S]*?<\/Pressable>/g)].map((match) => match[0]);
    expect(pressables.length).toBeGreaterThan(0);
    pressables.forEach((pressable) => {
      expect(pressable).toContain("accessibilityLabel=");
      expect(pressable).toContain('accessibilityRole="button"');
      expect(pressable).toContain("accessibilityState=");
      expect(pressable).toContain("disabled=");
      expect(pressable).toContain("<Text");
    });
  }

  it("keeps V1 behind the off branch and does not add a camera dependency", () => {
    const entry = readFileSync("components/private-pose-capture.tsx", "utf8");
    const manifest = readFileSync("package.json", "utf8");
    expect(entry).toContain("FORMPATH_FLAGS.captureV2");
    expect(entry).toContain("LegacyPrivatePoseCapture");
    expect(entry).toContain('router.push("/private-capture")');
    expect(manifest).not.toContain('"expo-camera"');
  });

  it("configures local camera recording and retains photo-library permission copy", () => {
    const config = readFileSync("app.config.ts", "utf8");
    expect(config).toContain("NSCameraUsageDescription");
    expect(config).toContain("NSPhotoLibraryUsageDescription");
    expect(config).toContain("cameraPermission");
    expect(config).toContain("기기 안에서 포즈 분석");
  });

  it("uses video-only camera/library pickers, intake validation, and scoped native analysis", () => {
    const hook = readFileSync("hooks/use-shooting-profile-capture.ts", "utf8");
    expect(hook).toContain("requestCameraPermissionsAsync");
    expect(hook).toContain("requestMediaLibraryPermissionsAsync");
    expect(hook).toContain("launchCameraAsync");
    expect(hook).toContain("launchImageLibraryAsync");
    expect(hook).toContain('mediaTypes: ["videos"]');
    expect(hook).toContain("allowsMultipleSelection: false");
    expect(hook).toContain("videoMaxDuration: 20");
    expect(hook).toContain("validateSelectedShootingVideo");
    expect(hook).toContain("detectPoseClipV2");
    expect(hook).toContain("cancelPoseClipV2");
  });

  it("admits only one same-tick capture request per slot", () => {
    const hook = readFileSync("hooks/use-shooting-profile-capture.ts", "utf8");
    const guard = hook.indexOf("if (activeRequestsRef.current.has(slotId)) return;");
    const admission = hook.indexOf("activeRequestsRef.current.set(slotId");
    expect(guard).toBeGreaterThan(-1);
    expect(admission).toBeGreaterThan(guard);
  });

  it("admits one immediate save operation and delegates matching completion and cleanup", () => {
    const hook = readFileSync("hooks/use-shooting-profile-capture.ts", "utf8");
    const admission = hook.indexOf("admitCaptureSaveOperationV2(saveInFlightRef.current");
    const guard = hook.indexOf("if (!operation) return;");
    const lock = hook.indexOf("saveInFlightRef.current = operation;");
    const run = hook.indexOf("await runCaptureSaveOperationV2({");
    expect(admission).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(admission);
    expect(lock).toBeGreaterThan(guard);
    expect(run).toBeGreaterThan(lock);
    expect(hook).toContain("captureSaveOperationMatches(");
    expect(hook).toContain('onStarted: () => dispatch({ type: "SAVE_STARTED" })');
    expect(hook).toContain("clearCaptureSaveOperationIfMatching(");
    const saveSection = hook.slice(hook.indexOf("const save = useCallback"), hook.indexOf("return {", hook.indexOf("const save = useCallback")));
    expect(saveSection).not.toMatch(/\buri\b|filename|sourceLandmarks|sequence:/);
    expect(hook).toContain("if (!captureSessionRetainsSaveToken(state.status)) {");
  });

  it("gates direct route access and has a deterministic close fallback", () => {
    const route = readFileSync("app/private-capture.tsx", "utf8");
    expect(route).toContain("FORMPATH_FLAGS.captureV2");
    expect(route).toContain('<Redirect href="/profile" />');
    expect(route).toContain("router.canGoBack()");
    expect(route).toContain('router.replace("/profile")');
  });

  it("renders honest evidence copy and accessible live status without color-only controls", () => {
    const picker = readFileSync("components/shooting-profile/capture-mode-picker.tsx", "utf8");
    const slot = readFileSync("components/shooting-profile/capture-slot-card.tsx", "utf8");
    const session = readFileSync("components/shooting-profile/capture-session.tsx", "utf8");
    const quality = readFileSync("components/shooting-profile/quality-summary.tsx", "utf8");
    const sources = [picker, slot, session, quality].join("\n");
    expect(sources).toContain("대표 스냅샷 추정 · 반복성 측정 아님");
    expect(sources).toContain("3회 반복 일치도를 확인하는 고정밀 모드");
    expect(sources).toContain("위상 결합 4D 추정 · 실측 3D 아님");
    expect(sources).toContain('accessibilityRole="button"');
    expect(sources).toContain('accessibilityLiveRegion="assertive"');
    expect(sources).toContain('accessibilityLiveRegion="polite"');
    expect(sources).toContain("minHeight: 44");
    [picker, slot, session, quality].forEach(expectEveryPressableToBeAccessible);
  });

  it("uses contrast-safe button surfaces and text in the V2 flow", () => {
    const sources = [
      readFileSync("components/shooting-profile/capture-mode-picker.tsx", "utf8"),
      readFileSync("components/shooting-profile/capture-slot-card.tsx", "utf8"),
      readFileSync("components/shooting-profile/capture-session.tsx", "utf8"),
      readFileSync("components/shooting-profile/quality-summary.tsx", "utf8"),
    ].join("\n");
    const entry = readFileSync("components/private-pose-capture.tsx", "utf8");
    const guidedEntry = entry.slice(
      entry.indexOf("function GuidedPrivatePoseCaptureEntry"),
      entry.indexOf("function LegacyPrivatePoseCapture"),
    );
    expect(sources).not.toContain('backgroundColor: "#F97316"');
    expect(sources).not.toContain('color: "#F97316"');
    expect(entry).toContain('v2Button: { alignItems: "center", backgroundColor: "#C24122"');
    expectEveryPressableToBeAccessible(guidedEntry);
  });
});
