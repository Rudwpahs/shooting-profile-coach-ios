import { Animated, StyleSheet, View } from "react-native";

import { REEL_STAGE_VIEW, type ReelStageFit } from "@/components/feed/reel-stage-fit";
import { PoseMotionLoop } from "@/components/skeleton/pose-motion-loop";
import { SkeletonGlyph } from "@/components/skeleton/skeleton-glyph";
import { SkeletonLoop } from "@/components/skeleton/skeleton-loop";
import { tokens } from "@/constants/tokens";
import type { ReelMediaRole } from "@/lib/feed/reel-feed-state";
import type { ReelItem } from "@/lib/feed/reel-model";

type ReelStageProps = {
  item: ReelItem;
  fit: ReelStageFit;
  width: number;
  height: number;
  role: ReelMediaRole;
  paused: boolean;
  /** Yaw of a lifted still; `null` shows the loop (or its paused release still). */
  liftYaw: number | null;
  /** 0 (resting) to 1 (held): dims the ground and lifts the figure. */
  lift: Animated.Value;
};

/**
 * The media of one Reel. Only the active item mounts a loop; a neighbour
 * holds the release still so the swipe lands on a figure, and anything
 * further away holds nothing. Loop, still and lifted still share one fit so
 * the figure never jumps between them.
 */
export function ReelStage({ item, fit, width, height, role, paused, liftYaw, lift }: ReelStageProps) {
  const padding = Math.round(Math.min(width, height) * 0.08);

  if (role === "idle") {
    return <View style={[styles.stage, { width, height }]} testID="reel-stage-idle" />;
  }

  if (role === "adjacent") {
    return (
      <View style={[styles.stage, { width, height }]} testID="reel-stage-still">
        <SkeletonGlyph accessible={false} accessibilityLabel="" bounds={fit.bounds} confidence={fit.confidence} data={fit.still} height={height} padding={padding} width={width} />
      </View>
    );
  }

  const halo = Math.round(Math.min(width, height) * 0.92);
  return (
    <View style={[styles.stage, { width, height }]} testID="reel-stage-active">
      <Animated.View style={[styles.dim, { opacity: lift }]} />
      <Animated.View
        style={[
          styles.halo,
          { borderRadius: halo / 2, height: halo, left: Math.round((width - halo) / 2), top: Math.round((height - halo) / 2), width: halo },
          { opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }) },
        ]}
      />
      <Animated.View style={{ transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }}>
        {liftYaw === null ? (
          item.motion.source === "representative" ? (
            <SkeletonLoop
              accessibilityLabel=""
              bounds={fit.bounds}
              confidence={fit.confidence}
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
              bounds={fit.bounds}
              hand={item.motion.hand}
              height={height}
              motion={item.motion.motion}
              paused={paused}
              view={REEL_STAGE_VIEW}
              width={width}
            />
          )
        ) : (
          <View testID="reel-stage-lifted">
            <SkeletonGlyph accessible={false} accessibilityLabel="" bounds={fit.bounds} confidence={fit.confidence} data={fit.glyphAtYaw(liftYaw)} height={height} padding={padding} width={width} />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { backgroundColor: tokens.stage, overflow: "hidden" },
  // The ground darkens under a held figure so the figure reads as lifted.
  dim: { backgroundColor: tokens.background, bottom: 0, left: 0, pointerEvents: "none", position: "absolute", right: 0, top: 0 },
  halo: { backgroundColor: tokens.primarySoft, borderColor: tokens.primary, borderWidth: StyleSheet.hairlineWidth, pointerEvents: "none", position: "absolute" },
});
