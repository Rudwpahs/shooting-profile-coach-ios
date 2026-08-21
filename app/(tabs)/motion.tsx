import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { ScreenContainer } from "@/components/screen-container";
import { SourceSkeletonReviewer } from "@/components/source-skeleton-reviewer";
import { ANONYMOUS_POSE_REFERENCES, PLAYER_SOURCE_SKELETON_REVIEWS } from "@/lib/anonymous-pose-library";

export default function MotionStudioScreen() {
  const router = useRouter();
  const reference = ANONYMOUS_POSE_REFERENCES[0];
  return <ScreenContainer>
    <View style={styles.background}><View style={styles.orbitOrange} /><View style={styles.orbitGreen} /></View>
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}><View><Text style={styles.eyebrow}>MOTION STUDIO</Text><Text style={styles.title}>선수 스켈레톤</Text></View><View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>ACTUAL 2D</Text></View></View>
      <Text style={styles.lead}>Curry와 Paul George 실제 영상에서 추출한 다섯 단계 2D skeleton을 먼저 확인합니다. 아래 optical-marker card만 회전 가능한 실제 3D입니다.</Text>
      <View style={styles.reviewHeader}><Text style={styles.reviewEyebrow}>PLAYER SOURCE SKELETONS · 2D ONLY</Text><Text style={styles.reviewTitle}>실제 영상 스켈레톤</Text><Text style={styles.reviewCopy}>다섯 단계의 실제 2D landmark를 눌러 확인하세요. 단일 view이므로 3D 회전은 제공하지 않습니다.</Text></View>
      {PLAYER_SOURCE_SKELETON_REVIEWS.map((review) => <SourceSkeletonReviewer key={review.id} review={review} />)}
      <View style={styles.opticalHeader}><Text style={styles.reviewEyebrow}>APPROVED REFERENCE · OPTICAL 3D</Text><Text style={styles.opticalTitle}>검증된 3D 모션</Text></View>
      <View style={styles.viewerWrap}><PoseMotionViewer motion={reference.motion} title={reference.shortLabel} boundary="CMU optical-marker source에서 변환된 actual 3D motion입니다. 단계 오른쪽 SRC는 원본 C3D frame입니다." hand="right" sourcePhaseFrames={reference.sourcePhaseFrames} /></View>
      <View style={styles.sourceCard}><View style={styles.sourceIcon}><MaterialIcons name="verified" size={20} color="#16A34A" /></View><View style={styles.sourceTextWrap}><Text style={styles.sourceTitle}>CMU actual optical motion · 승인됨</Text><Text style={styles.sourceCopy}>{reference.sourceAttribution}</Text></View></View>
      <Pressable onPress={() => router.navigate("/profile" as never)} style={({ pressed }) => [styles.compareButton, pressed && styles.pressed]}><MaterialIcons name="person-outline" size={18} color="#FFFFFF" /><Text style={styles.compareText}>내 스켈레톤과 비교하기</Text></Pressable>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  background: { backgroundColor: "#EEF4F8", bottom: 0, left: 0, overflow: "hidden", position: "absolute", right: 0, top: 0 }, orbitOrange: { backgroundColor: "rgba(249,115,22,0.10)", borderRadius: 220, height: 330, position: "absolute", right: -165, top: -110, width: 330 }, orbitGreen: { backgroundColor: "rgba(22,163,74,0.08)", borderRadius: 180, bottom: 110, height: 250, left: -150, position: "absolute", width: 250 },
  page: { alignSelf: "center", maxWidth: 760, paddingBottom: 118, paddingHorizontal: 16, paddingTop: 22, width: "100%" }, topRow: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, eyebrow: { color: "#F97316", fontFamily: "BarlowCondensed-Bold", fontSize: 13, letterSpacing: 2 }, title: { color: "#102C46", fontFamily: "BarlowCondensed-Bold", fontSize: 46, letterSpacing: -0.7, lineHeight: 48, marginTop: 4 }, live: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.78)", borderColor: "rgba(255,255,255,0.96)", borderRadius: 20, borderWidth: 1, flexDirection: "row", gap: 6, marginTop: 6, paddingHorizontal: 10, paddingVertical: 7 }, liveDot: { backgroundColor: "#16A34A", borderRadius: 99, height: 7, width: 7 }, liveText: { color: "#166534", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 0.8 }, lead: { color: "#61738A", fontFamily: "Barlow", fontSize: 14, lineHeight: 21, marginTop: 10 }, viewerWrap: { marginTop: 12 }, sourceCard: { alignItems: "flex-start", backgroundColor: "rgba(255,255,255,0.72)", borderColor: "rgba(255,255,255,0.96)", borderRadius: 20, borderWidth: 1, flexDirection: "row", gap: 10, marginTop: 14, padding: 14 }, sourceIcon: { alignItems: "center", backgroundColor: "#F0FDF4", borderRadius: 14, height: 34, justifyContent: "center", width: 34 }, sourceTextWrap: { flex: 1 }, sourceTitle: { color: "#102C46", fontFamily: "BarlowCondensed-Bold", fontSize: 18 }, sourceCopy: { color: "#61738A", fontFamily: "Barlow", fontSize: 12, lineHeight: 17, marginTop: 2 }, reviewHeader: { marginTop: 18 }, reviewEyebrow: { color: "#EA580C", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 1.2 }, reviewTitle: { color: "#102C46", fontFamily: "BarlowCondensed-Bold", fontSize: 30, marginTop: 2 }, reviewCopy: { color: "#61738A", fontFamily: "Barlow", fontSize: 13, lineHeight: 18, marginTop: 3 }, opticalHeader: { marginTop: 26 }, opticalTitle: { color: "#102C46", fontFamily: "BarlowCondensed-Bold", fontSize: 30, marginTop: 2 }, compareButton: { alignItems: "center", alignSelf: "stretch", backgroundColor: "#F97316", borderRadius: 18, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 14, minHeight: 50 }, compareText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 16, letterSpacing: 0.3 }, pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
