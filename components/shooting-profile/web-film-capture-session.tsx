import type { User } from "firebase/auth";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { CaptureSessionView, type CaptureController } from "@/components/shooting-profile/capture-session";
import { filmShotCloudSource } from "@/lib/film-shot-cloud-source";
import { markFilmShotUploaded } from "@/lib/film-space/film-shot-cloud-state";
import { saveFilmShot, type FilmShotV1 } from "@/lib/film-space/film-shots";
import { createWebFilmCaptureMachine } from "@/lib/film-space/web-film-capture-machine";
import { pickWebLocalVideo } from "@/lib/film-space/web-local-video-picker";

type WebFilmCaptureSessionProps = Readonly<{
  user: User;
  completionActionLabel: string;
  onClose: () => void;
  onComplete: (savedProfileId: string) => void;
}>;

/**
 * The capture screen for a signed-in owner in a browser, in a build that
 * opted into cloud film shots. The browser cannot analyse a pose, so the
 * clips are kept as a film shot on this device; the owner may also keep that
 * one shot in their private cloud space with the film-review switch. The
 * upload port exists only while the cloud source is available, so without it
 * this is the same device-only capture the preview shows.
 */
export function WebFilmCaptureSession({ user, completionActionLabel, onClose, onComplete }: WebFilmCaptureSessionProps) {
  const machine = useMemo(() => {
    const saved = new Map<string, FilmShotV1>();
    return createWebFilmCaptureMachine({
      pickLocalVideo: (source) => pickWebLocalVideo({ capture: source === "camera" }),
      saveFilmShot: async (clips) => {
        const shot = await saveFilmShot({ clips });
        saved.set(shot.id, shot);
        return shot.id;
      },
      ...(filmShotCloudSource.available ? {
        uploadFilmShot: async (shotId, clips) => {
          const shot = saved.get(shotId);
          if (!shot) throw new Error("the film shot must be kept on this device before it is kept in the cloud");
          const files: Record<string, Blob> = {};
          for (const clip of clips) if (clip.blob) files[clip.slotId] = clip.blob;
          await filmShotCloudSource.upload(user, { id: shot.id, title: shot.title, clips: shot.clips }, files);
          await markFilmShotUploaded(shot.id);
        },
      } : {}),
    });
  }, [user]);
  const state = useSyncExternalStore(machine.subscribe, () => machine.state, () => machine.state);

  useEffect(() => () => machine.dispose(), [machine]);

  const controller = useMemo<CaptureController>(() => ({
    state,
    canSave: machine.canSave,
    cloudKeepAvailable: machine.cloudKeepAvailable,
    cloudKeepResult: machine.cloudKeepResult,
    selectMode: machine.selectMode,
    returnToModeSelect: machine.returnToModeSelect,
    setShootingHand: machine.setShootingHand,
    startCollection: machine.startCollection,
    acquireSlot: machine.acquireSlot,
    retakeSlot: machine.retakeSlot,
    cancelSession: machine.cancelSession,
    retrySession: machine.retrySession,
    save: machine.save,
  }), [machine, state]);

  return (
    <CaptureSessionView
      completionActionLabel={completionActionLabel}
      controller={controller}
      onClose={onClose}
      onComplete={onComplete}
    />
  );
}
