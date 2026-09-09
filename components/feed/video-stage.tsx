import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { tokens } from "@/constants/tokens";

type VideoStageProps = {
  uri: string;
  width: number;
  height: number;
  paused: boolean;
};

/**
 * The video of a public reel: looped, muted, covering the stage, with no
 * native controls, driven by the same `paused` the skeleton loops honour.
 * Motion Lift draws its skeleton above this from the packet, when there is one.
 */
export function VideoStage({ uri, width, height, paused }: VideoStageProps) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  useEffect(() => {
    try {
      if (paused) player.pause();
      else player.play();
    } catch {
      // A released player throws; the reel simply shows its last frame.
    }
  }, [paused, player]);

  return (
    <View style={[styles.stage, { width, height }]} testID="video-stage">
      <VideoView allowsFullscreen={false} allowsPictureInPicture={false} contentFit="cover" nativeControls={false} player={player} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { backgroundColor: tokens.stage, overflow: "hidden" },
});
