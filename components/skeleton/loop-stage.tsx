import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { tokens } from "@/constants/tokens";

type LoopStageProps = {
  width: number;
  height: number;
  /** What the stage shows; receives whether the viewer paused it. */
  children: (paused: boolean) => ReactNode;
  accessibilityLabel: string;
};

/**
 * A feed stage that behaves like a video post: tap to pause, tap to resume,
 * a play glyph only while paused. The tap target is the whole stage.
 */
export function LoopStage({ width, height, children, accessibilityLabel }: LoopStageProps) {
  const [paused, setPaused] = useState(false);
  return (
    <View style={{ width, height }}>
      {children(paused)}
      <Pressable
        accessibilityLabel={`${accessibilityLabel} ${paused ? "재생" : "일시정지"}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: false }}
        onPress={() => setPaused((value) => !value)}
        style={({ pressed }) => [styles.tap, pressed && styles.pressed]}
      >
        {paused ? (
          <View style={styles.glyph}>
            <MaterialCommunityIcons name="play" size={28} color={tokens.stageForeground} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tap: { alignItems: "center", bottom: 0, justifyContent: "center", left: 0, position: "absolute", right: 0, top: 0 },
  glyph: { alignItems: "center", backgroundColor: tokens.elevatedSurface, borderColor: tokens.border, borderRadius: 30, borderWidth: 1, height: 60, justifyContent: "center", opacity: 0.94, paddingLeft: 4, width: 60 },
  pressed: { opacity: 0.92 },
});
