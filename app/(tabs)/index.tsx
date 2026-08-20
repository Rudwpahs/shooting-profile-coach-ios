import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { detectPoseFromSelectedVideo, type PoseDetectionProgress } from "@/lib/pose-detection";
import { useProfile } from "@/lib/profile-store";
import { trpc } from "@/lib/trpc";

type VideoSlot = "side" | "front" | "oblique";
type SelectedVideo = { uri: string; name: string; mimeType?: string | null };

const SLOT_COPY: Record<VideoSlot, { label: string; detail: string }> = {
  side: { label: "SIDE", detail: "전신 측면 · 권장" },
  front: { label: "FRONT", detail: "정면 · 다중 시점용" },
  oblique: { label: "OBLIQUE", detail: "45° · 확인용" },
};

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const narrow = width < 760;
  const router = useRouter();
  const { ready } = useProfile();
  const { isAuthenticated } = useAuth();
  const savePersonalPose = trpc.personalProfile.savePose.useMutation();
  const [videos, setVideos] = useState<Partial<Record<VideoSlot, SelectedVideo>>>({});
  const [poseProgress, setPoseProgress] = useState<PoseDetectionProgress | null>(null);
  const [poseStatus, setPoseStatus] = useState<string | null>(null);

  const pickVideo = async (slot: VideoSlot) => {
    const result = await DocumentPicker.getDocumentAsync({ type: "video/*", copyToCacheDirectory: true });
    if (!result.canceled) {
      const asset = result.assets[0];
      setVideos((current) => ({ ...current, [slot]: { uri: asset.uri, name: asset.name, mimeType: asset.mimeType } }));
    }
  };

  const runPoseDetection = async () => {
    if (!videos.side) return;
    setPoseStatus(null);
    setPoseProgress({ completed: 0, total: 1 });
    const result = await detectPoseFromSelectedVideo(videos.side.uri, setPoseProgress);
    setPoseProgress(null);
    if (result.status !== "complete") {
      setPoseStatus(result.status === "rejected" ? `저장하지 않았습니다. 품질 게이트 실패: ${result.reason}` : result.reason);
      return;
    }
    if (!isAuthenticated) {
      setPoseStatus(`Pose ${result.sampledFrames}개 프레임을 검출했습니다. 개인 스켈레톤으로 저장하려면 MY PROFILE에서 로그인·회원가입을 완료하세요.`);
      return;
    }
    try {
      await savePersonalPose.mutateAsync({ sourceLabel: videos.side.name, poseSpace: "monocular_relative_pose", status: "approved_private", poseJson: JSON.stringify(result.candidate), qualityJson: JSON.stringify(result.candidate.quality) });
      setPoseStatus(`Pose ${result.sampledFrames}개 프레임이 품질 기준을 통과해 개인 프로필에 비공개 저장되었습니다.`);
    } catch {
      setPoseStatus("Pose는 검출되었지만 개인 프로필 저장에 실패했습니다. 다시 로그인한 뒤 시도하세요.");
    }
  };

  const activeStep = videos.side ? 2 : 1;
  return (
    <ScreenContainer>
      <View pointerEvents="none" style={styles.courtBackground}><View style={styles.orangeWash} /><View style={styles.greenGlow} />{Array.from({ length: 15 }, (_, index) => <View key={index} style={[styles.courtLine, { left: index * 48 }]} />)}</View>
      <ScrollView contentContainerStyle={[styles.page, narrow && styles.pageNarrow]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>SHOOTING FORM ANALYSIS</Text>
          <Text style={[styles.heroTitle, narrow && styles.heroTitleNarrow]}>실제 영상으로{`\n`}다시 구축한다.</Text>
          <Text style={styles.sub}>이전 생성형 3D 참조 모션은 제품에서 폐기했습니다. 실제 선수의 전신 슬로모션과 진정한 다중 시점 영상만 검증을 통과하면 익명 모델로 추가됩니다.</Text>
          <View style={styles.metaRow}><Pressable onPress={() => router.push("/profile" as never)} style={({ pressed }) => [[styles.pill, styles.okPill], pressed && styles.pressed]}><Text style={styles.okPillText}>{ready ? "MY PROFILE" : "CONNECTING…"}</Text></Pressable><View style={styles.pill}><Text style={styles.pillText}>REAL VIDEO · REBUILD</Text></View></View>
        </View>

        <View style={[styles.steps, narrow && styles.oneColumn]}>{[{ number: "01", label: "Capture" }, { number: "02", label: "Verify" }, { number: "03", label: "Build" }].map((step, index) => { const number = index + 1; return <View key={step.number} style={[styles.step, number === activeStep && styles.stepActive, number < activeStep && styles.stepDone]}><Text style={[styles.stepNumber, number === activeStep && styles.stepNumberActive, number < activeStep && styles.stepNumberDone]}>{step.number}</Text><Text style={styles.stepLabel}>{step.label}</Text></View>; })}</View>

        <View style={styles.block}>
          <BlockHead title="영상 업로드" detail="전신이 끊기지 않는 고해상도 슬로모션을 선택하세요. Side와 Front가 시간 동기화된 경우에만 실제 3D 후보로 승격할 수 있습니다." />
          <View style={[styles.uploadGrid, narrow && styles.oneColumn]}>{(Object.keys(SLOT_COPY) as VideoSlot[]).map((slot) => <VideoDrop key={slot} slot={slot} value={videos[slot]?.name} onPress={() => pickVideo(slot)} />)}</View>
          <Text style={styles.uploadBoundary}>이전 16개 생성형 참조·순위·비교 모델은 모두 폐기되었습니다. 선택한 영상은 현재 기기에서 pose 후보 생성에만 사용되며, 품질 기준을 통과한 개인 후보만 로그인 계정에 비공개 저장됩니다.</Text>
          {videos.side ? <Pressable disabled={poseProgress !== null || savePersonalPose.isPending} onPress={runPoseDetection} style={({ pressed }) => [styles.detectButton, (poseProgress !== null || savePersonalPose.isPending) && styles.disabled, pressed && styles.pressed]}><MaterialIcons name="accessibility-new" size={17} color="#1E3A5F" /><Text style={styles.detectButtonText}>{poseProgress ? `POSE DETECTING ${poseProgress.completed}/${poseProgress.total}` : savePersonalPose.isPending ? "개인 스켈레톤 저장 중" : "POSE DETECTION 실행"}</Text></Pressable> : null}
          {poseStatus ? <View style={styles.poseNotice}><MaterialIcons name="info-outline" size={16} color="#1E3A5F" /><Text style={styles.poseNoticeText}>{poseStatus}</Text></View> : null}
        </View>

        <View style={styles.block}>
          <BlockHead title="실제 3D 모델 재구축" detail="검증되지 않은 관절 경로를 보여주거나 추천하지 않습니다." />
          <View style={[styles.scoreboard, narrow && styles.oneColumn]}><ScoreTile label="APPROVED MODELS" value="0" accent /><ScoreTile label="SOURCE STANDARD" value="1080P SLOW / 360" /><ScoreTile label="CURRENT STATE" value="REBUILDING" /></View>
          <View style={styles.requirements}>
            <Requirement number="01" title="실제 연속 슛 클립" detail="준비부터 팔로우스루까지 전신이 가려지지 않은 동작" />
            <Requirement number="02" title="동기화된 두 시점" detail="Side·Front 또는 진정한 360도 영상에서 같은 슛의 프레임을 정렬" />
            <Requirement number="03" title="검증 후 익명화" detail="33개 landmark·재투영 오차·연속성 기준을 통과한 특성만 라이브러리에 반영" />
          </View>
          <View style={styles.withdrawn}><MaterialIcons name="block" size={18} color="#C24122" /><Text style={styles.withdrawnText}>생성형 참조 애니메이션, 그에 기반한 FIT SCORE, 16개 모션 순위와 나란히 비교 뷰는 전량 비활성화되었습니다.</Text></View>
        </View>

        <View style={styles.block}><BlockHead title="개인 스켈레톤" detail="내 영상의 단일 시점 pose 후보는 내 계정에만 비공개로 저장됩니다. 이를 실제 선수 또는 보정된 3D로 표시하지 않습니다." /><Pressable onPress={() => router.push("/profile" as never)} style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}><Text style={styles.profileButtonText}>MY PROFILE 열기</Text></Pressable></View>
      </ScrollView>
    </ScreenContainer>
  );
}

