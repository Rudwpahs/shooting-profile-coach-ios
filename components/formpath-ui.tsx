import type { PropsWithChildren, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
  navy: "#0B1F33",
  sand: "#F7F2E8",
  orange: "#F05A28",
  teal: "#1F8A7A",
  steel: "#54708C",
  mist: "#D8E1E8",
  ink: "#112131",
  white: "#FFFFFF",
};

const styles = StyleSheet.create({
  titleBlock: { gap: 7, marginBottom: 22 },
  eyebrow: { color: palette.orange, fontSize: 12, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { color: palette.ink, fontSize: 34, fontWeight: "800", letterSpacing: -0.8, lineHeight: 40 },
  detail: { color: palette.steel, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: palette.white, borderColor: palette.mist, borderRadius: 22, borderWidth: 1, padding: 18, gap: 12 },
  navyCard: { backgroundColor: palette.navy, borderColor: palette.navy },
  sandCard: { backgroundColor: palette.sand, borderColor: "#EEE4D3" },
  pill: { alignSelf: "flex-start", backgroundColor: "#EAF0F5", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  warningPill: { backgroundColor: "#FFF0E9" },
  successPill: { backgroundColor: "#E4F5F0" },
  pillText: { color: palette.steel, fontSize: 12, fontWeight: "700" },
  warningText: { color: "#B9421E" },
  successText: { color: palette.teal },
  primaryButton: { alignItems: "center", backgroundColor: palette.orange, borderRadius: 16, flexDirection: "row", justifyContent: "center", minHeight: 54, paddingHorizontal: 18, gap: 8 },
  primaryLabel: { color: palette.white, fontSize: 16, fontWeight: "800" },
  secondaryButton: { alignItems: "center", borderColor: palette.mist, borderRadius: 15, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 16 },
  destructiveButton: { borderColor: "#F7C9BC" },
  secondaryLabel: { color: palette.ink, fontSize: 15, fontWeight: "700" },
  destructiveLabel: { color: "#C24122" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
