import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { ScreenContainer } from "@/components/screen-container";
import { ANONYMOUS_POSE_LIBRARY_STATUS, ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";

export default function LibraryScreen() {
  const router = useRouter();
  const reference = ANONYMOUS_POSE_REFERENCES[0];
  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>SHOOTING FORM ANALYSIS</Text>
        <Text style={styles.title}>참조 모션 재구축</Text>
        <Text style={styles.detail}>제품에는 검토를 통과한 reference motion만 표시합니다. intermediate landmark review와 withdrawn video record는 품질 감사용으로만 보관되며 사용자 UI에는 노출하지 않습니다.</Text>
        <Text style={styles.candidateEyebrow}>APPROVED OPTICAL 3D REFERENCE</Text>
        <View style={styles.status}><Text style={styles.statusText}>{ANONYMOUS_POSE_LIBRARY_STATUS.profileCount} APPROVED ACTUAL 3D MODEL</Text></View>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{reference.styleTitle}</Text>
          <Text style={styles.noticeCopy}>{reference.sourceAttribution}</Text>
          <PoseMotionViewer motion={reference.motion} title={reference.shortLabel} boundary="단계 오른쪽 SRC 번호는 원본 C3D frame입니다. 실제 모션은 익명 CMU optical-mocap source에서 변환되었습니다." hand="right" sourcePhaseFrames={reference.sourcePhaseFrames} />
        </View>
        <Pressable onPress={() => router.replace("/assessment" as never)} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>추천 목표 선택</Text></Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", maxWidth: 960, padding: 20, paddingBottom: 132, width: "100%" }, eyebrow: { color: "#EA580C", fontFamily: "BarlowCondensed-Bold", fontSize: 13, letterSpacing: 2 }, title: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 44, letterSpacing: -0.5, marginTop: 6 }, detail: { color: "#64748B", fontFamily: "Barlow", fontSize: 15, lineHeight: 22, marginTop: 7 }, status: { alignSelf: "flex-start", backgroundColor: "#FFF7ED", borderColor: "#F97316", borderWidth: 2, marginTop: 14, paddingHorizontal: 10, paddingVertical: 6 }, statusText: { color: "#9A3412", fontFamily: "Barlow-SemiBold", fontSize: 11, letterSpacing: 0.3 }, notice: { backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderWidth: 2, marginTop: 24, padding: 18 }, candidateEyebrow: { color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 1, marginTop: 28 }, noticeTitle: { color: "#0F172A", flex: 1, fontFamily: "BarlowCondensed-Bold", fontSize: 24 }, noticeCopy: { color: "#64748B", fontFamily: "Barlow", fontSize: 14, lineHeight: 21, marginTop: 7 }, button: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#16A34A", marginTop: 16, minHeight: 42, justifyContent: "center", paddingHorizontal: 16 }, buttonText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 16 }, pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
