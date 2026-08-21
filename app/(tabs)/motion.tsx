import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { ScreenContainer } from "@/components/screen-container";
import { ANONYMOUS_POSE_REFERENCES, PLAYER_MONOCULAR_3D_ANALYSES, type PlayerMonocular3DAnalysis } from "@/lib/anonymous-pose-library";

function analysisBoundary(analysis: PlayerMonocular3DAnalysis) {
  if (analysis.state === "dual_view_auto_corrected_estimate_not_actual_3d") return "정면·측면 phase를 결합한 분석용 추정 · 추천 제외";
  if (analysis.state === "dual_view_phase_aligned_estimate_not_actual_3d") return "같은 슛 단계의 view cue를 결합한 분석용 추정 · 추천 제외";
  if (analysis.state === "single_view_auto_corrected_estimate_not_actual_3d") return `${analysis.sourceView} 영상 자동 보정 분석 · 추천 제외`;
  return `${analysis.sourceView} 영상 기반 제한 depth 분석 · 추천 제외`;
}

function compactLabel(analysis: PlayerMonocular3DAnalysis) {
  if (analysis.displayName === "Stephen Curry" && analysis.state === "dual_view_auto_corrected_estimate_not_actual_3d") return "Curry / 보정";
  if (analysis.displayName === "Stephen Curry" && analysis.state === "dual_view_phase_aligned_estimate_not_actual_3d") return "Curry / 결합";
  if (analysis.displayName === "Stephen Curry") return "Curry / 정면";
  return "Paul George / 보정";
}

export default function MotionStudioScreen() {
  const router = useRouter();
  const initial = PLAYER_MONOCULAR_3D_ANALYSES.find((analysis) => analysis.state === "dual_view_auto_corrected_estimate_not_actual_3d") ?? PLAYER_MONOCULAR_3D_ANALYSES[0];
  const [selectedId, setSelectedId] = useState(initial?.id ?? "");
  const selected = PLAYER_MONOCULAR_3D_ANALYSES.find((analysis) => analysis.id === selectedId) ?? initial;
  const reference = ANONYMOUS_POSE_REFERENCES[0];
  if (!selected) return null;

  return <ScreenContainer containerClassName="bg-background">
    <View style={styles.canvas}><View style={styles.arc} /><View style={styles.trackLine} /></View>
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><Text style={styles.kicker}>FORMPATH / FILM ROOM</Text><Text style={styles.title}>모션 랩</Text></View><View style={styles.analysisBadge}><MaterialIcons name="visibility" size={14} color="#C74B11" /><Text style={styles.analysisBadgeText}>분석용</Text></View></View>
      <Text style={styles.lead}>최종 보정 analysis를 선택해 다섯 단계 슛폼을 확인하세요. 검증된 실제 3D는 아래 reference에 따로 표시됩니다.</Text>

      <View style={styles.selector}><Text style={styles.selectorLabel}>ANALYSIS SELECT</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>{PLAYER_MONOCULAR_3D_ANALYSES.map((analysis) => <Pressable key={analysis.id} onPress={() => setSelectedId(analysis.id)} style={({ pressed }) => [styles.chip, selected.id === analysis.id && styles.chipActive, pressed && styles.pressed]}><Text style={[styles.chipText, selected.id === analysis.id && styles.chipTextActive]}>{compactLabel(analysis)}</Text></Pressable>)}</ScrollView></View>

      <View style={styles.filmHeader}><View><Text style={styles.filmEyebrow}>ACTIVE MOTION</Text><Text style={styles.filmTitle}>{selected.displayName}</Text></View><View style={styles.viewPill}><Text style={styles.viewPillText}>{selected.sourceView.toUpperCase()}</Text></View></View>
      <View style={styles.viewerShell}><PoseMotionViewer motion={selected.motion} title={selected.shortLabel} boundary={analysisBoundary(selected)} hand="right" sourcePhaseTimestampsMs={selected.sourcePhaseTimestampsMs} /></View>

      <View style={styles.metaGrid}>
        <MetaTile icon="timeline" label="SOURCE PHASE" value={`${selected.sourcePhaseTimestampsMs?.[0] ?? 0}–${selected.sourcePhaseTimestampsMs?.[4] ?? 0}ms`} />
        <MetaTile icon="auto-fix-high" label="CORRECTION" value={selected.autoCorrection ? "적용됨" : "제한 depth"} />
      </View>
      <View style={styles.boundaryRow}><MaterialIcons name="info-outline" size={18} color="#C74B11" /><Text style={styles.boundaryCopy}>{selected.depthTreatment}</Text></View>
      {selected.autoCorrection ? <View style={styles.correctionRow}><Text style={styles.rowKicker}>AUTO CORRECTION</Text><Text style={styles.rowCopy}>{selected.autoCorrection}</Text></View> : null}
      {selected.formMatch ? <View style={styles.formCard}><View style={styles.formHead}><Text style={styles.rowKicker}>SOURCE MATCH</Text><Text style={styles.formCount}>{selected.formMatch.filter((check) => check.status === "match").length}/{selected.formMatch.length}</Text></View>{selected.formMatch.map((check) => <View key={check.id} style={styles.checkRow}><View style={[styles.checkDot, check.status === "match" ? styles.checkDotMatch : check.status === "review" ? styles.checkDotReview : styles.checkDotUnknown]} /><View style={styles.checkCopy}><Text style={styles.checkLabel}>{check.label}</Text><Text style={styles.checkDetail}>{check.status === "match" ? "영상에서 확인" : check.status === "review" ? "추가 검토" : "확인 불가"}</Text></View></View>)}</View> : null}

      <View style={styles.referenceHeader}><View><Text style={styles.referenceEyebrow}>VERIFIED REFERENCE</Text><Text style={styles.referenceTitle}>실제 3D 기준 모션</Text></View><View style={styles.verifiedBadge}><MaterialIcons name="verified" size={14} color="#1D9B77" /><Text style={styles.verifiedText}>승인됨</Text></View></View>
      <View style={styles.referenceShell}><PoseMotionViewer motion={reference.motion} title={reference.shortLabel} boundary="CMU optical-marker로 기록된 검증 실제 3D · 추천 사용 가능" hand="right" sourcePhaseFrames={reference.sourcePhaseFrames} /></View>
      <Pressable onPress={() => router.navigate("/profile" as never)} style={({ pressed }) => [styles.compareButton, pressed && styles.pressed]}><MaterialIcons name="person-outline" size={19} color="#F5F1E8" /><Text style={styles.compareText}>내 기록과 비교하기</Text></Pressable>
    </ScrollView>
  </ScreenContainer>;
}