function BlockHead({ title, detail }: { title: string; detail: string }) { return <View style={styles.blockHead}><Text style={styles.blockTitle}>{title}</Text><Text style={styles.blockDetail}>{detail}</Text></View>; }
function VideoDrop({ slot, value, onPress }: { slot: VideoSlot; value?: string; onPress: () => void }) { const copy = SLOT_COPY[slot]; return <Pressable onPress={onPress} style={({ pressed }) => [styles.drop, value && styles.dropSelected, pressed && styles.pressed]}><Text style={styles.dropTitle}>{copy.label}</Text><Text style={styles.dropDetail}>{copy.detail}</Text><View style={styles.dropFile}><MaterialIcons name="video-library" size={14} color="#64748B" /><Text numberOfLines={1} style={styles.dropFileText}>{value ?? "파일 선택"}</Text></View></Pressable>; }
function ScoreTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <View style={[styles.scoreTile, accent && styles.scoreTileAccent]}><Text style={styles.scoreLabel}>{label}</Text><Text numberOfLines={2} style={styles.scoreValue}>{value}</Text></View>; }
function Requirement({ number, title, detail }: { number: string; title: string; detail: string }) { return <View style={styles.requirement}><Text style={styles.requirementNumber}>{number}</Text><View style={{ flex: 1 }}><Text style={styles.requirementTitle}>{title}</Text><Text style={styles.requirementDetail}>{detail}</Text></View></View>; }

