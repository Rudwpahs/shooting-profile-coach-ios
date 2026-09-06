import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

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
 * (leading slot), what can I do here (trailing slot). Nothing else.
 */
export function TopBar({ title, wordmark, left, right }: TopBarProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.slot}>{left}{wordmark ? <Text numberOfLines={1} style={styles.wordmark}>{wordmark}</Text> : null}</View>
      {title ? <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</Text> : null}
      <View style={[styles.slot, styles.trailing]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    backgroundColor: tokens.background,
    borderBottomColor: tokens.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    height: TOP_BAR_HEIGHT,
    paddingHorizontal: 6,
  },
  slot: { alignItems: "center", flexDirection: "row", minWidth: 44 },
  trailing: { justifyContent: "flex-end", marginLeft: "auto" },
  title: { ...typography.title, color: tokens.foreground, flex: 1, position: "absolute", left: 60, right: 60, textAlign: "center" },
  wordmark: { ...typography.wordmark, color: tokens.foreground, paddingLeft: 8 },
});
