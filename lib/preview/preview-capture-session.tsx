import { useEffect, useMemo, useSyncExternalStore } from "react";

import { CaptureSessionView, type CaptureController } from "@/components/shooting-profile/capture-session";
import { saveLocalFilmAssociation } from "@/lib/film-space/local-association";
import { pickWebLocalVideo } from "@/lib/film-space/web-local-video-picker";
import { createPreviewCaptureMachine } from "@/lib/preview/preview-capture-machine";
import { buildPreviewData } from "@/lib/preview/preview-runtime";

type PreviewCaptureSessionProps = Readonly<{
  completionActionLabel: string;
  onClose: () => void;
  onComplete: (savedProfileId: string) => void;
}>;

/**
 * The real capture screen with the preview's data source: the browser file
 * chooser stands in for the camera and the library, and saving associates
 * the chosen local clips with the preview profile for Analysis → Film.
 */
export function PreviewCaptureSession({ completionActionLabel, onClose, onComplete }: PreviewCaptureSessionProps) {
  const machine = useMemo(() => createPreviewCaptureMachine({
    data: buildPreviewData(),
    pickLocalVideo: (source) => pickWebLocalVideo({ capture: source === "camera" }),
    saveAssociation: (profileId, clips) => saveLocalFilmAssociation(profileId, clips),
  }), []);
  const state = useSyncExternalStore(machine.subscribe, () => machine.state, () => machine.state);

  useEffect(() => () => machine.dispose(), [machine]);

  const controller = useMemo<CaptureController>(() => ({
    state,
    canSave: machine.canSave,
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
