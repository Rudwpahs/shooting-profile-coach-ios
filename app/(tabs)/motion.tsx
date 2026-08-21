import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { ScreenContainer } from "@/components/screen-container";
import { ANONYMOUS_POSE_LIBRARY_STATUS, ANONYMOUS_POSE_REFERENCES, PLAYER_VIDEO_REVIEW_RECORDS } from "@/lib/anonymous-pose-library";

export default function MotionStudioScreen() {
  const router = useRouter();
  const reference = ANONYMOUS_POSE_REFERENCES[0];
  return <ScreenContainer>
    <View style={styles.background}><View style={styles.orbitOrange} /><View style={styles.orbitGreen} /></View>
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}><View><Text style={styles.eyebrow}>MOTION STUDIO</Text><Text style={styles.title}>검증된 3D 모션</Text></View><View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>OPTICAL 3D</Text></View></View>
      <Text style={styles.lead}>회전·확대 가능한 3D는 실제 optical-marker motion만 표시합니다. 현재 Curry 단일 영상 landmark는 물리 3D가 아니므로 이 viewer에서 철회했습니다.</Text>
      <View style={styles.viewerWrap}><PoseMotionViewer motion={reference.motion} title={reference.shortLabel} boundary="CMU optical-marker source에서 변환된 actual 3D motion입니다. 단계 오른쪽 SRC는 원본 C3D frame입니다." hand="right" sourcePhaseFrames={reference.sourcePhaseFrames} /></View>
      <View style={styles.sourceCard}><View style={styles.sourceIcon}><MaterialIcons name="verified" size={20} color="#16A34A" /></View><View style={styles.sourceTextWrap}><Text style={styles.sourceTitle}>CMU actual optical motion · 승인됨</Text><Text style={styles.sourceCopy}>{reference.sourceAttribution}</Text></View></View>
      <View style={styles.withdrawnNote}><Text style={styles.withdrawnTitle}>Curry 영상 검토 {PLAYER_VIDEO_REVIEW_RECORDS.length}개는 3D 표시에서 철회됨</Text><Text style={styles.withdrawnCopy}>정면·사선 영상이 같은 슛의 동기화·보정된 camera pair가 아니므로 landmark z를 결합하거나 회전하지 않습니다. 검토 기록은 Library에서 확인할 수 있습니다.</Text></View>
      <Pressable onPress={() => router.navigate("/profile" as never)} style={({ pressed }) => [styles.compareButton, pressed && styles.pressed]}><MaterialIcons name="person-outline" size={18} color="#FFFFFF" /><Text style={styles.compareText}>내 스켈레톤과 비교하기</Text></Pressable>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  background: { backgroundColor: "#EEF4F8", bottom: 0, left: 0, overflow: "hidden", position: "absolute", right: 0, top: 0 }, orbitOrange: { backgroundColor: "rgba(249,115,22,0.10)", borderRadius: 220, height: 330, position: "absolute", right: -165, top: -110, width: 330 }, orbitGreen: { backgroundColor: "rgba(22,163,74,0.08)", borderRadius: 180, bottom: 110, height: 250, left: -150, position: "absolute", width: 250 },
  page: { alignSelf: "center", maxWidth: 760, paddingBottom: 118, paddingHorizontal: 16, paddingTop: 22, width: "100%" }, topRow: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, eyebrow: { color: "#F97316", fontFamily: "BarlowCondensed-Bold", fontSize: 13, letterSpacing: 2 }, title: { color: "#102C46", fontFamily: "BarlowCondensed-Bold", fontSize: 46, letterSpacing: -0.7, lineHeight: 48, marginTop: 4 }, live: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.78)", borderColor: "rgba(255,255,255,0.96)", borderRadius: 20, borderWidth: 1, flexDirection: "row", gap: 6, marginTop: 6, paddingHorizontal: 10, paddingVertical: 7 }, liveDot: { backgroundColor: "#16A34A", borderRadius: 99, height: 7, width: 7 }, liveText: { color: "#166534", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 0.8 }, lead: { color: "#61738A", fontFamily: "Barlow", fontSize: 14, lineHeight: 21, marginTop: 10 }, viewerWrap: { marginTop: 12 }, sourceCard: { alignItems: "flex-start", backgroundColor: "rgba(255,255,255,0.72)", borderColor: "rgba(255,255,255,0.96)", borderRadius: 20, borderWidth: 1, flexDirection: "row", gap: 10, marginTop: 14, padding: 14 }, sourceIcon: { alignItems: "center", backgroundColor: "#F0FDF4", borderRadius: 14, height: 34, justifyContent: "center", width: 34 }, sourceTextWrap: { flex: 1 }, sourceTitle: { color: "#102C46", fontFamily: "BarlowCondensed-Bold", fontSize: 18 }, sourceCopy: { color: "#61738A", fontFamily: "Barlow", fontSize: 12, lineHeight: 17, marginTop: 2 }, withdrawnNote: { backgroundColor: "rgba(255,247,237,0.88)", borderColor: "#FDBA74", borderRadius: 16, borderWidth: 1, marginTop: 12, padding: 12 }, withdrawnTitle: { color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 14 }, withdrawnCopy: { color: "#7C5432", fontFamily: "Barlow", fontSize: 11, lineHeight: 16, marginTop: 3 }, compareButton: { alignItems: "center", alignSelf: "stretch", backgroundColor: "#F97316", borderRadius: 18, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 14, minHeight: 50 }, compareText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 16, letterSpacing: 0.3 }, pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
