import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { ScreenContainer } from "@/components/screen-container";
import { ANONYMOUS_POSE_REFERENCES, PLAYER_MONOCULAR_3D_ANALYSES, type PlayerMonocular3DAnalysis } from "@/lib/anonymous-pose-library";

function analysisBoundary(analysis: PlayerMonocular3DAnalysis) {
  if (analysis.state === "image_lifted_pose_estimate_not_actual_3d") return "2D image trajectory를 lift한 camera-relative 3D 추정 · 추천 제외";
  if (analysis.state === "dual_view_auto_corrected_estimate_not_actual_3d") return "정면·측면 phase를 결합한 분석용 추정 · 추천 제외";
  if (analysis.state === "dual_view_phase_aligned_estimate_not_actual_3d") return "같은 슛 단계의 view cue를 결합한 분석용 추정 · 추천 제외";
  if (analysis.state === "single_view_auto_corrected_estimate_not_actual_3d") return `${analysis.sourceView} 영상 자동 보정 분석 · 추천 제외`;
  return `${analysis.sourceView} 영상 기반 제한 depth 분석 · 추천 제외`;
}

function compactLabel(analysis: PlayerMonocular3DAnalysis) {
  if (analysis.displayName === "Stephen Curry" && analysis.state === "image_lifted_pose_estimate_not_actual_3d") return "Curry / Image 3D";
  if (analysis.displayName === "Stephen Curry" && analysis.state === "dual_view_auto_corrected_estimate_not_actual_3d") return "Curry / 보정";
  if (analysis.displayName === "Stephen Curry" && analysis.state === "dual_view_phase_aligned_estimate_not_actual_3d") return "Curry / 결합";
  if (analysis.displayName === "Stephen Curry") return "Curry / 원본 실루엣";
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
      <Text style={styles.lead}>단계 기준점 사이를 부드럽게 연결한 motion을 재생합니다. phase는 아래 marker에서 바로 확인할 수 있습니다.</Text>

      <View style={styles.selector}><Text style={styles.selectorLabel}>ANALYSIS SELECT</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>{PLAYER_MONOCULAR_3D_ANALYSES.map((analysis) => <Pressable key={analysis.id} onPress={() => setSelectedId(analysis.id)} style={({ pressed }) => [styles.chip, selected.id === analysis.id && styles.chipActive, pressed && styles.pressed]}><Text style={[styles.chipText, selected.id === analysis.id && styles.chipTextActive]}>{compactLabel(analysis)}</Text></Pressable>)}</ScrollView></View>

      <View style={styles.filmHeader}><View><Text style={styles.filmEyebrow}>ACTIVE MOTION</Text><Text style={styles.filmTitle}>{selected.displayName}</Text></View><View style={styles.viewPill}><Text style={styles.viewPillText}>{selected.sourceView.toUpperCase()}</Text></View></View>
      <View style={styles.viewerShell}><PoseMotionViewer motion={selected.motion} title={selected.shortLabel} boundary={analysisBoundary(selected)} hand={selected.shootingHand} initialCameraView="oblique" sourcePhaseTimestampsMs={selected.sourcePhaseTimestampsMs} /></View>

      <View style={styles.analysisNote}><MaterialIcons name="auto-fix-high" size={16} color="#C74B11" /><Text style={styles.analysisNoteText}>{selected.state === "image_lifted_pose_estimate_not_actual_3d" ? "MotionBERT 2D keypoint trajectory → temporal camera-relative depth lift · 분석용" : selected.autoCorrection ? "관절 방향·슛 단계 유지 · 성인 비율 길이 보정 · 분석용" : "제한 depth · "}{selected.state === "image_lifted_pose_estimate_not_actual_3d" || selected.autoCorrection ? "개인 신체 측정·실제 3D·추천에는 사용하지 않습니다." : selected.depthTreatment}</Text></View>

      <View style={styles.referenceHeader}><View><Text style={styles.referenceEyebrow}>VERIFIED REFERENCE</Text><Text style={styles.referenceTitle}>실제 3D 기준 모션</Text></View><View style={styles.verifiedBadge}><MaterialIcons name="verified" size={14} color="#1D9B77" /><Text style={styles.verifiedText}>승인됨</Text></View></View>
      <View style={styles.referenceShell}><PoseMotionViewer motion={reference.motion} title={reference.shortLabel} boundary="CMU optical-marker로 기록된 검증 실제 3D · 추천 사용 가능" hand="right" sourcePhaseFrames={reference.sourcePhaseFrames} /></View>
      <Pressable onPress={() => router.navigate("/profile" as never)} style={({ pressed }) => [styles.compareButton, pressed && styles.pressed]}><MaterialIcons name="person-outline" size={19} color="#F5F1E8" /><Text style={styles.compareText}>내 기록과 비교하기</Text></Pressable>
    </ScrollView>
  </ScreenContainer>;
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
  analysisNote: { alignItems: "center", backgroundColor: "#FFF0E8", borderRadius: 12, flexDirection: "row", gap: 7, marginTop: 10, paddingHorizontal: 11, paddingVertical: 9 },
  analysisNoteText: { color: "#8B3B19", flex: 1, fontFamily: "Barlow", fontSize: 11, lineHeight: 15 },
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
