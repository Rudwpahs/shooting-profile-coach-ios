import { Pressable, StyleSheet, Text, View } from "react-native";

import { SkeletonGlyph } from "@/components/skeleton/skeleton-glyph";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import type { SkeletonGlyphData } from "@/lib/skeleton/pose-motion-glyph";

export type StoryItem = {
  key: string;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
} & ({ kind: "capture" } | { kind: "glyph"; glyph: SkeletonGlyphData; accent?: boolean });

const RING = 58;
const INNER = RING - 6;

/**
 * The row of circles at the top of Home: the capture action first, then the
 * skeletons that exist today (the owner's own, the anonymous reference). No
 * placeholder people.
 */
export function StoryStrip({ items }: { items: readonly StoryItem[] }) {
  return (
    <View style={styles.row}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          accessibilityLabel={item.accessibilityLabel}
          accessibilityRole="button"
          onPress={item.onPress}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        >
          <View style={[styles.ring, (item.kind === "capture" || item.accent) && styles.ringAccent]}>
            {item.kind === "capture" ? (
              <View style={styles.plus}><Text style={styles.plusText}>+</Text></View>
            ) : (
              <View style={styles.inner}>
                <SkeletonGlyph accessible={false} accessibilityLabel={item.label} data={item.glyph} ground={false} height={INNER} padding={7} width={INNER} />
              </View>
            )}
          </View>
          <Text numberOfLines={1} style={styles.label}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 14, paddingHorizontal: 14, paddingVertical: 8 },
  item: { alignItems: "center", gap: 4, minHeight: 44, minWidth: RING, width: RING + 6 },
  ring: { alignItems: "center", borderColor: tokens.border, borderRadius: RING / 2, borderWidth: 2, height: RING, justifyContent: "center", width: RING },
  ringAccent: { borderColor: tokens.primary },
  inner: { borderRadius: INNER / 2, height: INNER, overflow: "hidden", width: INNER },
  plus: { alignItems: "center", backgroundColor: tokens.primary, borderRadius: INNER / 2, height: INNER, justifyContent: "center", width: INNER },
  plusText: { color: tokens.primaryForeground, fontSize: 26, fontWeight: "800", lineHeight: 30 },
  label: { ...typography.label, color: tokens.foreground },
  pressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
});
