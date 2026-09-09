import { Animated, StyleSheet, Text, View } from "react-native";

import { REEL_STAGE_VIEW, type ReelStageFit } from "@/components/feed/reel-stage-fit";
import { VideoStage } from "@/components/feed/video-stage";
import { PoseMotionLoop } from "@/components/skeleton/pose-motion-loop";
import { SkeletonGlyph } from "@/components/skeleton/skeleton-glyph";
import { SkeletonLoop } from "@/components/skeleton/skeleton-loop";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import type { ReelMediaRole } from "@/lib/feed/reel-feed-state";
import type { ReelItem } from "@/lib/feed/reel-model";

type ReelStageProps = {
  item: ReelItem;
  /** `null` when the reel has no skeleton at all (video-only or media-less public post). */
  fit: ReelStageFit | null;
  width: number;
  height: number;
  role: ReelMediaRole;
  paused: boolean;
  /** Yaw of a lifted still; `null` shows the loop (or its paused release still). */
  liftYaw: number | null;
  /** 0 (resting) to 1 (held): dims the ground and lifts the figure. */
  lift: Animated.Value;
  /** Joints to ring on the lifted still: where the coach cue points. */
  highlightJoints?: readonly string[];
};

const MEDIA_PENDING = "미디어 준비 중";

/**
 * The media of one Reel. Only the active item mounts a loop or a video; a
 * neighbour holds the release still so the swipe lands on a figure, and
 * anything further away holds nothing. Loop, still and lifted still share one
 * fit so the figure never jumps between them. A public post plays its video
 * first; the packet, when there is one, only appears under a hold.
 */
export function ReelStage({ item, fit, width, height, role, paused, liftYaw, lift, highlightJoints }: ReelStageProps) {
  const padding = Math.round(Math.min(width, height) * 0.08);
  const media = item.motion;

  if (role === "idle") {
    return <View style={[styles.stage, { width, height }]} testID="reel-stage-idle" />;
  }

  if (role === "adjacent") {
    return (
      <View style={[styles.stage, { width, height }]} testID="reel-stage-still">
        {fit ? (
          <SkeletonGlyph accessible={false} accessibilityLabel="" bounds={fit.bounds} confidence={fit.confidence} data={fit.still} height={height} padding={padding} width={width} />
        ) : null}
      </View>
    );
  }

  const halo = Math.round(Math.min(width, height) * 0.92);
  const video = media.source === "public" && media.video ? media.video.uri : null;
  const playing = video ? (
    <VideoStage height={height} paused={paused} uri={video} width={width} />
  ) : media.source === "representative" && fit ? (
    <SkeletonLoop accessibilityLabel="" bounds={fit.bounds} confidence={fit.confidence} height={height} paused={paused} profile={media.profile} shootingHand={media.shootingHand} view={REEL_STAGE_VIEW} width={width} />
  ) : media.source === "public" && fit ? (
    <SkeletonLoop accessibilityLabel="" bounds={fit.bounds} confidence={fit.confidence} height={height} paused={paused} profile={fit.sequence} shootingHand={fit.shootingHand} view={REEL_STAGE_VIEW} width={width} />
  ) : media.source === "reference" ? (
    <PoseMotionLoop accessibilityLabel="" bounds={fit?.bounds} hand={media.hand} height={height} motion={media.motion} paused={paused} view={REEL_STAGE_VIEW} width={width} />
  ) : (
    <View style={[styles.placeholder, { width, height }]} testID="reel-stage-placeholder">
      <Text style={styles.placeholderText}>{MEDIA_PENDING}</Text>
    </View>
  );

  return (
    <View style={[styles.stage, { width, height }]} testID="reel-stage-active">
      {video ? playing : null}
      <Animated.View style={[styles.dim, { opacity: lift }]} />
      <Animated.View
        style={[
          styles.halo,
          { borderRadius: halo / 2, height: halo, left: Math.round((width - halo) / 2), top: Math.round((height - halo) / 2), width: halo },
          { opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }) },
        ]}
      />
      <Animated.View style={[video ? styles.overlay : null, { transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }]}>
        {liftYaw !== null && fit ? (
          <View testID="reel-stage-lifted">
            <SkeletonGlyph accessible={false} accessibilityLabel="" bounds={fit.bounds} confidence={fit.confidence} data={fit.glyphAtYaw(liftYaw)} height={height} highlightJoints={highlightJoints} padding={padding} width={width} />
          </View>
        ) : video ? null : playing}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { backgroundColor: tokens.stage, overflow: "hidden" },
  // The ground darkens under a held figure so the figure reads as lifted.
  dim: { backgroundColor: tokens.background, bottom: 0, left: 0, pointerEvents: "none", position: "absolute", right: 0, top: 0 },
  halo: { backgroundColor: tokens.primarySoft, borderColor: tokens.primary, borderWidth: StyleSheet.hairlineWidth, pointerEvents: "none", position: "absolute" },
  overlay: { left: 0, position: "absolute", top: 0 },
  placeholder: { alignItems: "center", justifyContent: "center" },
  placeholderText: { ...typography.callout, color: tokens.mutedForeground },
});