const styles = StyleSheet.create({
  courtBackground: { backgroundColor: "#F4F7FB", bottom: 0, left: 0, overflow: "hidden", position: "absolute", right: 0, top: 0 }, orangeWash: { backgroundColor: "rgba(249,115,22,0.08)", height: 280, left: 0, position: "absolute", right: 0, top: 0 }, greenGlow: { backgroundColor: "rgba(22,163,74,0.10)", borderRadius: 320, height: 420, position: "absolute", right: -210, top: -90, width: 420 }, courtLine: { backgroundColor: "rgba(30,58,95,0.045)", bottom: 0, position: "absolute", top: 0, width: 1 },
  page: { alignSelf: "center", maxWidth: 960, paddingBottom: 80, paddingHorizontal: 16, paddingTop: 34, width: "100%" }, pageNarrow: { paddingBottom: 48, paddingTop: 24 }, hero: { marginBottom: 32 }, eyebrow: { color: "#EA580C", fontFamily: "BarlowCondensed-SemiBold", fontSize: 13, letterSpacing: 2.5 }, heroTitle: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 58, letterSpacing: -1.4, lineHeight: 55, marginTop: 7 }, heroTitleNarrow: { fontSize: 42, lineHeight: 42 }, sub: { color: "#64748B", fontFamily: "Barlow", fontSize: 16, lineHeight: 24, marginTop: 13, maxWidth: 670 }, metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 }, pill: { backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderWidth: 2, paddingHorizontal: 11, paddingVertical: 6 }, okPill: { borderColor: "#16A34A" }, pillText: { color: "#64748B", fontFamily: "Barlow-SemiBold", fontSize: 11, letterSpacing: 0.5 }, okPillText: { color: "#15803D", fontFamily: "Barlow-SemiBold", fontSize: 11, letterSpacing: 0.5 },
  steps: { flexDirection: "row", gap: 10, marginBottom: 24 }, oneColumn: { flexDirection: "column" }, step: { alignItems: "baseline", backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderWidth: 2, flex: 1, flexDirection: "row", gap: 9, paddingHorizontal: 14, paddingVertical: 12 }, stepActive: { backgroundColor: "#FFF7ED", borderColor: "#F97316" }, stepDone: { backgroundColor: "#F0FDF4", borderColor: "#16A34A" }, stepNumber: { color: "#64748B", fontFamily: "BarlowCondensed-Bold", fontSize: 23 }, stepNumberActive: { color: "#EA580C" }, stepNumberDone: { color: "#16A34A" }, stepLabel: { color: "#0F172A", fontFamily: "BarlowCondensed-SemiBold", fontSize: 17, letterSpacing: 0.6, textTransform: "uppercase" },
  block: { backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderWidth: 2, marginBottom: 24, padding: 22, shadowColor: "#0F172A", shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.08, shadowRadius: 24 }, blockHead: { marginBottom: 18 }, blockTitle: { color: "#0F172A", fontFamily: "BarlowCondensed-Bold", fontSize: 30, letterSpacing: 0.5, textTransform: "uppercase" }, blockDetail: { color: "#64748B", fontFamily: "Barlow", fontSize: 14, lineHeight: 20, marginTop: 3 },
  uploadGrid: { flexDirection: "row", gap: 12 }, drop: { backgroundColor: "#F8FAFC", borderColor: "#DBE3EE", borderStyle: "dashed", borderWidth: 2, flex: 1, minHeight: 126, padding: 15 }, dropSelected: { backgroundColor: "#FFF7ED", borderColor: "#F97316", borderStyle: "solid" }, dropTitle: { color: "#0F172A", fontFamily: "BarlowCondensed-Bold", fontSize: 22, letterSpacing: 0.8 }, dropDetail: { color: "#64748B", fontFamily: "Barlow", fontSize: 12, marginTop: 1 }, dropFile: { alignItems: "center", flexDirection: "row", gap: 6, marginTop: 14 }, dropFileText: { color: "#64748B", flex: 1, fontFamily: "Barlow", fontSize: 12 }, uploadBoundary: { color: "#64748B", fontFamily: "Barlow", fontSize: 12, lineHeight: 18, marginTop: 12 }, detectButton: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#EFF6FF", borderColor: "#1E3A5F", borderWidth: 2, flexDirection: "row", gap: 7, marginTop: 12, minHeight: 40, justifyContent: "center", paddingHorizontal: 13 }, detectButtonText: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 15, letterSpacing: 0.4 }, poseNotice: { alignItems: "flex-start", backgroundColor: "#EFF6FF", borderLeftColor: "#1E3A5F", borderLeftWidth: 4, flexDirection: "row", gap: 7, marginTop: 10, padding: 10 }, poseNoticeText: { color: "#1E3A5F", flex: 1, fontFamily: "Barlow", fontSize: 12, lineHeight: 18 }, disabled: { opacity: 0.45 },
  scoreboard: { flexDirection: "row", gap: 12 }, scoreTile: { backgroundColor: "#F8FAFC", borderColor: "#DBE3EE", borderWidth: 2, flex: 1, minHeight: 104, padding: 14 }, scoreTileAccent: { backgroundColor: "#FFF7ED", borderColor: "#F97316" }, scoreLabel: { color: "#64748B", fontFamily: "BarlowCondensed-SemiBold", fontSize: 13, letterSpacing: 1.2 }, scoreValue: { color: "#0F172A", fontFamily: "BarlowCondensed-Bold", fontSize: 24, letterSpacing: 0.2, marginTop: 6 }, requirements: { gap: 10, marginTop: 18 }, requirement: { alignItems: "flex-start", backgroundColor: "#F8FAFC", borderColor: "#DBE3EE", borderWidth: 2, flexDirection: "row", gap: 12, padding: 13 }, requirementNumber: { color: "#EA580C", fontFamily: "BarlowCondensed-Bold", fontSize: 24 }, requirementTitle: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 18 }, requirementDetail: { color: "#64748B", fontFamily: "Barlow", fontSize: 13, lineHeight: 19, marginTop: 2 }, withdrawn: { alignItems: "flex-start", backgroundColor: "#FFF7ED", borderLeftColor: "#C24122", borderLeftWidth: 4, flexDirection: "row", gap: 8, marginTop: 16, padding: 11 }, withdrawnText: { color: "#7C2D12", flex: 1, fontFamily: "Barlow-SemiBold", fontSize: 13, lineHeight: 19 }, profileButton: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#16A34A", minHeight: 42, justifyContent: "center", paddingHorizontal: 16 }, profileButtonText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 16, letterSpacing: 0.5 }, pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
