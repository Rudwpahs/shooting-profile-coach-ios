import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { ScreenContainer } from "@/components/screen-container";
import { ANONYMOUS_POSE_LIBRARY_STATUS, ANONYMOUS_POSE_REFERENCES, PLAYER_VIDEO_POSE_CANDIDATES } from "@/lib/anonymous-pose-library";

export default function LibraryScreen() {
  const router = useRouter();
  const reference = ANONYMOUS_POSE_REFERENCES[0];
  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>SHOOTING FORM ANALYSIS</Text>
        <Text style={styles.title}>참조 모션 재구축</Text>
        <Text style={styles.detail}>승인된 실제 optical motion과 실제 선수 영상에서 추출한 relative pose 후보를 분리해 보여줍니다.</Text>

        <View style={styles.status}><Text style={styles.statusText}>{ANONYMOUS_POSE_LIBRARY_STATUS.profileCount} APPROVED ACTUAL 3D MODEL</Text></View>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{reference.styleTitle}</Text>
          <Text style={styles.noticeCopy}>{reference.sourceAttribution}</Text>
          <PoseMotionViewer motion={reference.motion} title={reference.shortLabel} boundary="단계 오른쪽 SRC 번호는 원본 C3D frame입니다. 실제 모션은 익명 CMU optical-mocap source에서 변환되었습니다." hand="right" sourcePhaseFrames={reference.sourcePhaseFrames} />
        </View>

        <Text style={styles.candidateEyebrow}>PLAYER VIDEO CANDIDATES · NOT IN RECOMMENDATION</Text>
        {PLAYER_VIDEO_POSE_CANDIDATES.map((candidate) => (
          <View key={candidate.id} style={styles.candidate}>
            <View style={styles.candidateHeader}><Text style={styles.noticeTitle}>{candidate.styleTitle}</Text><Text style={styles.viewTag}>{candidate.shortLabel.includes("OBLIQUE") ? "사선" : "정면"}</Text></View>
            <Text style={styles.noticeCopy}>{candidate.sourceAttribution}</Text>
            <Text style={styles.quality}>33 LANDMARK · TRACKING {Math.round(candidate.quality.landmarkFrameRatio * 100)}% · VISIBILITY {Math.round(candidate.quality.meanVisibility * 100)}%</Text>
            <PoseMotionViewer motion={candidate.motion} title={candidate.playerDisplayName} boundary="실제 Curry 영상의 single-view relative pose 후보입니다. calibrated 3D·추천 reference·승인 actual 3D count에는 포함되지 않습니다." hand="right" sourcePhaseTimestampsMs={candidate.sourcePhaseTimestampsMs} />
          </View>
        ))}

        <Pressable onPress={() => router.replace("/assessment" as never)} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>추천 목표 선택</Text></Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", maxWidth: 960, padding: 20, paddingBottom: 132, width: "100%" },
  eyebrow: { color: "#EA580C", fontFamily: "BarlowCondensed-Bold", fontSize: 13, letterSpacing: 2 },
  title: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 44, letterSpacing: -0.5, marginTop: 6 },
  detail: { color: "#64748B", fontFamily: "Barlow", fontSize: 15, lineHeight: 22, marginTop: 7 },
  status: { alignSelf: "flex-start", backgroundColor: "#FFF7ED", borderColor: "#F97316", borderWidth: 2, marginTop: 14, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { color: "#9A3412", fontFamily: "Barlow-SemiBold", fontSize: 11, letterSpacing: 0.3 },
  notice: { backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderWidth: 2, marginTop: 24, padding: 18 },
  candidate: { backgroundColor: "#FFF7ED", borderColor: "#FDBA74", borderWidth: 2, marginTop: 10, padding: 18 },
  candidateEyebrow: { color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 1, marginTop: 28 },
  candidateHeader: { alignItems: "flex-start", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  viewTag: { backgroundColor: "#FFEDD5", color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 11, paddingHorizontal: 8, paddingVertical: 4 },
  noticeTitle: { color: "#0F172A", flex: 1, fontFamily: "BarlowCondensed-Bold", fontSize: 24 },
  noticeCopy: { color: "#64748B", fontFamily: "Barlow", fontSize: 14, lineHeight: 21, marginTop: 7 },
  quality: { color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 11, letterSpacing: 0.5, marginBottom: 9, marginTop: 10 },
  button: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#16A34A", marginTop: 16, minHeight: 42, justifyContent: "center", paddingHorizontal: 16 },
  buttonText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 16 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
