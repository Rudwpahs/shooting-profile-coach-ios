import { StyleSheet, Text, View } from "react-native";

import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";

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
  value: { ...typography.stat, color: tokens.foreground },
  label: { ...typography.label, color: tokens.mutedForeground, marginTop: 2 },
});
