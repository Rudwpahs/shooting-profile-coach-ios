import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { ScreenContainer } from "@/components/screen-container";
import { ANONYMOUS_POSE_LIBRARY_STATUS, ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";

export default function LibraryScreen() {
  const router = useRouter();
  const reference = ANONYMOUS_POSE_REFERENCES[0];
  return <ScreenContainer><View style={styles.page}><Text style={styles.eyebrow}>SHOOTING FORM ANALYSIS</Text><Text style={styles.title}>참조 모션 재구축</Text><Text style={styles.detail}>생성형 모션은 전량 폐기했습니다. 아래 익명 모델은 라이선스가 확인된 CMU 실제 optical-marker 구간을 제품 16관절에 정규화한 첫 승인 모션입니다. 선수 이름·원본 영상·개인 식별자는 표시하지 않습니다.</Text><View style={styles.status}><Text style={styles.statusText}>{ANONYMOUS_POSE_LIBRARY_STATUS.profileCount} APPROVED ACTUAL 3D MODEL</Text></View><View style={styles.notice}><Text style={styles.noticeTitle}>{reference.styleTitle}</Text><Text style={styles.noticeCopy}>{reference.sourceAttribution}</Text><PoseMotionViewer motion={reference.motion} title={reference.shortLabel} boundary={reference.modelBoundary} hand="right" /></View><Pressable onPress={() => router.replace("/assessment" as never)} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>추천 목표 선택</Text></Pressable></View></ScreenContainer>;
}

const styles = StyleSheet.create({ page: { alignSelf: "center", maxWidth: 960, padding: 20, paddingBottom: 44, width: "100%" }, eyebrow: { color: "#EA580C", fontFamily: "BarlowCondensed-Bold", fontSize: 13, letterSpacing: 2 }, title: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 44, letterSpacing: -0.5, marginTop: 6 }, detail: { color: "#64748B", fontFamily: "Barlow", fontSize: 15, lineHeight: 22, marginTop: 7 }, status: { alignSelf: "flex-start", backgroundColor: "#FFF7ED", borderColor: "#F97316", borderWidth: 2, marginTop: 14, paddingHorizontal: 10, paddingVertical: 6 }, statusText: { color: "#9A3412", fontFamily: "Barlow-SemiBold", fontSize: 11, letterSpacing: 0.3 }, notice: { backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderWidth: 2, marginTop: 24, padding: 18 }, noticeTitle: { color: "#0F172A", fontFamily: "BarlowCondensed-Bold", fontSize: 24 }, noticeCopy: { color: "#64748B", fontFamily: "Barlow", fontSize: 14, lineHeight: 21, marginTop: 7 }, button: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#16A34A", marginTop: 16, minHeight: 42, justifyContent: "center", paddingHorizontal: 16 }, buttonText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 16 }, pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] } });
