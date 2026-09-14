import type { PropsWithChildren, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { tokens } from "@/constants/tokens";

export function ScreenTitle({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) {
  return (
    <View style={styles.titleBlock}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

export function SectionCard({ children, tone = "light" }: PropsWithChildren<{ tone?: "light" | "navy" | "sand" }>) {
  return <View style={[styles.card, tone === "navy" && styles.navyCard, tone === "sand" && styles.sandCard]}>{children}</View>;
}

export function StatusPill({ children, tone = "neutral" }: PropsWithChildren<{ tone?: "neutral" | "warning" | "success" }>) {
  return <View style={[styles.pill, tone === "warning" && styles.warningPill, tone === "success" && styles.successPill]}><Text style={[styles.pillText, tone === "warning" && styles.warningText, tone === "success" && styles.successText]}>{children}</Text></View>;
}

export function PrimaryButton({ label, onPress, icon }: { label: string; onPress: () => void; icon?: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} accessibilityRole="button">
      <Text style={styles.primaryLabel}>{label}</Text>
      {icon}
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, destructive = false }: { label: string; onPress: () => void; destructive?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.secondaryButton, destructive && styles.destructiveButton, pressed && styles.pressed]} accessibilityRole="button">
      <Text style={[styles.secondaryLabel, destructive && styles.destructiveLabel]}>{label}</Text>
    </Pressable>
  );
}

export const palette = {
  navy: tokens.elevatedSurface,
  sand: tokens.elevatedSurface,
  orange: tokens.primary,
  teal: tokens.positive,
  steel: tokens.mutedForeground,
  mist: tokens.border,
  ink: tokens.foreground,
  white: tokens.surface,
};

const styles = StyleSheet.create({
  titleBlock: { gap: 7, marginBottom: 22 },
  eyebrow: { color: palette.orange, fontSize: 12, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { color: palette.ink, fontFamily: "BarlowCondensed-Bold", fontSize: 34, letterSpacing: -0.8, lineHeight: 40, textTransform: "uppercase" },
  detail: { color: palette.steel, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: palette.white, borderColor: palette.mist, borderRadius: 0, borderWidth: 2, padding: 18, gap: 12 },
  navyCard: { backgroundColor: palette.navy, borderColor: palette.navy },
  sandCard: { backgroundColor: palette.sand, borderColor: tokens.border },
  pill: { alignSelf: "flex-start", backgroundColor: palette.white, borderColor: palette.mist, borderRadius: 0, borderWidth: 2, paddingHorizontal: 10, paddingVertical: 5 },
  warningPill: { backgroundColor: tokens.warningSoft },
  successPill: { backgroundColor: tokens.positiveSoft },
  pillText: { color: palette.steel, fontSize: 12, fontWeight: "700" },
  warningText: { color: tokens.warning },
  successText: { color: palette.teal },
  primaryButton: { alignItems: "center", backgroundColor: palette.teal, borderRadius: 0, flexDirection: "row", justifyContent: "center", minHeight: 48, paddingHorizontal: 18, gap: 8 },
  primaryLabel: { color: palette.white, fontFamily: "BarlowCondensed-Bold", fontSize: 17, letterSpacing: 0.7, textTransform: "uppercase" },
  secondaryButton: { alignItems: "center", borderColor: palette.navy, borderRadius: 0, borderWidth: 2, justifyContent: "center", minHeight: 48, paddingHorizontal: 16 },
  destructiveButton: { borderColor: tokens.destructive },
  secondaryLabel: { color: palette.ink, fontSize: 15, fontWeight: "700" },
  destructiveLabel: { color: tokens.destructive },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
