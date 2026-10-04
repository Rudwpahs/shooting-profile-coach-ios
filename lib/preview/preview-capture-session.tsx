import { useEffect, useMemo, useSyncExternalStore } from "react";

import { CaptureSessionView, type CaptureController } from "@/components/shooting-profile/capture-session";
import { saveFilmShot } from "@/lib/film-space/film-shots";
import { pickWebLocalVideo } from "@/lib/film-space/web-local-video-picker";
import { createPreviewCaptureMachine } from "@/lib/preview/preview-capture-machine";

type PreviewCaptureSessionProps = Readonly<{
  completionActionLabel: string;
  onClose: () => void;
  onComplete: (savedProfileId: string) => void;
}>;

/**
 * The real capture screen with the preview's data source: the browser file
 * chooser stands in for the camera and the library, and saving keeps the
 * chosen clips as a film shot on this device, the same device-local store the
 * app uses for footage without pose analysis. Nothing leaves the browser.
 */
export function PreviewCaptureSession({ completionActionLabel, onClose, onComplete }: PreviewCaptureSessionProps) {
  const machine = useMemo(() => createPreviewCaptureMachine({
    pickLocalVideo: (source) => pickWebLocalVideo({ capture: source === "camera" }),
    saveFilmShot: async (clips) => (await saveFilmShot({ clips })).id,
  }), []);
  const state = useSyncExternalStore(machine.subscribe, () => machine.state, () => machine.state);

  useEffect(() => () => machine.dispose(), [machine]);

  const controller = useMemo<CaptureController>(() => ({
    state,
    canSave: machine.canSave,
    // The preview supplies no cloud port, so this is always false and the switch never renders.
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
