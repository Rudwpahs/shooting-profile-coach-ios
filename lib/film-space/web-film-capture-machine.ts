import type { CaptureController, CaptureSaveOptions } from "@/components/shooting-profile/capture-session";
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
 * The browser's capture data source. It drives the unchanged capture state
 * machine, but where the device would record a clip and run on-device pose
 * detection, the browser picks a local video file and that is all the
 * evidence there is: the slot is accepted as film, the session ends in film
 * review instead of a representative profile, and saving keeps the clips as
 * one film shot on this device. No pose analysis happens here.
 *
 * Keeping the shot in the owner's cloud space as well is optional twice over:
 * the build has to supply an upload port, and the owner has to ask for it on
 * this save. The device save always comes first, and a failed upload never
 * loses it.
 */

export type WebFilmCapturePorts = Readonly<{
  pickLocalVideo(source: "camera" | "library"): Promise<WebLocalVideoPickResult>;
  /** Keeps the clips (with their files) as a film shot on this device and returns its id. */
  saveFilmShot(clips: readonly FilmShotClipInputV1[]): Promise<string>;
  /** Present only when this build and this owner can keep footage in the cloud. The clips carry their files. */
  uploadFilmShot?(shotId: string, clips: readonly FilmShotClipInputV1[]): Promise<void>;
}>;

export type WebFilmCloudKeepResult = "none" | "uploaded" | "failed";

export type WebFilmCaptureMachine = Omit<CaptureController, "state" | "canSave" | "cloudKeepAvailable" | "cloudKeepResult"> & Readonly<{
  readonly state: CaptureSessionState;
  readonly canSave: boolean;
  readonly cloudKeepAvailable: boolean;
  readonly cloudKeepResult: WebFilmCloudKeepResult;
  subscribe(listener: () => void): () => void;
  retainedClips(): LocalFilmClipRefV1[];
  dispose(): void;
}>;

type ActiveRequest = { requestId: string; generation: number };

export function createWebFilmCaptureMachine(ports: WebFilmCapturePorts): WebFilmCaptureMachine {
  let state: CaptureSessionState = createCaptureSession();
  let sessionToken = 0;
  let requestCounter = 0;
  let cloudKeepResult: WebFilmCloudKeepResult = "none";
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
    cloudKeepResult = "none";
  };

  return {
    get state() {
      return state;
    },
    get canSave() {
      return state.status === "film_review";
    },
    get cloudKeepAvailable() {
      return ports.uploadFilmShot !== undefined;
    },
    get cloudKeepResult() {
      return cloudKeepResult;
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
      const requestId = `web_film_${requestCounter.toString(36)}`;
      const generation = slot.generation + 1;
      const token = sessionToken;
      active.set(slotId, { requestId, generation });
      dispatch({ type: "SLOT_ACQUIRE_STARTED", slotId, requestId, generation });

      let pick: WebLocalVideoPickResult;
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

    async save(options?: CaptureSaveOptions) {
      if (state.status !== "film_review") return;
      const sessionGeneration = state.sessionGeneration;
      dispatch({ type: "SAVE_STARTED" });
      const clips: FilmShotClipInputV1[] = [...refs.values()].map((clip) => ({ ...clip, blob: files.get(clip.slotId) }));
      let shotId: string;
      try {
        shotId = await ports.saveFilmShot(clips);
      } catch {
        dispatch({ type: "SAVE_FAILED", sessionGeneration, reason: "브라우저 안에서 영상을 보관하지 못했습니다. 다시 시도하세요." });
        return;
      }
      // The film shot now owns the object URLs; this machine must not revoke them.
      sources.clear();
      refs.clear();
      files.clear();
      // Device first, cloud second and only on request: a failed upload is reported, never a lost shot.
      cloudKeepResult = "none";
      if (options?.cloud === true && ports.uploadFilmShot) {
        try {
          await ports.uploadFilmShot(shotId, clips);
          cloudKeepResult = "uploaded";
        } catch {
          cloudKeepResult = "failed";
        }
      }
      dispatch({ type: "SAVE_SUCCEEDED", sessionGeneration, profileId: shotId });
    },

    dispose() {
      active.clear();
      revokeAll();
      listeners.clear();
    },
  };
}
