import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useEvent } from "expo";
import { VideoView, useVideoPlayer } from "expo-video";

import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import type { AnonymousPoseReference } from "@/lib/anonymous-pose-library";
import { SHOT_PHASES } from "@/lib/pose-motion";

export type SelectedVideo = { uri: string; name: string; mimeType?: string };

function UserVideoPane({ video, activePhase, onReady }: { video: SelectedVideo; activePhase: number; onReady?: (seek: (phase: number) => void) => void }) {
  const player = useVideoPlayer(video.uri, (instance) => { instance.muted = true; instance.timeUpdateEventInterval = 0.25; });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  useEffect(() => {
    onReady?.((phase) => {
      if (Number.isFinite(player.duration) && player.duration > 0) player.currentTime = (player.duration * phase) / (SHOT_PHASES.length - 1);
    });
  }, [onReady, player]);
  useEffect(() => {
    if (Number.isFinite(player.duration) && player.duration > 0) player.currentTime = (player.duration * activePhase) / (SHOT_PHASES.length - 1);
  }, [activePhase, player]);
  return <View style={styles.pane}>
    <View style={styles.paneHead}><Text style={styles.paneEyebrow}>YOUR VIDEO</Text><Text numberOfLines={1} style={styles.paneTitle}>{video.name}</Text></View>
    <View style={styles.videoFrame}>{status === "loading" ? <ActivityIndicator color="#F97316" /> : null}<VideoView style={styles.video} player={player} nativeControls={false} contentFit="contain" playsInline /></View>
    <Text style={styles.paneNote}>단계 선택 시 영상의 해당 비율 위치로 이동합니다. 프레임 정확도는 원본 영상의 인코딩 키프레임에 따라 달라집니다.</Text>
  </View>;
}

export function SideBySideComparison({ video, reference, hand = "right" }: { video: SelectedVideo; reference: AnonymousPoseReference; hand?: "auto" | "right" | "left" }) {
  const [activePhase, setActivePhase] = useState(0);
  const [seek, setSeek] = useState<((phase: number) => void) | null>(null);
  const selectPhase = (index: number) => { setActivePhase(index); seek?.(index); };
  return <View style={styles.card}>
    <View style={styles.cardHead}><View><Text style={styles.eyebrow}>SYNCHRONIZED COMPARE</Text><Text style={styles.title}>내 영상 · 참조 모션</Text></View><Text style={styles.phase}>{activePhase + 1}/5</Text></View>
    <Text style={styles.lead}>동일한 단계 버튼이 업로드 영상의 시간 비율과 참조 애니메이션의 다섯 단계에 함께 적용됩니다.</Text>
    <View style={styles.phaseRow}>{SHOT_PHASES.map((label, index) => <Pressable key={label} onPress={() => selectPhase(index)} style={({ pressed }) => [styles.phaseButton, activePhase === index && styles.phaseButtonActive, pressed && styles.pressed]}><Text style={[styles.phaseText, activePhase === index && styles.phaseTextActive]}>{label}</Text></Pressable>)}</View>
    <View style={styles.divider} />
    <View style={styles.split}>
      <UserVideoPane video={video} activePhase={activePhase} onReady={(next) => setSeek(() => next)} />
      <View style={styles.pane}><PoseMotionViewer reference={reference} hand={hand} activeFrameIndex={activePhase} onPhaseSelect={selectPhase} title={`참조 · ${reference.shortLabel}`} boundary="참조 애니메이션은 생체역학적 표현입니다. 사용자 영상과 같은 단계에서 비교하되, 동일 인물·실측 3D 또는 자동 교정된 움직임을 뜻하지 않습니다." /></View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderWidth: 2, gap: 13, marginTop: 20, padding: 16 }, cardHead: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, eyebrow: { color: "#EA580C", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 1.2 }, title: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 24, marginTop: 2 }, phase: { color: "#64748B", fontFamily: "BarlowCondensed-Bold", fontSize: 16 }, lead: { color: "#64748B", fontFamily: "Barlow", fontSize: 13, lineHeight: 19 }, phaseRow: { flexDirection: "row", gap: 5 }, phaseButton: { alignItems: "center", borderColor: "#DBE3EE", borderWidth: 2, flex: 1, minHeight: 38, justifyContent: "center", paddingHorizontal: 3 }, phaseButtonActive: { backgroundColor: "#FFF7ED", borderColor: "#F97316" }, phaseText: { color: "#64748B", fontFamily: "BarlowCondensed-Bold", fontSize: 11 }, phaseTextActive: { color: "#EA580C" }, divider: { backgroundColor: "#DBE3EE", height: 2 }, split: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, pane: { flexBasis: 300, flexGrow: 1, gap: 8 }, paneHead: { borderLeftColor: "#16A34A", borderLeftWidth: 4, paddingLeft: 8 }, paneEyebrow: { color: "#15803D", fontFamily: "BarlowCondensed-Bold", fontSize: 11, letterSpacing: 1 }, paneTitle: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 18, marginTop: 1 }, videoFrame: { alignItems: "center", backgroundColor: "#0F172A", borderColor: "#1E3A5F", borderWidth: 2, height: 270, justifyContent: "center", overflow: "hidden" }, video: { height: "100%", width: "100%" }, paneNote: { color: "#64748B", fontFamily: "Barlow", fontSize: 11, lineHeight: 16 }, pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
