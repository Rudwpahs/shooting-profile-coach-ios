import type { CaptureController } from "@/components/shooting-profile/capture-session";
import type { FilmShotClipInputV1 } from "@/lib/film-space/film-shot-media";
import { createLocalFilmClipRef, dropLocalFilmRef, retainAcceptedLocalFilmRef } from "@/lib/film-space/local-association";
import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";
import { describeWebLocalVideoRejection, type WebLocalVideoSourceV1 } from "@/lib/film-space/web-local-video";
import type { WebLocalVideoPickResult } from "@/lib/film-space/web-local-video-picker";
import {
  captureSessionReducer,
  createCaptureSession,
  type CaptureSessionState,
} from "@/lib/shooting-profile/capture-session-reducer";
import type { CaptureProtocolV2, ShootingHandV2 } from "@/lib/shooting-profile/types";

/**
 * The preview's capture data source. It drives the unchanged capture state
 * machine, but where the device would record a clip and run on-device pose
 * detection, the browser picks a local video file and that is all the
 * evidence there is: the slot is accepted as film, the session ends in film
 * review instead of a representative profile, and saving keeps the clips as
 * one film shot on this device. No pose analysis happens here and nothing
 * leaves the browser.
 */

export type PreviewLocalVideoPick = WebLocalVideoPickResult;

export type PreviewCaptureMachinePorts = Readonly<{
  pickLocalVideo(source: "camera" | "library"): Promise<PreviewLocalVideoPick>;
  /** Keeps the clips (with their files) as a film shot and returns its id. */
  saveFilmShot(clips: readonly FilmShotClipInputV1[]): Promise<string>;
}>;

export type PreviewCaptureMachine = Omit<CaptureController, "state" | "canSave"> & Readonly<{
  readonly state: CaptureSessionState;
  readonly canSave: boolean;
  subscribe(listener: () => void): () => void;
  retainedClips(): LocalFilmClipRefV1[];
  dispose(): void;
}>;

type ActiveRequest = { requestId: string; generation: number };

export function createPreviewCaptureMachine(ports: PreviewCaptureMachinePorts): PreviewCaptureMachine {
  let state: CaptureSessionState = createCaptureSession();
  let sessionToken = 0;
  let requestCounter = 0;
  const listeners = new Set<() => void>();
  const active = new Map<string, ActiveRequest>();
  const sources = new Map<string, WebLocalVideoSourceV1>();
  const refs = new Map<string, LocalFilmClipRefV1>();
  const files = new Map<string, Blob>();

  const notify = () => {
    for (const listener of listeners) listener();
  };
  const dispatch = (action: Parameters<typeof captureSessionReducer>[1]) => {
    const next = captureSessionReducer(state, action);
    if (next === state) return;
    state = next;
    notify();
  };

  const revokeSlot = (slotId: string) => {
    sources.get(slotId)?.revoke();
    sources.delete(slotId);
    files.delete(slotId);
    dropLocalFilmRef(refs, slotId);
  };
  const revokeAll = () => {
    for (const slotId of [...sources.keys()]) revokeSlot(slotId);
    refs.clear();
    files.clear();
  };
  const invalidateSession = () => {
    sessionToken += 1;
    active.clear();
    revokeAll();
  };

  return {
    get state() {
      return state;
    },
    get canSave() {
      return state.status === "film_review";
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    retainedClips: () => [...refs.values()],

    selectMode(mode: CaptureProtocolV2) {
      invalidateSession();
      dispatch({ type: "SELECT_MODE", mode });
    },

    returnToModeSelect() {
      invalidateSession();
      dispatch({ type: "RETURN_TO_MODE_SELECT" });
    },

    setShootingHand(shootingHand: ShootingHandV2) {
      if (state.shootingHand === shootingHand) return;
      invalidateSession();
      dispatch({ type: "SET_SHOOTING_HAND", shootingHand });
    },

    startCollection() {
      dispatch({ type: "START_COLLECTION" });
    },

    async acquireSlot(slotId, source) {
      const snapshot = state;
      if (snapshot.status !== "collecting") return;
      const slot = snapshot.slots.find((candidate) => candidate.id === slotId);
      if (!slot?.enabled || slot.status === "acquiring" || slot.status === "analyzing") return;
      if (active.has(slotId)) return;

      requestCounter += 1;
      const requestId = `preview_${requestCounter.toString(36)}`;
      const generation = slot.generation + 1;
      const token = sessionToken;
      active.set(slotId, { requestId, generation });
      dispatch({ type: "SLOT_ACQUIRE_STARTED", slotId, requestId, generation });

      let pick: PreviewLocalVideoPick;
      try {
        pick = await ports.pickLocalVideo(source);
      } catch {
        pick = { status: "rejected", reason: "metadata_unavailable" };
      }

      const stillActive = token === sessionToken && active.get(slotId)?.requestId === requestId;
      if (!stillActive) {
        if (pick.status === "ready") pick.source.revoke();
        return;
      }
      active.delete(slotId);

      if (pick.status === "cancelled") {
        dispatch({ type: "SLOT_CANCELLED", slotId, requestId, generation });
        return;
      }
      if (pick.status === "rejected") {
        dispatch({ type: "SLOT_REJECTED", slotId, requestId, generation, reason: describeWebLocalVideoRejection(pick.reason) });
        return;
      }

      const clip = createLocalFilmClipRef({
        slotId,
        view: slot.view,
        takeIndex: slot.takeIndex,
        uri: pick.source.uri,
        durationMs: pick.source.durationMs,
        width: pick.source.width,
        height: pick.source.height,
      });
      if (!clip) {
        pick.source.revoke();
        dispatch({ type: "SLOT_REJECTED", slotId, requestId, generation, reason: describeWebLocalVideoRejection("metadata_unavailable") });
        return;
      }

      sources.get(slotId)?.revoke();
      sources.set(slotId, pick.source);
      if (pick.source.blob) files.set(slotId, pick.source.blob);
      else files.delete(slotId);
      retainAcceptedLocalFilmRef(refs, clip);
      // Footage is the whole evidence: the slot is accepted as film, never as a pose.
      dispatch({ type: "SLOT_FILM_ACCEPTED", slotId, requestId, generation });
    },

    retakeSlot(slotId) {
      active.delete(slotId);
      revokeSlot(slotId);
      dispatch({ type: "RETAKE_SLOT", slotId });
    },

    cancelSession() {
      invalidateSession();
      dispatch({ type: "CANCEL_SESSION" });
    },

    retrySession() {
      dispatch({ type: "RETRY_SESSION" });
    },

    async save() {
      if (state.status !== "film_review") return;
      const sessionGeneration = state.sessionGeneration;
      dispatch({ type: "SAVE_STARTED" });
      const clips: FilmShotClipInputV1[] = [...refs.values()].map((clip) => ({ ...clip, blob: files.get(clip.slotId) }));
      try {
        const shotId = await ports.saveFilmShot(clips);
        // The film shot now owns the object URLs; this machine must not revoke them.
        sources.clear();
        refs.clear();
        files.clear();
        dispatch({ type: "SAVE_SUCCEEDED", sessionGeneration, profileId: shotId });
      } catch {
        dispatch({ type: "SAVE_FAILED", sessionGeneration, reason: "브라우저 안에서 영상을 보관하지 못했습니다. 다시 시도하세요." });
      }
    },

    dispose() {
      active.clear();
      revokeAll();
      listeners.clear();
    },
  };
}
