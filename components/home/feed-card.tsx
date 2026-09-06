import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { SkeletonConfidence } from "@/components/skeleton/skeleton-glyph";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export type FeedAction = { icon: IconName; label: string; onPress: () => void };

type FeedCardProps = {
  title: string;
  meta?: string;
  stage: ReactNode;
  actions: readonly FeedAction[];
  /** One line. The bold lead is optional; the rest stays plain. */
  captionLead?: string;
  caption: string;
  confidence?: SkeletonConfidence;
};

const BAND: Record<SkeletonConfidence, string> = { high: "High", basic: "Basic", recapture: "재촬영" };

/**
 * One feed post: a one-line header, the stage, an icon-only action row with
 * an optional confidence dot, and a single caption line.
 */
export function FeedCard({ title, meta, stage, actions, captionLead, caption, confidence }: FeedCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text numberOfLines={1} style={styles.title}>{title}</Text>
        {meta ? <Text numberOfLines={1} style={styles.meta}> · {meta}</Text> : null}
      </View>
      {stage}
      <View style={styles.actions}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            accessibilityLabel={action.label}
            accessibilityRole="button"
            onPress={action.onPress}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name={action.icon} size={24} color={tokens.foreground} />
          </Pressable>
        ))}
        {confidence ? (
          <View accessible accessibilityLabel={`신뢰도 밴드 ${BAND[confidence]}`} style={styles.band}>
            <View style={[styles.dot, confidence === "high" && styles.dotHigh, confidence === "recapture" && styles.dotRecapture]} />
            <Text style={styles.bandText}>{BAND[confidence]}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.caption}>
        {captionLead ? <Text style={styles.captionLead}>{captionLead} </Text> : null}
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 8 },
  head: { alignItems: "center", flexDirection: "row", minHeight: 36, paddingHorizontal: 14 },
  title: { ...typography.headline, color: tokens.foreground },
  meta: { ...typography.caption, color: tokens.mutedForeground },
  actions: { alignItems: "center", flexDirection: "row", gap: 4, paddingHorizontal: 6, paddingTop: 2 },
  action: { alignItems: "center", height: 44, justifyContent: "center", minHeight: 44, minWidth: 44, width: 44 },
  band: { alignItems: "center", flexDirection: "row", gap: 6, marginLeft: "auto", paddingRight: 10 },
  dot: { backgroundColor: tokens.mutedForeground, borderRadius: 4, height: 8, width: 8 },
  dotHigh: { backgroundColor: tokens.analysisHighConfidence },
  dotRecapture: { backgroundColor: tokens.warning },
  bandText: { ...typography.label, color: tokens.mutedForeground },
  caption: { ...typography.callout, color: tokens.foreground, paddingHorizontal: 14, paddingTop: 2 },
  captionLead: { fontWeight: "700" },
  pressed: { opacity: 0.5 },
});
