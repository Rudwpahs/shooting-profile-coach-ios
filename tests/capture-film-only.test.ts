import { describe, expect, it } from "vitest";

import {
  captureSessionReducer,
  createCaptureSession,
  type CaptureSessionAction,
  type CaptureSessionState,
} from "@/lib/shooting-profile/capture-session-reducer";

/**
 * A capture session whose slots hold footage but no accepted pose (the web
 * preview, or any device where pose detection is unavailable) must end in a
 * film-only review the user can save as a device-local film shot, never in
 * the two-view aggregation that needs landmark sequences.
 */

const run = (state: CaptureSessionState, ...actions: CaptureSessionAction[]) => actions.reduce(captureSessionReducer, state);

function collecting(): CaptureSessionState {
  return run(createCaptureSession(), { type: "SELECT_MODE", mode: "basic_1_plus_1" }, { type: "START_COLLECTION" });
}

function acceptFilm(state: CaptureSessionState, slotIndex: number, requestId = `r${slotIndex}`): CaptureSessionState {
  const slot = state.slots[slotIndex];
  const generation = slot.generation + 1;
  return run(
    state,
    { type: "SLOT_ACQUIRE_STARTED", slotId: slot.id, requestId, generation },
    { type: "SLOT_FILM_ACCEPTED", slotId: slot.id, requestId, generation },
  );
}

describe("film-only capture states", () => {
  it("accepts a slot as film evidence without a landmark sequence, honouring the request and generation guard", () => {
    const state = collecting();
    const front = state.slots[0];
    const stale = run(state, { type: "SLOT_FILM_ACCEPTED", slotId: front.id, requestId: "nope", generation: 1 });
    expect(stale).toBe(state);
    const next = acceptFilm(state, 0);
    expect(next.slots[0]).toMatchObject({ status: "accepted", evidence: "film", enabled: false, requestId: undefined });
    expect(next.slots[0].sequence).toBeUndefined();
    expect(next.status).toBe("collecting");
    expect(next.slots[1].enabled).toBe(true);
  });

  it("ends in film_review, not aggregation, once every slot holds film evidence", () => {
    const state = acceptFilm(acceptFilm(collecting(), 0), 1);
    expect(state.status).toBe("film_review");
    expect(state.profile).toBeUndefined();
    expect(state.slots.every((slot) => slot.status === "accepted" && slot.evidence === "film")).toBe(true);
    // Aggregation cannot start from a film review.
    expect(run(state, { type: "AGGREGATE_STARTED" })).toBe(state);
  });

  it("saves from film_review and completes with the film shot id; a failed save recovers to film_review", () => {
    const review = acceptFilm(acceptFilm(collecting(), 0), 1);
    const saving = run(review, { type: "SAVE_STARTED" });
    expect(saving.status).toBe("saving");
    const done = run(saving, { type: "SAVE_SUCCEEDED", sessionGeneration: saving.sessionGeneration, profileId: "film-shot-abc123" });
    expect(done).toMatchObject({ status: "complete", savedProfileId: "film-shot-abc123" });

    const failed = run(saving, { type: "SAVE_FAILED", sessionGeneration: saving.sessionGeneration, reason: "no" });
    expect(failed).toMatchObject({ status: "error", recoveryStatus: "film_review" });
    expect(run(failed, { type: "RETRY_SESSION" }).status).toBe("film_review");
  });

  it("lets a film review retake one clip, cancel and resume, like a pose review", () => {
    const review = acceptFilm(acceptFilm(collecting(), 0), 1);
    const retaken = run(review, { type: "RETAKE_SLOT", slotId: review.slots[0].id });
    expect(retaken.status).toBe("collecting");
    expect(retaken.slots[0]).toMatchObject({ status: "empty", evidence: undefined });
    expect(retaken.slots[1]).toMatchObject({ status: "accepted", evidence: "film" });

    const cancelled = run(review, { type: "CANCEL_SESSION" });
    expect(cancelled).toMatchObject({ status: "cancelled", recoveryStatus: "film_review" });
    expect(run(cancelled, { type: "RETRY_SESSION" }).status).toBe("film_review");
  });

  it("keeps pose sessions unchanged: pose-accepted slots still aggregate and a mixed session is film-only", () => {
    const state = collecting();
    expect(state.slots[0].evidence).toBeUndefined();
    expect(run(state, { type: "SAVE_STARTED" })).toBe(state);
    expect(run(collecting(), { type: "AGGREGATE_STARTED" }).status).toBe("collecting");
  });
});
