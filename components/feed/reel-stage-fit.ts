import {
  representativeConfidence,
  representativeGlyph,
  representativeGlyphAtYaw,
  representativeReleaseFrameIndex,
  representativeSequenceBounds,
  representativeViewYaw,
} from "@/components/skeleton/representative-glyph";
import type { SkeletonConfidence } from "@/components/skeleton/skeleton-glyph";
import type { ReelItem } from "@/lib/feed/reel-model";
import { glyphBounds, poseMotionGlyph, poseMotionViewYaw, type GlyphBounds, type SkeletonGlyphData } from "@/lib/skeleton/pose-motion-glyph";

/** The feed shows every motion from the oblique view; a held rotate starts from it. */
export const REEL_STAGE_VIEW = "oblique" as const;
const RELEASE_PROGRESS = 0.75;
const LOOP_SAMPLES = 24;
const YAW_SAMPLES = 12;

/**
 * One fit per Reel, shared by the loop, the neighbour still and the lifted,
 * rotated still: the same bounds everywhere means the figure never jumps
 * when the loop pauses, when the hold begins, or while it turns.
 */
export type ReelStageFit = {
  bounds: GlyphBounds;
  /** The yaw the Reel plays in and a rotate starts from. */
  baseYaw: number;
  confidence: SkeletonConfidence;
  /** The release still at the base yaw. */
  still: SkeletonGlyphData;
  /** The release still at any yaw in degrees. */
  glyphAtYaw: (yaw: number) => SkeletonGlyphData;
};

function union(a: GlyphBounds, b: GlyphBounds): GlyphBounds {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function boundsAcrossYaw(loop: GlyphBounds, glyphAtYaw: (yaw: number) => SkeletonGlyphData, baseYaw: number): GlyphBounds {
  const turned = glyphBounds(Array.from({ length: YAW_SAMPLES }, (_, index) => glyphAtYaw(baseYaw + (index * 360) / YAW_SAMPLES).points));
  return union(loop, turned);
}

export function buildReelStageFit(item: ReelItem): ReelStageFit {
  if (item.motion.source === "representative") {
    const { profile, shootingHand } = item.motion;
    const frame = profile.frames[representativeReleaseFrameIndex(profile)];
    const baseYaw = representativeViewYaw(REEL_STAGE_VIEW, shootingHand);
    const glyphAtYaw = (yaw: number) => representativeGlyphAtYaw(frame, yaw, shootingHand);
    return {
      bounds: boundsAcrossYaw(representativeSequenceBounds(profile, REEL_STAGE_VIEW, shootingHand), glyphAtYaw, baseYaw),
      baseYaw,
      confidence: representativeConfidence(profile),
      still: representativeGlyph(frame, REEL_STAGE_VIEW, shootingHand),
      glyphAtYaw,
    };
  }
  const { motion, hand } = item.motion;
  const baseYaw = poseMotionViewYaw(motion, REEL_STAGE_VIEW, hand);
  const glyphAtYaw = (yaw: number) => poseMotionGlyph(motion, { hand, yaw, progress: RELEASE_PROGRESS });
  const loop = glyphBounds(Array.from({ length: LOOP_SAMPLES }, (_, index) => (
    poseMotionGlyph(motion, { view: REEL_STAGE_VIEW, hand, progress: index / (LOOP_SAMPLES - 1) }).points
  )));
  return {
    bounds: boundsAcrossYaw(loop, glyphAtYaw, baseYaw),
    baseYaw,
    confidence: "basic",
    still: poseMotionGlyph(motion, { view: REEL_STAGE_VIEW, hand, progress: RELEASE_PROGRESS }),
    glyphAtYaw,
  };
}
