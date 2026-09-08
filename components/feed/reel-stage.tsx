import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { PoseMotionLoop } from "@/components/skeleton/pose-motion-loop";
import { representativeConfidence, representativeGlyph, representativeReleaseFrameIndex, representativeSequenceBounds } from "@/components/skeleton/representative-glyph";
import { SkeletonGlyph } from "@/components/skeleton/skeleton-glyph";
import { SkeletonLoop } from "@/components/skeleton/skeleton-loop";
import type { ReelMediaRole } from "@/lib/feed/reel-feed-state";
import type { ReelItem } from "@/lib/feed/reel-model";
import { tokens } from "@/constants/tokens";
import { glyphBounds, poseMotionGlyph } from "@/lib/skeleton/pose-motion-glyph";

/** The feed shows every motion from the oblique view; a held rotate starts from it. */
export const REEL_STAGE_VIEW = "oblique" as const;
const RELEASE_PROGRESS = 0.75;
const BOUNDS_SAMPLES = 24;

type ReelStageProps = {
  item: ReelItem;
  width: number;
  height: number;
  role: ReelMediaRole;
  paused: boolean;
};

/**
 * The media of one Reel. Only the active item mounts a loop; a neighbour holds
 * the release still so the swipe lands on a figure, and anything further away
 * holds nothing. The still and the loop share one fit so the figure does not
 * jump when the loop takes over.
 */
export function ReelStage({ item, width, height, role, paused }: ReelStageProps) {
  const padding = Math.round(Math.min(width, height) * 0.08);
  const still = useMemo(() => {
    if (item.motion.source === "representative") {
      const { profile, shootingHand } = item.motion;
      return {
        bounds: representativeSequenceBounds(profile, REEL_STAGE_VIEW, shootingHand),
        glyph: representativeGlyph(profile.frames[representativeReleaseFrameIndex(profile)], REEL_STAGE_VIEW, shootingHand),
        confidence: representativeConfidence(profile),
      };
    }
    const { motion, hand } = item.motion;
    return {
      bounds: glyphBounds(Array.from({ length: BOUNDS_SAMPLES }, (_, index) => (
        poseMotionGlyph(motion, { view: REEL_STAGE_VIEW, hand, progress: index / (BOUNDS_SAMPLES - 1) }).points
      ))),
      glyph: poseMotionGlyph(motion, { view: REEL_STAGE_VIEW, hand, progress: RELEASE_PROGRESS }),
      confidence: "basic" as const,
    };
  }, [item.motion]);

  if (role === "idle") {
    return <View style={[styles.stage, { width, height }]} testID="reel-stage-idle" />;
  }

  if (role === "adjacent") {
    return (
      <View style={[styles.stage, { width, height }]} testID="reel-stage-still">
        <SkeletonGlyph
          accessible={false}
          accessibilityLabel=""
          bounds={still.bounds}
          confidence={still.confidence}
          data={still.glyph}
          height={height}
          padding={padding}
          width={width}
        />
      </View>
    );
  }

  return (
    <View style={[styles.stage, { width, height }]} testID="reel-stage-active">
      {item.motion.source === "representative" ? (
        <SkeletonLoop
          accessibilityLabel=""
          confidence={still.confidence}
          height={height}
          paused={paused}
          profile={item.motion.profile}
          shootingHand={item.motion.shootingHand}
          view={REEL_STAGE_VIEW}
          width={width}
        />
      ) : (
        <PoseMotionLoop
          accessibilityLabel=""
          hand={item.motion.hand}
          height={height}
          motion={item.motion.motion}
          paused={paused}
          view={REEL_STAGE_VIEW}
          width={width}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { backgroundColor: tokens.stage, overflow: "hidden" },
});
