import { useEffect, useMemo, useRef, useState } from "react";
import type { Animated } from "react-native";

import type { RepresentativeViewId } from "@/components/shooting-profile/sequence-viewer";
import { representativeConfidence, representativeGlyph, representativeSequenceBounds } from "@/components/skeleton/representative-glyph";
import { SkeletonGlyph, type SkeletonConfidence } from "@/components/skeleton/skeleton-glyph";
import type { ReelItem } from "@/lib/reels/reel-model";
import {
  REEL_LAST_FRAME,
  advanceReelFrameClock,
  createReelFrameClock,
  reelFrameIntervalMs,
  reelProgress,
  reelStartFrame,
  type ReelFrameClock,
} from "@/lib/reels/reel-playback";
import { glyphBounds, poseMotionGlyph, type GlyphBounds, type SkeletonGlyphData } from "@/lib/skeleton/pose-motion-glyph";

const BOUNDS_SAMPLES = 24;

/** Confidence as form (band and dashing), never as a number. */
export function reelConfidence(item: ReelItem): SkeletonConfidence {
  return item.kind === "profile" ? representativeConfidence(item.profile) : "basic";
}

/** One fit per Reel and view: the loop, the neighbour still and the paused frame share it, so the figure never jumps. */
export function reelStageBounds(item: ReelItem, view: RepresentativeViewId): GlyphBounds {
  if (item.kind === "profile") return representativeSequenceBounds(item.profile, view, item.shootingHand);
  const { motion } = item.reference;
  return glyphBounds(Array.from({ length: BOUNDS_SAMPLES }, (_, index) => poseMotionGlyph(motion, { view, progress: index / (BOUNDS_SAMPLES - 1) }).points));
}

/** The glyph of one frame on the shared 101-step grid. */
export function reelFrameGlyph(item: ReelItem, view: RepresentativeViewId, frame: number): SkeletonGlyphData {
  if (item.kind === "profile") {
    const index = Math.max(0, Math.min(item.profile.frames.length - 1, Math.round(frame)));
    return representativeGlyph(item.profile.frames[index], view, item.shootingHand);
  }
  return poseMotionGlyph(item.reference.motion, { view, progress: reelProgress(frame) });
}

/** The release still a neighbour shows and the active Reel starts from. */
export function reelStillGlyph(item: ReelItem, view: RepresentativeViewId): SkeletonGlyphData {
  return reelFrameGlyph(item, view, reelStartFrame(item));
}

export function reelStagePadding(width: number, height: number): number {
  return Math.round(Math.min(width, height) * 0.08);
}

type ReelMotionPlayerProps = {
  item: ReelItem;
  view: RepresentativeViewId;
  width: number;
  height: number;
  /** Advances only while true; holds the current frame otherwise (no reset). */
  playing: boolean;
  /** Written every frame with the loop fraction, for the progress line. */
  progress: Animated.Value;
  startFrame: number;
};

/**
 * The active Reel's motion. A frame clock advances by elapsed time on the
 * stored grid (100 → 0 wraps), pauses hold the frame, and the projection
 * for the profile's 101 phases is computed once per view for this item
 * only; neighbours never run it.
 */
export function ReelMotionPlayer({ item, view, width, height, playing, progress, startFrame }: ReelMotionPlayerProps) {
  const clockRef = useRef<ReelFrameClock>(createReelFrameClock(startFrame));
  const [frame, setFrame] = useState(startFrame);
  const interval = reelFrameIntervalMs(item);

  // A different Reel starts from its own release still.
  const itemRef = useRef(item.id);
  useEffect(() => {
    if (itemRef.current === item.id) return;
    itemRef.current = item.id;
    clockRef.current = createReelFrameClock(startFrame);
    setFrame(startFrame);
    progress.setValue(reelProgress(startFrame));
  }, [item.id, progress, startFrame]);

  useEffect(() => {
    if (!playing) return;
    let last: number | null = null;
    let handle: number | null = null;
    const tick = (time: number) => {
      if (last !== null) {
        const next = advanceReelFrameClock(clockRef.current, time - last, interval);
        if (next !== clockRef.current) {
          const changed = next.frame !== clockRef.current.frame;
          clockRef.current = next;
          if (changed) {
            setFrame(next.frame);
            progress.setValue(reelProgress(next.frame));
          }
        }
      }
      last = time;
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      if (handle !== null) cancelAnimationFrame(handle);
    };
  }, [interval, playing, progress]);

  const bounds = useMemo(() => reelStageBounds(item, view), [item, view]);
  const profileGlyphs = useMemo(
    () => (item.kind === "profile" ? item.profile.frames.map((candidate) => representativeGlyph(candidate, view, item.shootingHand)) : null),
    [item, view],
  );
  const glyph = useMemo(() => {
    if (profileGlyphs) return profileGlyphs[Math.max(0, Math.min(REEL_LAST_FRAME, frame))];
    return reelFrameGlyph(item, view, frame);
  }, [frame, item, profileGlyphs, view]);

  return (
    <SkeletonGlyph
      accessible={false}
      accessibilityLabel=""
      bounds={bounds}
      confidence={reelConfidence(item)}
      data={glyph}
      height={height}
      padding={reelStagePadding(width, height)}
      width={width}
    />
  );
}
