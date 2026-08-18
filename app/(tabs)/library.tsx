import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenTitle, SectionCard, StatusPill, palette } from "@/components/formpath-ui";
import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { REFERENCE_ARCHETYPES, REFERENCE_LIBRARY_STATUS, type ReferenceArchetype } from "@/lib/reference-library";

export default function LibraryScreen() {
  const [selectedId, setSelectedId] = useState(REFERENCE_ARCHETYPES[0].id);
  const selected = REFERENCE_ARCHETYPES.find((item) => item.id === selectedId) ?? REFERENCE_ARCHETYPES[0];

  return (
    <ScreenContainer>
      <FlatList
        data={REFERENCE_ARCHETYPES}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<><ScreenTitle eyebrow="REFERENCE LIBRARY" title="이름 없는 기준" detail="특정 선수의 복제가 아닌, 설명 가능한 슛 특성만 비교합니다." /><SectionCard tone="sand"><StatusPill tone="warning">{REFERENCE_LIBRARY_STATUS.verifiedReferenceCount} VERIFIED / {REFERENCE_LIBRARY_STATUS.anonymizedLegacyProfiles} LEGACY AGGREGATES</StatusPill><Text style={styles.notice}>{REFERENCE_LIBRARY_STATUS.message}</Text></SectionCard><Text style={styles.sectionTitle}>Reference archetypes</Text></>}
        renderItem={({ item }) => <ArchetypeRow item={item} selected={item.id === selectedId} onPress={() => { setSelectedId(item.id); haptic.selection(); }} />}
        ListFooterComponent={<DetailCard archetype={selected} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

function ArchetypeRow({ item, selected, onPress }: { item: ReferenceArchetype; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}><View style={styles.rowCopy}><Text style={[styles.rowTitle, selected && styles.rowTitleSelected]}>{item.shortLabel}</Text><Text style={[styles.rowDetail, selected && styles.rowDetailSelected]}>{item.suitableFor}</Text></View><View style={[styles.dot, selected && styles.dotSelected]} /></Pressable>;
}

function DetailCard({ archetype }: { archetype: ReferenceArchetype }) {
  return <SectionCard tone="navy"><Text style={styles.detailKicker}>선택한 특성</Text><Text style={styles.detailTitle}>{archetype.shortLabel}</Text><Text style={styles.detailDescription}>{archetype.description}</Text><View style={styles.metricRow}><Metric label="릴리스" value={archetype.traits.releaseElevation} /><Metric label="확장" value={archetype.traits.armExtension} /><Metric label="하체" value={archetype.traits.lowerBodyDrive} /><Metric label="리듬" value={archetype.traits.rhythm} /></View><View style={styles.divider} /><Text style={styles.warningTitle}>연습 전 확인</Text><Text style={styles.warningText}>{archetype.caution}</Text></SectionCard>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 32 },
  notice: { color: palette.steel, fontSize: 13, lineHeight: 19 },
  sectionTitle: { color: palette.ink, fontSize: 18, fontWeight: "800", marginBottom: 12, marginTop: 22 },
  row: { alignItems: "center", backgroundColor: palette.white, borderColor: palette.mist, borderRadius: 18, borderWidth: 1, flexDirection: "row", gap: 12, padding: 15 },
  rowSelected: { backgroundColor: "#FFF0E9", borderColor: palette.orange },
  rowCopy: { flex: 1, gap: 4 },
  rowTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  rowTitleSelected: { color: "#B9421E" },
  rowDetail: { color: palette.steel, fontSize: 12, lineHeight: 17 },
  rowDetailSelected: { color: "#B86A50" },
  dot: { backgroundColor: palette.mist, borderRadius: 99, height: 10, width: 10 },
  dotSelected: { backgroundColor: palette.orange },
  detailKicker: { color: "#FFAB89", fontSize: 12, fontWeight: "800", letterSpacing: 0.9 },
  detailTitle: { color: palette.white, fontSize: 26, fontWeight: "800" },
  detailDescription: { color: "#C9D8E4", fontSize: 14, lineHeight: 21 },
  metricRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  metric: { alignItems: "center", gap: 2 },
  metricValue: { color: palette.white, fontSize: 17, fontWeight: "800" },
  metricLabel: { color: "#9FB5C6", fontSize: 11, fontWeight: "700" },
  divider: { backgroundColor: "#35526A", height: 1, marginVertical: 3 },
  warningTitle: { color: "#FFAB89", fontSize: 13, fontWeight: "800" },
  warningText: { color: "#C9D8E4", fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
});
