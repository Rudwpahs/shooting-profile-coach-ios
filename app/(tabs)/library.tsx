import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { ScreenContainer } from "@/components/screen-container";
import { ANONYMOUS_POSE_LIBRARY_STATUS, ANONYMOUS_POSE_REFERENCES, type AnonymousPoseReference } from "@/lib/anonymous-pose-library";

export default function LibraryScreen() {
  const [selectedId, setSelectedId] = useState(ANONYMOUS_POSE_REFERENCES[0].id);
  const selected = ANONYMOUS_POSE_REFERENCES.find((item) => item.id === selectedId) ?? ANONYMOUS_POSE_REFERENCES[0];
  return <ScreenContainer><FlatList data={ANONYMOUS_POSE_REFERENCES} keyExtractor={(item) => item.id} contentContainerStyle={styles.page} ListHeaderComponent={<><Text style={styles.eyebrow}>SHOOTING FORM ANALYSIS</Text><Text style={styles.title}>익명 참조 모션</Text><Text style={styles.detail}>원본의 player skeleton 영역을 실명 없는 16개 생체역학 참조 애니메이션으로 대체합니다.</Text><View style={styles.status}><Text style={styles.statusText}>{ANONYMOUS_POSE_LIBRARY_STATUS.profileCount} SUMMARY-DERIVED REFERENCE ANIMATIONS</Text></View><Text style={styles.sectionTitle}>SELECTED MOTION</Text><PoseMotionViewer reference={selected} /><Text style={styles.sectionTitle}>MATCH LIST</Text></>} renderItem={({ item, index }) => <MotionRow item={item} index={index} selected={item.id === selectedId} onPress={() => setSelectedId(item.id)} />} ItemSeparatorComponent={() => <View style={{ height: 8 }} />} ListFooterComponent={<Text style={styles.boundary}>원본 영상 요약 지표로 표현 범위만 조절한 참조 애니메이션입니다. 특정 선수의 실명·3D 복제·검증된 3D 계측값으로 해석하지 않습니다.</Text>} showsVerticalScrollIndicator={false} /></ScreenContainer>;
}

function MotionRow({ item, index, selected, onPress }: { item: AnonymousPoseReference; index: number; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}><View style={styles.rowCopy}><Text style={styles.rowTitle}>{String(index + 1).padStart(2, "0")} · {item.shortLabel}</Text><Text style={styles.rowDetail}>{item.styleTitle}</Text></View><Text style={styles.rowState}>{selected ? "VIEWING" : "POSE"}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", maxWidth: 960, padding: 20, paddingBottom: 44, width: "100%" }, eyebrow: { color: "#EA580C", fontFamily: "BarlowCondensed-Bold", fontSize: 13, letterSpacing: 2 }, title: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 44, letterSpacing: -0.5, marginTop: 6, textTransform: "uppercase" }, detail: { color: "#64748B", fontFamily: "Barlow", fontSize: 15, lineHeight: 22, marginTop: 7 }, status: { alignSelf: "flex-start", backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderWidth: 2, marginTop: 14, paddingHorizontal: 10, paddingVertical: 6 }, statusText: { color: "#64748B", fontFamily: "Barlow-SemiBold", fontSize: 11, letterSpacing: 0.3 }, sectionTitle: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 20, letterSpacing: 1, marginBottom: 9, marginTop: 24 }, row: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderWidth: 2, flexDirection: "row", gap: 12, padding: 13 }, rowSelected: { backgroundColor: "#FFF7ED", borderColor: "#F97316" }, rowCopy: { flex: 1 }, rowTitle: { color: "#0F172A", fontFamily: "BarlowCondensed-Bold", fontSize: 19, letterSpacing: 0.4 }, rowDetail: { color: "#64748B", fontFamily: "Barlow", fontSize: 12, marginTop: 1 }, rowState: { color: "#64748B", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 0.6 }, boundary: { color: "#64748B", fontFamily: "Barlow", fontSize: 12, lineHeight: 18, marginTop: 18 }, pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
