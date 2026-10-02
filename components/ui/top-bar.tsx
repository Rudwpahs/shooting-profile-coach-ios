import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { GlassSurface } from "@/components/glass/glass-surface";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";

type TopBarProps = {
  /** Inline title, centred, or a wordmark on the leading edge. */
  title?: string;
  wordmark?: string;
  left?: ReactNode;
  right?: ReactNode;
};

export const TOP_BAR_HEIGHT = 44;

/**
 * One 44-point bar for every screen: where am I (title), how do I get out
 * (leading slot), what can I do here (trailing slot). Glass stays on the
 * chrome only; child controls retain their own accessibility semantics.
 */
export function TopBar({ title, wordmark, left, right }: TopBarProps) {
  return (
    <GlassSurface variant="bar" style={styles.bar}>
      <View style={styles.slot}>{left}{wordmark ? <Text numberOfLines={1} style={styles.wordmark}>{wordmark}</Text> : null}</View>
      {title ? <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</Text> : null}
      <View style={[styles.slot, styles.trailing]}>{right}</View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    borderBottomColor: tokens.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
    borderWidth: 0,
    flexDirection: "row",
    height: TOP_BAR_HEIGHT,
    overflow: "visible",
    paddingHorizontal: 6,
  },
  slot: { alignItems: "center", flexDirection: "row", minWidth: 44 },
  trailing: { justifyContent: "flex-end", marginLeft: "auto" },
  title: { ...typography.title, color: tokens.foreground, flex: 1, position: "absolute", left: 60, right: 60, textAlign: "center" },
  wordmark: { ...typography.wordmark, color: tokens.foreground, paddingLeft: 8 },
});
