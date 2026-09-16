import { Animated, StyleSheet, View } from "react-native";

import { tokens } from "@/constants/tokens";

/** Height of the progress line at the bottom of a Reel. */
export const REEL_PROGRESS_HEIGHT = 2;

type ReelProgressProps = {
  /** 0 … 1 loop fraction, written by the player every frame. */
  progress: Animated.Value;
  width: number;
  /** Distance from the bottom edge: the home indicator inset plus a small gap. */
  bottom: number;
};

/**
 * A very thin line that fills with the loop. Driven by an animated value so
 * the frame clock never re-renders the chrome.
 */
export function ReelProgress({ progress, width, bottom }: ReelProgressProps) {
  const fillWidth = progress.interpolate({ inputRange: [0, 1], outputRange: [0, width], extrapolate: "clamp" });
  return (
    <View pointerEvents="none" style={[styles.track, { bottom, width }]} testID="reel-progress">
      <Animated.View style={[styles.fill, { width: fillWidth }]} testID="reel-progress-fill" />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: tokens.border, height: REEL_PROGRESS_HEIGHT, left: 0, position: "absolute" },
  fill: { backgroundColor: tokens.primary, height: REEL_PROGRESS_HEIGHT },
});
