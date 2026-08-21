import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { ScreenContainer } from "@/components/screen-container";
import { SourceSkeletonReviewer } from "@/components/source-skeleton-reviewer";
import { ANONYMOUS_POSE_LIBRARY_STATUS, ANONYMOUS_POSE_REFERENCES, PLAYER_SOURCE_SKELETON_REVIEWS, PLAYER_VIDEO_REVIEW_RECORDS } from "@/lib/anonymous-pose-library";

export default function LibraryScreen() {
  const router = useRouter();
  const reference = ANONYMOUS_POSE_REFERENCES[0];
  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>SHOOTING FORM ANALYSIS</Text>
        <Text style={styles.title}>참조 모션 재구축</Text>
        <Text style={styles.detail}>먼저 실제 Curry·Paul George source에서 추출한 2D skeleton을 확인합니다. 회전 가능한 3D는 재현 가능한 actual optical motion으로 한정합니다.</Text>
        <Text style={styles.candidateEyebrow}>ACTUAL PLAYER SOURCE SKELETONS · FIXED 2D</Text>
        <Text style={styles.skeletonLead}>두 선수의 실제 source landmark를 5단계 2D skeleton으로 확인합니다. 3D product model은 아닙니다.</Text>
        {PLAYER_SOURCE_SKELETON_REVIEWS.map((review) => <SourceSkeletonReviewer key={review.id} review={review} />)}
        <Text style={styles.candidateEyebrow}>APPROVED OPTICAL 3D REFERENCE</Text>
        <View style={styles.status}><Text style={styles.statusText}>{ANONYMOUS_POSE_LIBRARY_STATUS.profileCount} APPROVED ACTUAL 3D MODEL</Text></View>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{reference.styleTitle}</Text>
          <Text style={styles.noticeCopy}>{reference.sourceAttribution}</Text>
          <PoseMotionViewer motion={reference.motion} title={reference.shortLabel} boundary="단계 오른쪽 SRC 번호는 원본 C3D frame입니다. 실제 모션은 익명 CMU optical-mocap source에서 변환되었습니다." hand="right" sourcePhaseFrames={reference.sourcePhaseFrames} />
        </View>
        <Text style={styles.candidateEyebrow}>HISTORICAL WITHDRAWN VIDEO REVIEWS · NO 3D MODEL</Text>
        {PLAYER_VIDEO_REVIEW_RECORDS.map((record) => (
          <View key={record.id} style={styles.review}>
            <View style={styles.reviewHeader}><Text style={styles.noticeTitle}>{record.styleTitle}</Text><Text style={styles.viewTag}>{record.sourceView}</Text></View>
            <Text style={styles.noticeCopy}>{record.sourceAttribution}</Text>
            <Text style={styles.quality}>TRACKING {Math.round(record.quality.landmarkFrameRatio * 100)}% · VISIBILITY {Math.round(record.quality.meanVisibility * 100)}% · 3D WITHDRAWN</Text>
            <Text style={styles.withdrawal}>{record.withdrawalReason}</Text>
          </View>
        ))}
        <Pressable onPress={() => router.replace("/assessment" as never)} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>추천 목표 선택</Text></Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", maxWidth: 960, padding: 20, paddingBottom: 132, width: "100%" }, eyebrow: { color: "#EA580C", fontFamily: "BarlowCondensed-Bold", fontSize: 13, letterSpacing: 2 }, title: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 44, letterSpacing: -0.5, marginTop: 6 }, detail: { color: "#64748B", fontFamily: "Barlow", fontSize: 15, lineHeight: 22, marginTop: 7 }, status: { alignSelf: "flex-start", backgroundColor: "#FFF7ED", borderColor: "#F97316", borderWidth: 2, marginTop: 14, paddingHorizontal: 10, paddingVertical: 6 }, statusText: { color: "#9A3412", fontFamily: "Barlow-SemiBold", fontSize: 11, letterSpacing: 0.3 }, notice: { backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderWidth: 2, marginTop: 24, padding: 18 }, review: { backgroundColor: "#FFF7ED", borderColor: "#FDBA74", borderWidth: 2, marginTop: 10, padding: 18 }, candidateEyebrow: { color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 1, marginTop: 28 }, skeletonLead: { color: "#64748B", fontFamily: "Barlow", fontSize: 13, lineHeight: 19, marginTop: 5 }, reviewHeader: { alignItems: "flex-start", flexDirection: "row", gap: 8, justifyContent: "space-between" }, viewTag: { backgroundColor: "#FFEDD5", color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 11, paddingHorizontal: 8, paddingVertical: 4 }, noticeTitle: { color: "#0F172A", flex: 1, fontFamily: "BarlowCondensed-Bold", fontSize: 24 }, noticeCopy: { color: "#64748B", fontFamily: "Barlow", fontSize: 14, lineHeight: 21, marginTop: 7 }, quality: { color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 11, letterSpacing: 0.5, marginTop: 10 }, withdrawal: { color: "#7C5432", fontFamily: "Barlow", fontSize: 13, lineHeight: 19, marginTop: 8 }, button: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#16A34A", marginTop: 16, minHeight: 42, justifyContent: "center", paddingHorizontal: 16 }, buttonText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 16 }, pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
