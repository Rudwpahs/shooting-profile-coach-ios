import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, AppState, type AppStateStatus } from "react-native";

import {
  advanceRepresentativeFrameIndex,
  createRepresentativePlaybackLifecycle,
  resolveRepresentativePlayback,
  transitionRepresentativePlaybackLifecycle,
  type RepresentativePlaybackLifecycleEvent,
  type RepresentativeViewId,
} from "@/components/shooting-profile/sequence-viewer";
import { representativeGlyph, representativeReleaseFrameIndex, representativeSequenceBounds } from "@/components/skeleton/representative-glyph";
import { SkeletonGlyph, type SkeletonConfidence } from "@/components/skeleton/skeleton-glyph";
import type { RepresentativePose4DV2, ShootingHandV2 } from "@/lib/shooting-profile/types";

const FRAME_INTERVAL_MS = 40;

type SkeletonLoopProps = {
  profile: RepresentativePose4DV2;
  shootingHand: ShootingHandV2;
  view: RepresentativeViewId;
  width: number;
  height: number;
  confidence: SkeletonConfidence;
  accessibilityLabel: string;
  /** Held on the release still while true (a viewer tapped the stage). */
  paused?: boolean;
};

/**
 * The identity loop: plays the stored 101 phases at 40 ms per frame with the
 * same lifecycle rules as the analysis viewer (pauses in the background,
 * holds the release-proxy frame under Reduce Motion). Purely visual; it never
 * exposes controls, so anything interactive lives in the parent.
 */
export function SkeletonLoop({ profile, shootingHand, view, width, height, confidence, accessibilityLabel, paused = false }: SkeletonLoopProps) {
  const releaseIndex = useMemo(() => representativeReleaseFrameIndex(profile), [profile]);
  const [frameIndex, setFrameIndex] = useState(releaseIndex);
  const [lifecycle, setLifecycle] = useState(createRepresentativePlaybackLifecycle);
  const lifecycleRef = useRef(lifecycle);
  const animationFrame = useRef<number | null>(null);

  const applyLifecycleEvent = useCallback((event: RepresentativePlaybackLifecycleEvent) => {
    const next = transitionRepresentativePlaybackLifecycle(lifecycleRef.current, event);
    lifecycleRef.current = next;
    setLifecycle(next);
  }, []);

  const isPlaying = resolveRepresentativePlayback({
    appState: lifecycle.appState,
    intent: lifecycle.intent,
    reducedMotion: lifecycle.reducedMotion ?? true,
  });

  const bounds = useMemo(() => representativeSequenceBounds(profile, view, shootingHand), [profile, view, shootingHand]);
  const glyphs = useMemo(
    () => profile.frames.map((frame) => representativeGlyph(frame, view, shootingHand)),
    [profile, view, shootingHand],
  );

  useEffect(() => {
    const reconcile = (nextState: AppStateStatus) => applyLifecycleEvent({ type: "app-state", value: nextState });
    const subscription = AppState.addEventListener("change", reconcile);
    reconcile(AppState.currentState);
    return () => subscription?.remove?.();
  }, [applyLifecycleEvent]);

  useEffect(() => {
    let mounted = true;
    const update = (enabled: boolean) => {
      if (mounted) applyLifecycleEvent({ type: "reduced-motion", value: enabled });
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => {
      if (mounted) applyLifecycleEvent({ type: "reduced-motion", value: true });
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", update);
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, [applyLifecycleEvent]);

  useEffect(() => {
    setFrameIndex(releaseIndex);
    applyLifecycleEvent({ type: "profile" });
  }, [applyLifecycleEvent, profile, releaseIndex]);

  // Only a change of the viewer's own tap moves the intent; mounting leaves
  // autoplay to the Reduce Motion resolution.
  const pausedRef = useRef(paused);
  useEffect(() => {
    if (pausedRef.current === paused) return;
    pausedRef.current = paused;
    applyLifecycleEvent({ type: paused ? "pause" : "explicit-play" });
  }, [applyLifecycleEvent, paused]);

  useEffect(() => {
    if (!isPlaying) {
      setFrameIndex(releaseIndex);
      return;
    }
    let lastTime: number | null = null;
    let elapsed = 0;
    const tick = (time: number) => {
      if (lastTime !== null) elapsed += Math.max(0, time - lastTime);
      lastTime = time;
      const current = lifecycleRef.current;
      const mayAdvance = resolveRepresentativePlayback({
        appState: current.appState,
        intent: current.intent,
        reducedMotion: current.reducedMotion ?? true,
      });
      if (mayAdvance && elapsed >= FRAME_INTERVAL_MS) {
        elapsed %= FRAME_INTERVAL_MS;
        setFrameIndex((index) => advanceRepresentativeFrameIndex(index));
      }
      animationFrame.current = requestAnimationFrame(tick);
    };
    animationFrame.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    };
  }, [isPlaying, releaseIndex]);

  const glyph = glyphs[Math.max(0, Math.min(glyphs.length - 1, frameIndex))];

  return (
    <SkeletonGlyph
      accessibilityLabel={accessibilityLabel}
      bounds={bounds}
      confidence={confidence}
      data={glyph}
      height={height}
      padding={Math.round(Math.min(width, height) * 0.08)}
      width={width}
    />
  );
}
