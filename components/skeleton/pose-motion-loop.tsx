import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, AppState, type AppStateStatus } from "react-native";

import {
  createRepresentativePlaybackLifecycle,
  resolveRepresentativePlayback,
  transitionRepresentativePlaybackLifecycle,
  type RepresentativePlaybackLifecycleEvent,
} from "@/components/shooting-profile/sequence-viewer";
import { SkeletonGlyph } from "@/components/skeleton/skeleton-glyph";
import type { PoseMotion } from "@/lib/pose-motion";
import { glyphBounds, poseMotionGlyph, type GlyphHand, type GlyphView } from "@/lib/skeleton/pose-motion-glyph";

const LOOP_MS = 1850;
const RELEASE_PROGRESS = 0.75;
const BOUNDS_SAMPLES = 24;

type PoseMotionLoopProps = {
  motion: PoseMotion;
  view: GlyphView;
  hand?: GlyphHand;
  width: number;
  height: number;
  accessibilityLabel: string;
  /** Held on the release still while true (a viewer tapped the stage). */
  paused?: boolean;
};

/**
 * Feed loop for an anonymous reference motion: interpolates the audited five
 * phases over a short cycle, under the same lifecycle rules as every other
 * loop (background pause, Reduce Motion holds the release still).
 */
export function PoseMotionLoop({ motion, view, hand = "right", width, height, accessibilityLabel, paused = false }: PoseMotionLoopProps) {
  const [progress, setProgress] = useState(RELEASE_PROGRESS);
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

  const bounds = useMemo(() => glyphBounds(
    Array.from({ length: BOUNDS_SAMPLES }, (_, index) => poseMotionGlyph(motion, { view, hand, progress: index / (BOUNDS_SAMPLES - 1) }).points),
  ), [motion, view, hand]);
  const glyph = useMemo(() => poseMotionGlyph(motion, { view, hand, progress }), [motion, view, hand, progress]);

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
      setProgress(RELEASE_PROGRESS);
      return;
    }
    let start: number | null = null;
    const tick = (time: number) => {
      if (start === null) start = time - RELEASE_PROGRESS * LOOP_MS;
      const current = lifecycleRef.current;
      const mayAdvance = resolveRepresentativePlayback({
        appState: current.appState,
        intent: current.intent,
        reducedMotion: current.reducedMotion ?? true,
      });
      if (mayAdvance) setProgress(((time - start) % LOOP_MS) / LOOP_MS);
      animationFrame.current = requestAnimationFrame(tick);
    };
    animationFrame.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    };
  }, [isPlaying]);

  return (
    <SkeletonGlyph
      accessibilityLabel={accessibilityLabel}
      bounds={bounds}
      data={glyph}
      height={height}
      padding={Math.round(Math.min(width, height) * 0.08)}
      width={width}
    />
  );
}
