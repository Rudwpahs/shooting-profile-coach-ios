import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { ScreenContainer } from "@/components/screen-container";
import { ANONYMOUS_POSE_LIBRARY_STATUS, PLAYER_VIDEO_POSE_CANDIDATES } from "@/lib/anonymous-pose-library";

export default function MotionStudioScreen() {
  const router = useRouter();
  const [candidateIndex, setCandidateIndex] = useState(0);
  const candidate = PLAYER_VIDEO_POSE_CANDIDATES[candidateIndex];
  const viewLabel = candidate.shortLabel.includes("OBLIQUE") ? "사선" : "정면";
  return <ScreenContainer>
    <View style={styles.background}><View style={styles.orbitOrange} /><View style={styles.orbitGreen} /></View>
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}><View><Text style={styles.eyebrow}>MOTION STUDIO</Text><Text style={styles.title}>Curry 영상 후보</Text></View><View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>VIDEO POSE</Text></View></View>
      <Text style={styles.lead}>사용자가 제공한 실제 Curry 슬로모션에서 추출한 33-landmark 상대 pose입니다. 단계 오른쪽 시간은 원본 영상 timestamp이며, 3D metric model·추천 reference로는 아직 승인되지 않았습니다.</Text>
      <View style={styles.candidateSelector} accessibilityRole="tablist">
        {PLAYER_VIDEO_POSE_CANDIDATES.map((item, index) => {
          const label = item.shortLabel.includes("OBLIQUE") ? "사선 영상" : "정면 영상";
          const selected = index === candidateIndex;
          return <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setCandidateIndex(index)} style={({ pressed }) => [styles.candidateTab, selected && styles.candidateTabSelected, pressed && styles.pressed]}><Text style={[styles.candidateTabText, selected && styles.candidateTabTextSelected]}>{label}</Text></Pressable>;
        })}
      </View>
      <View style={styles.viewerWrap}><PoseMotionViewer motion={candidate.motion} title={candidate.playerDisplayName} boundary="Stephen Curry 실제 영상 기반 단일 시점 relative pose 후보입니다. camera depth·신체 치수·calibrated 3D를 주장하지 않으며, 승인된 CMU optical motion과 별개입니다." hand="right" sourcePhaseTimestampsMs={candidate.sourcePhaseTimestampsMs} /></View>
      <View style={styles.sourceCard}><View style={styles.sourceIcon}><MaterialIcons name="videocam" size={20} color="#EA580C" /></View><View style={styles.sourceTextWrap}><Text style={styles.sourceTitle}>Curry {viewLabel} 영상 후보 · 검토 중</Text><Text style={styles.sourceCopy}>{candidate.sourceAttribution}</Text></View></View>
      <View style={styles.cmuNote}><Text style={styles.cmuNoteTitle}>승인된 실제 3D {ANONYMOUS_POSE_LIBRARY_STATUS.profileCount}개는 Library에서 별도로 유지됩니다.</Text><Text style={styles.cmuNoteCopy}>현재 Curry 후보는 recommendation과 approved actual 3D count에 포함되지 않습니다.</Text></View>
      <Pressable onPress={() => router.navigate("/profile" as never)} style={({ pressed }) => [styles.compareButton, pressed && styles.pressed]}><MaterialIcons name="person-outline" size={18} color="#FFFFFF" /><Text style={styles.compareText}>내 스켈레톤과 비교하기</Text></Pressable>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  background: { backgroundColor: "#EEF4F8", bottom: 0, left: 0, overflow: "hidden", position: "absolute", right: 0, top: 0 }, orbitOrange: { backgroundColor: "rgba(249,115,22,0.10)", borderRadius: 220, height: 330, position: "absolute", right: -165, top: -110, width: 330 }, orbitGreen: { backgroundColor: "rgba(22,163,74,0.08)", borderRadius: 180, bottom: 110, height: 250, left: -150, position: "absolute", width: 250 },
  page: { alignSelf: "center", maxWidth: 760, paddingBottom: 118, paddingHorizontal: 16, paddingTop: 22, width: "100%" }, topRow: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, eyebrow: { color: "#F97316", fontFamily: "BarlowCondensed-Bold", fontSize: 13, letterSpacing: 2 }, title: { color: "#102C46", fontFamily: "BarlowCondensed-Bold", fontSize: 46, letterSpacing: -0.7, lineHeight: 48, marginTop: 4 }, live: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.78)", borderColor: "rgba(255,255,255,0.96)", borderRadius: 20, borderWidth: 1, flexDirection: "row", gap: 6, marginTop: 6, paddingHorizontal: 10, paddingVertical: 7 }, liveDot: { backgroundColor: "#EA580C", borderRadius: 99, height: 7, width: 7 }, liveText: { color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 0.8 }, lead: { color: "#61738A", fontFamily: "Barlow", fontSize: 14, lineHeight: 21, marginTop: 10 }, candidateSelector: { flexDirection: "row", gap: 8, marginTop: 14 }, candidateTab: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.72)", borderColor: "#D6E0EA", borderRadius: 14, borderWidth: 1, flex: 1, minHeight: 40, justifyContent: "center", paddingHorizontal: 10 }, candidateTabSelected: { backgroundColor: "#FFF7ED", borderColor: "#F97316", borderWidth: 2 }, candidateTabText: { color: "#61738A", fontFamily: "BarlowCondensed-Bold", fontSize: 14 }, candidateTabTextSelected: { color: "#C2410C" }, viewerWrap: { marginTop: 12 }, sourceCard: { alignItems: "flex-start", backgroundColor: "rgba(255,255,255,0.72)", borderColor: "rgba(255,255,255,0.96)", borderRadius: 20, borderWidth: 1, flexDirection: "row", gap: 10, marginTop: 14, padding: 14 }, sourceIcon: { alignItems: "center", backgroundColor: "#FFF7ED", borderRadius: 14, height: 34, justifyContent: "center", width: 34 }, sourceTextWrap: { flex: 1 }, sourceTitle: { color: "#102C46", fontFamily: "BarlowCondensed-Bold", fontSize: 18 }, sourceCopy: { color: "#61738A", fontFamily: "Barlow", fontSize: 12, lineHeight: 17, marginTop: 2 }, cmuNote: { backgroundColor: "rgba(240,253,244,0.72)", borderColor: "#BBF7D0", borderRadius: 16, borderWidth: 1, marginTop: 12, padding: 12 }, cmuNoteTitle: { color: "#166534", fontFamily: "BarlowCondensed-Bold", fontSize: 14 }, cmuNoteCopy: { color: "#4B6857", fontFamily: "Barlow", fontSize: 11, lineHeight: 16, marginTop: 3 }, compareButton: { alignItems: "center", alignSelf: "stretch", backgroundColor: "#F97316", borderRadius: 18, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 14, minHeight: 50 }, compareText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 16, letterSpacing: 0.3 }, pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