function MetaTile({ icon, label, value }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string; value: string }) {
  return <View style={styles.metaTile}><MaterialIcons name={icon} size={18} color="#F97316" /><View><Text style={styles.metaLabel}>{label}</Text><Text style={styles.metaValue}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  canvas: { backgroundColor: "#F5F1E8", bottom: 0, left: 0, overflow: "hidden", position: "absolute", right: 0, top: 0 },
  arc: { borderColor: "rgba(16,34,53,0.08)", borderRadius: 270, borderWidth: 1, height: 390, position: "absolute", right: -225, top: -156, width: 390 },
  trackLine: { backgroundColor: "rgba(29,155,119,0.35)", height: 1, left: 0, position: "absolute", top: 148, width: 74 },
  page: { alignSelf: "center", maxWidth: 760, paddingBottom: 116, paddingHorizontal: 16, paddingTop: 20, width: "100%" },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  kicker: { color: "#F97316", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 1.7 },
  title: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 45, letterSpacing: -1.1, lineHeight: 49, marginTop: 2 },
  analysisBadge: { alignItems: "center", backgroundColor: "#FFF0E8", borderRadius: 12, flexDirection: "row", gap: 5, paddingHorizontal: 9, paddingVertical: 6 },
  analysisBadgeText: { color: "#C74B11", fontFamily: "BarlowCondensed-Bold", fontSize: 11, letterSpacing: 0.7 },
  lead: { color: "#667789", fontFamily: "Barlow", fontSize: 14, lineHeight: 20, marginTop: 11 },
  selector: { marginTop: 21 },
  selectorLabel: { color: "#667789", fontFamily: "BarlowCondensed-Bold", fontSize: 11, letterSpacing: 1.1 },
  chipRow: { gap: 8, paddingTop: 9 },
  chip: { backgroundColor: "#FFFEFA", borderColor: "#D9E0E4", borderRadius: 13, borderWidth: 1, minHeight: 38, paddingHorizontal: 12, justifyContent: "center" },
  chipActive: { backgroundColor: "#102235", borderColor: "#102235" },
  chipText: { color: "#667789", fontFamily: "BarlowCondensed-Bold", fontSize: 13 },
  chipTextActive: { color: "#F5F1E8" },
  filmHeader: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginTop: 25 },
  filmEyebrow: { color: "#F97316", fontFamily: "BarlowCondensed-Bold", fontSize: 11, letterSpacing: 1.2 },
  filmTitle: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 29, marginTop: 1 },
  viewPill: { backgroundColor: "#E8F6F1", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5 },
  viewPillText: { color: "#167359", fontFamily: "BarlowCondensed-Bold", fontSize: 10, letterSpacing: 0.8 },
  viewerShell: { marginTop: 10 },
  metaGrid: { flexDirection: "row", gap: 10, marginTop: 10 },
  metaTile: { alignItems: "center", backgroundColor: "#FFFEFA", borderColor: "#D9E0E4", borderRadius: 15, borderWidth: 1, flex: 1, flexDirection: "row", gap: 8, minHeight: 58, paddingHorizontal: 10 },
  metaLabel: { color: "#667789", fontFamily: "BarlowCondensed-Bold", fontSize: 9, letterSpacing: 0.8 },
  metaValue: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 13, marginTop: 1 },
  boundaryRow: { alignItems: "flex-start", backgroundColor: "#FFF0E8", borderLeftColor: "#F97316", borderLeftWidth: 3, flexDirection: "row", gap: 8, marginTop: 10, padding: 12 },
  boundaryCopy: { color: "#8B3B19", flex: 1, fontFamily: "Barlow", fontSize: 12, lineHeight: 17 },
  correctionRow: { backgroundColor: "#EAF1F7", borderRadius: 15, marginTop: 10, padding: 12 },
  rowKicker: { color: "#F97316", fontFamily: "BarlowCondensed-Bold", fontSize: 10, letterSpacing: 1.1 },
  rowCopy: { color: "#33495D", fontFamily: "Barlow", fontSize: 12, lineHeight: 17, marginTop: 3 },
  formCard: { backgroundColor: "#FFFEFA", borderColor: "#D9E0E4", borderRadius: 16, borderWidth: 1, marginTop: 10, padding: 13 },
  formHead: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  formCount: { color: "#1D9B77", fontFamily: "BarlowCondensed-Bold", fontSize: 14 },
  checkRow: { alignItems: "center", borderTopColor: "#E7EDF1", borderTopWidth: 1, flexDirection: "row", gap: 9, marginTop: 10, paddingTop: 10 },
  checkDot: { borderRadius: 99, height: 8, width: 8 },
  checkDotMatch: { backgroundColor: "#1D9B77" },
  checkDotReview: { backgroundColor: "#F97316" },
  checkDotUnknown: { backgroundColor: "#9AA8B5" },
  checkCopy: { flex: 1 },
  checkLabel: { color: "#102235", fontFamily: "Barlow-SemiBold", fontSize: 13 },
  checkDetail: { color: "#667789", fontFamily: "Barlow", fontSize: 11, marginTop: 1 },
  referenceHeader: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginTop: 29 },
  referenceEyebrow: { color: "#1D9B77", fontFamily: "BarlowCondensed-Bold", fontSize: 11, letterSpacing: 1.1 },
  referenceTitle: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 29, marginTop: 1 },
  verifiedBadge: { alignItems: "center", backgroundColor: "#E8F6F1", borderRadius: 12, flexDirection: "row", gap: 5, paddingHorizontal: 8, paddingVertical: 5 },
  verifiedText: { color: "#167359", fontFamily: "BarlowCondensed-Bold", fontSize: 10 },
  referenceShell: { marginTop: 10 },
  compareButton: { alignItems: "center", backgroundColor: "#102235", borderRadius: 16, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 12, minHeight: 50 },
  compareText: { color: "#F5F1E8", fontFamily: "BarlowCondensed-Bold", fontSize: 16, letterSpacing: 0.35 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
