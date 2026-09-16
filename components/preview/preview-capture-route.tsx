import { useRouter } from "expo-router";
import { useMemo, useState } from "react";

import {
  CaptureSessionView,
  type CaptureController,
} from "@/components/shooting-profile/capture-session";
import { usePreviewRuntime } from "@/lib/preview/preview-runtime-provider";

type PreviewCapturePhase = "setup" | "collecting" | "review";

/**
 * Deterministic, synthetic capture walkthrough for Pages. It reuses the real
 * CaptureSessionView but never opens a camera, persists data, or contacts an
 * account service.
 */
export function PreviewCaptureRoute() {
  const router = useRouter();
  const { capture, addCapturedRepresentative } = usePreviewRuntime();
  const [phase, setPhase] = useState<PreviewCapturePhase>("setup");

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/" as never);
  };

  const state = phase === "review"
    ? capture?.review
    : phase === "collecting"
      ? capture?.collecting
      : capture?.setup;

  const controller = useMemo<CaptureController | null>(() => {
    if (!state) return null;
    return {
      state,
      canSave: phase === "review",
      selectMode: () => setPhase("setup"),
      returnToModeSelect: () => setPhase("setup"),
      setShootingHand: () => undefined,
      startCollection: () => setPhase("collecting"),
      acquireSlot: () => setPhase("review"),
      retakeSlot: () => setPhase("collecting"),
      cancelSession: () => setPhase("setup"),
      retrySession: () => setPhase("setup"),
      save: () => {
        const profileId = addCapturedRepresentative();
        if (profileId) router.replace(`/private-analysis/${profileId}` as never);
      },
    };
  }, [addCapturedRepresentative, phase, router, state]);

  if (!controller) return null;

  return (
    <CaptureSessionView
      completionActionLabel="저장된 대표 슛폼 열기"
      controller={controller}
      onClose={close}
      onComplete={(profileId) => router.replace(`/private-analysis/${profileId}` as never)}
    />
  );
}
