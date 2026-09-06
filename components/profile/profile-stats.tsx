import { StyleSheet, Text, View } from "react-native";

import { tokens } from "@/constants/tokens";

export type ProfileStat = { value: number; label: string };

/** Big number, tiny label; a dash when the vault is locked. No sentences. */
export function ProfileStats({ stats, locked }: { stats: readonly ProfileStat[]; locked: boolean }) {
  return (
    <View accessibilityRole="summary" style={styles.row}>
      {stats.map((stat) => (
        <View key={stat.label} accessible accessibilityLabel={`${stat.label} ${locked ? "잠김" : stat.value}`} style={styles.stat}>
          <Text style={styles.value}>{locked ? "—" : String(stat.value)}</Text>
          <Text style={styles.label}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 14, paddingTop: 12 },
  stat: { alignItems: "center", minWidth: 72 },
  value: { color: tokens.foreground, fontFamily: "BarlowCondensed-Bold", fontSize: 24, fontVariant: ["tabular-nums"], lineHeight: 26 },
  label: { color: tokens.mutedForeground, fontSize: 10, letterSpacing: 0.3, marginTop: 2 },
});
