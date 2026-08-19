import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { ScreenContainer } from "@/components/screen-container";
import { useProfile } from "@/lib/profile-store";
import { applyGoalSelection, getGoalApplicationSummary, recommendShotForms, TRAINING_GOALS, type TrainingGoal } from "@/lib/recommendation";

type VideoSlot = "side" | "front" | "oblique";
type Hand = "auto" | "right" | "left";

const SLOT_COPY: Record<VideoSlot, { label: string; detail: string }> = {
  side: { label: "SIDE", detail: "전신 측면 · 권장" },
  front: { label: "FRONT", detail: "정면 · 선택" },
  oblique: { label: "OBLIQUE", detail: "45° · 선택" },
};

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const narrow = width < 760;
  const { profile, ready, updateProfile } = useProfile();
  const [videos, setVideos] = useState<Partial<Record<VideoSlot, string>>>({});
  const [hand, setHand] = useState<Hand>("auto");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const results = useMemo(() => recommendShotForms(profile), [profile]);
  const selected = results.find((item) => item.reference.id === selectedId) ?? results[0];
  const topAlignment = selected.alignment[0];

  const pickVideo = async (slot: VideoSlot) => {
    const result = await DocumentPicker.getDocumentAsync({ type: "video/*", copyToCacheDirectory: false });
    if (!result.canceled) setVideos((current) => ({ ...current, [slot]: result.assets[0].name }));
  };

  const chooseGoal = async (goal: TrainingGoal) => {
    const next = applyGoalSelection(profile, goal);
    setSelectedId(null);
    await updateProfile({ goal: next.goal, preferredStyle: next.preferredStyle, traits: next.traits });
  };

  const activeStep = videos.side ? 3 : 1;

  return (
    <ScreenContainer>
      <View pointerEvents="none" style={styles.courtBackground}>
        <View style={styles.orangeWash} />
        <View style={styles.greenGlow} />
        {Array.from({ length: 15 }, (_, index) => <View key={index} style={[styles.courtLine, { left: index * 48 }]} />)}
      </View>
      <ScrollView contentContainerStyle={[styles.page, narrow && styles.pageNarrow]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>SHOOTING FORM ANALYSIS</Text>
          <Text style={[styles.heroTitle, narrow && styles.heroTitleNarrow]}>각도만으로{`\n`}폼을 비교한다.</Text>
          <Text style={styles.sub}>선수 이름 없이 16개 익명 슈팅 참조 애니메이션의 영상 요약 특성을 비교합니다. 목표 하나를 고르면 그 기준이 즉시 순위와 점수에 반영됩니다.</Text>
          <View style={styles.metaRow}>
            <View style={[styles.pill, styles.okPill]}><Text style={styles.okPillText}>{ready ? "LOCAL PROFILE READY" : "CONNECTING…"}</Text></View>
            <View style={styles.pill}><Text style={styles.pillText}>ANGLE-ONLY · ANONYMOUS</Text></View>
          </View>
        </View>

        <View style={[styles.steps, narrow && styles.oneColumn]}>
          {[{ number: "01", label: "Upload" }, { number: "02", label: "Person" }, { number: "03", label: "Match" }].map((step, index) => {
            const number = index + 1;
            return <View key={step.number} style={[styles.step, number === activeStep && styles.stepActive, number < activeStep && styles.stepDone]}><Text style={[styles.stepNumber, number === activeStep && styles.stepNumberActive, number < activeStep && styles.stepNumberDone]}>{step.number}</Text><Text style={styles.stepLabel}>{step.label}</Text></View>;
          })}
        </View>

        <View style={styles.block}>
          <BlockHead title="영상 업로드" detail="Side는 권장입니다. Front / Oblique는 확인용으로 추가할 수 있습니다." />
          <View style={[styles.uploadGrid, narrow && styles.oneColumn]}>
            {(Object.keys(SLOT_COPY) as VideoSlot[]).map((slot) => <VideoDrop key={slot} slot={slot} value={videos[slot]} onPress={() => pickVideo(slot)} />)}
          </View>
          <Text style={styles.uploadBoundary}>선택한 영상은 이 기기에서만 선택 상태로 표시됩니다. 현재 익명 모션 추천의 점수 입력은 아래의 목표 하나이며, 업로드 영상을 근거 없이 자동 분석했다고 표시하지 않습니다.</Text>
          <View style={[styles.toolbar, narrow && styles.toolbarNarrow]}>
            <View style={styles.field}><Text style={styles.fieldLabel}>핸드</Text><View style={styles.handRow}>{(["auto", "right", "left"] as Hand[]).map((option) => <Pressable key={option} onPress={() => setHand(option)} style={({ pressed }) => [styles.handButton, hand === option && styles.handButtonActive, pressed && styles.pressed]}><Text style={[styles.handText, hand === option && styles.handTextActive]}>{option}</Text></Pressable>)}</View></View>
            <View style={styles.goalCallout}><Text style={styles.fieldLabel}>추천 기준</Text><Text style={styles.goalCalloutText}>목표 선택 하나가 100% 반영됩니다.</Text></View>
          </View>
          <View style={[styles.goalGrid, narrow && styles.oneColumn]}>
            {TRAINING_GOALS.map((goal) => <Pressable key={goal.id} onPress={() => chooseGoal(goal.id)} style={({ pressed }) => [styles.goalTile, profile.goal === goal.id && styles.goalTileActive, pressed && styles.pressed]} accessibilityRole="button"><Text style={styles.goalTitle}>{goal.title}</Text><Text style={styles.goalDescription}>{goal.description}</Text></Pressable>)}
          </View>
          <View style={styles.appliedLine}><MaterialIcons name="bolt" size={16} color="#EA580C" /><Text style={styles.appliedText}>{getGoalApplicationSummary(profile.goal)}</Text></View>
        </View>

        <View style={styles.block}>
          <BlockHead title="매칭 결과" detail="이 화면에서 선택한 목표와 16개 익명 pose 특성의 거리로 정렬됩니다." />
          <View style={[styles.scoreboard, narrow && styles.oneColumn]}>
            <ScoreTile label="추천 모션" value={results[0].reference.shortLabel} />
            <ScoreTile label="FIT SCORE" value={`${results[0].fitScore}%`} accent />
            <ScoreTile label="가장 가까운 특성" value={results[0].alignment[0].label} />
          </View>

          <Text style={styles.sectionTitle}>릴리스 특성</Text>
          <View style={[styles.metrics, narrow && styles.oneColumn]}>
            {selected.alignment.map((item) => <View key={item.trait} style={styles.metric}><Text style={styles.metricLabel}>{item.label}</Text><Text style={styles.metricValue}>{Math.max(0, 100 - Math.abs(item.delta))}<Text style={styles.metricUnit}> / 100</Text></Text></View>)}
          </View>

          <Text style={styles.sectionTitle}>내 슛폼 자세 시각화</Text>
          <Text style={styles.phaseLead}>드래그 회전 · 단계 선택 · 재생. {hand === "left" ? "왼손 선택에 따라 좌우 반전해 표시합니다." : "오른손 기준 상대 모션을 표시합니다."}</Text>
          <PoseMotionViewer reference={selected.reference} hand={hand} />

          <Text style={styles.sectionTitle}>코칭 포인트</Text>
          <View style={styles.feedbackList}>
            <Text style={styles.focusTitle}>{selected.focus.title}</Text>
            <Text style={styles.feedbackText}>{selected.focus.detail}</Text>
            <Text style={styles.feedbackText}>{selected.focus.drill}</Text>
            {selected.reasons.slice(0, 2).map((reason) => <View key={reason} style={styles.reasonRow}><Text style={styles.reasonMarker}>—</Text><Text style={styles.feedbackText}>{reason}</Text></View>)}
          </View>

          <Text style={styles.sectionTitle}>유사 모션 순위</Text>
          <View style={styles.matchList}>{results.map((result, index) => <Pressable key={result.reference.id} onPress={() => setSelectedId(result.reference.id)} style={({ pressed }) => [styles.match, selected.reference.id === result.reference.id && styles.matchSelected, pressed && styles.pressed]}><View style={styles.matchIdentity}><Text style={styles.matchName}>{String(index + 1).padStart(2, "0")} · {result.reference.shortLabel}</Text><Text style={styles.matchStyle}>{result.reference.styleTitle}</Text></View><Text style={styles.matchScore}>{result.fitScore}%</Text><Text style={styles.matchStatus}>POSE</Text></Pressable>)}</View>
          <Text style={styles.disclaimer}>모든 참조는 영상 요약 지표로 표현 폭을 조절한 생체역학 참조 애니메이션입니다. 이 화면은 실명, 선수 3D 복제, 공식 3D 계측값 또는 임상적 신체 적합도를 주장하지 않습니다.</Text>
        </View>

        <View style={styles.block}>
          <BlockHead title="16개 익명 참조 모션" detail="선수 이름·링크를 노출하지 않는 특성 기반 라이브러리입니다." />
          <Text style={styles.librarySummary}>선택됨: {selected.reference.shortLabel} · {selected.reference.styleTitle} · {topAlignment.label} 우선</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function BlockHead({ title, detail }: { title: string; detail: string }) {
  return <View style={styles.blockHead}><Text style={styles.blockTitle}>{title}</Text><Text style={styles.blockDetail}>{detail}</Text></View>;
}

function VideoDrop({ slot, value, onPress }: { slot: VideoSlot; value?: string; onPress: () => void }) {
  const copy = SLOT_COPY[slot];
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.drop, value && styles.dropSelected, pressed && styles.pressed]} accessibilityRole="button"><Text style={styles.dropTitle}>{copy.label}</Text><Text style={styles.dropDetail}>{copy.detail}</Text><View style={styles.dropFile}><MaterialIcons name="video-library" size={14} color="#64748B" /><Text numberOfLines={1} style={styles.dropFileText}>{value ?? "파일 선택"}</Text></View></Pressable>;
}

function ScoreTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <View style={[styles.scoreTile, accent && styles.scoreTileAccent]}><Text style={styles.scoreLabel}>{label}</Text><Text numberOfLines={1} style={styles.scoreValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  courtBackground: { backgroundColor: "#F4F7FB", bottom: 0, left: 0, overflow: "hidden", position: "absolute", right: 0, top: 0 },
  orangeWash: { backgroundColor: "rgba(249,115,22,0.08)", height: 280, left: 0, position: "absolute", right: 0, top: 0 },
  greenGlow: { backgroundColor: "rgba(22,163,74,0.10)", borderRadius: 320, height: 420, position: "absolute", right: -210, top: -90, width: 420 },
  courtLine: { backgroundColor: "rgba(30,58,95,0.045)", bottom: 0, position: "absolute", top: 0, width: 1 },
  page: { alignSelf: "center", maxWidth: 960, paddingBottom: 80, paddingHorizontal: 16, paddingTop: 34, width: "100%" }, pageNarrow: { paddingBottom: 48, paddingTop: 24 },
  hero: { marginBottom: 32 }, eyebrow: { color: "#EA580C", fontFamily: "BarlowCondensed-SemiBold", fontSize: 13, letterSpacing: 2.5 }, heroTitle: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 58, letterSpacing: -1.4, lineHeight: 55, marginTop: 7, textTransform: "uppercase" }, heroTitleNarrow: { fontSize: 42, lineHeight: 42 }, sub: { color: "#64748B", fontFamily: "Barlow", fontSize: 16, lineHeight: 24, marginTop: 13, maxWidth: 610 }, metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 }, pill: { backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderRadius: 0, borderWidth: 2, paddingHorizontal: 11, paddingVertical: 6 }, okPill: { borderColor: "#16A34A" }, pillText: { color: "#64748B", fontFamily: "Barlow-SemiBold", fontSize: 11, letterSpacing: 0.5 }, okPillText: { color: "#15803D", fontFamily: "Barlow-SemiBold", fontSize: 11, letterSpacing: 0.5 },
  steps: { flexDirection: "row", gap: 10, marginBottom: 24 }, oneColumn: { flexDirection: "column" }, step: { alignItems: "baseline", backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderRadius: 0, borderWidth: 2, flex: 1, flexDirection: "row", gap: 9, paddingHorizontal: 14, paddingVertical: 12 }, stepActive: { backgroundColor: "#FFF7ED", borderColor: "#F97316" }, stepDone: { backgroundColor: "#F0FDF4", borderColor: "#16A34A" }, stepNumber: { color: "#64748B", fontFamily: "BarlowCondensed-Bold", fontSize: 23 }, stepNumberActive: { color: "#EA580C" }, stepNumberDone: { color: "#16A34A" }, stepLabel: { color: "#0F172A", fontFamily: "BarlowCondensed-SemiBold", fontSize: 17, letterSpacing: 0.6, textTransform: "uppercase" },
  block: { backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderRadius: 0, borderWidth: 2, marginBottom: 24, padding: 22, shadowColor: "#0F172A", shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.08, shadowRadius: 24 }, blockHead: { marginBottom: 18 }, blockTitle: { color: "#0F172A", fontFamily: "BarlowCondensed-Bold", fontSize: 30, letterSpacing: 0.5, textTransform: "uppercase" }, blockDetail: { color: "#64748B", fontFamily: "Barlow", fontSize: 14, lineHeight: 20, marginTop: 3 },
  uploadGrid: { flexDirection: "row", gap: 12 }, drop: { backgroundColor: "#F8FAFC", borderColor: "#DBE3EE", borderRadius: 0, borderStyle: "dashed", borderWidth: 2, flex: 1, minHeight: 126, padding: 15 }, dropSelected: { backgroundColor: "#FFF7ED", borderColor: "#F97316", borderStyle: "solid" }, dropTitle: { color: "#0F172A", fontFamily: "BarlowCondensed-Bold", fontSize: 22, letterSpacing: 0.8 }, dropDetail: { color: "#64748B", fontFamily: "Barlow", fontSize: 12, marginTop: 1 }, dropFile: { alignItems: "center", flexDirection: "row", gap: 6, marginTop: 14 }, dropFileText: { color: "#64748B", flex: 1, fontFamily: "Barlow", fontSize: 12 }, uploadBoundary: { color: "#64748B", fontFamily: "Barlow", fontSize: 12, lineHeight: 18, marginTop: 12 },
  toolbar: { alignItems: "flex-end", flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 18 }, toolbarNarrow: { alignItems: "stretch" }, field: { gap: 5 }, fieldLabel: { color: "#64748B", fontFamily: "Barlow-SemiBold", fontSize: 12 }, handRow: { flexDirection: "row" }, handButton: { backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderWidth: 2, marginRight: -2, minWidth: 55, paddingHorizontal: 12, paddingVertical: 10 }, handButtonActive: { backgroundColor: "#FFF7ED", borderColor: "#F97316", zIndex: 1 }, handText: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 15, letterSpacing: 0.3 }, handTextActive: { color: "#EA580C" }, goalCallout: { borderLeftColor: "#F97316", borderLeftWidth: 4, paddingLeft: 10 }, goalCalloutText: { color: "#1E3A5F", fontFamily: "Barlow-SemiBold", fontSize: 14, marginTop: 3 }, goalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 }, goalTile: { backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderRadius: 0, borderWidth: 2, flexBasis: "47%", flexGrow: 1, padding: 14 }, goalTileActive: { backgroundColor: "#FFF7ED", borderColor: "#F97316" }, goalTitle: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 20, letterSpacing: 0.5, textTransform: "uppercase" }, goalDescription: { color: "#64748B", fontFamily: "Barlow", fontSize: 12, lineHeight: 17, marginTop: 3 }, appliedLine: { alignItems: "center", backgroundColor: "#FFF7ED", borderLeftColor: "#F97316", borderLeftWidth: 4, flexDirection: "row", gap: 7, marginTop: 14, paddingHorizontal: 11, paddingVertical: 10 }, appliedText: { color: "#1E3A5F", flex: 1, fontFamily: "Barlow-SemiBold", fontSize: 13 },
  scoreboard: { flexDirection: "row", gap: 12 }, scoreTile: { backgroundColor: "#F8FAFC", borderColor: "#DBE3EE", borderRadius: 0, borderWidth: 2, flex: 1, minHeight: 104, padding: 14 }, scoreTileAccent: { backgroundColor: "#FFF7ED", borderColor: "#F97316" }, scoreLabel: { color: "#64748B", fontFamily: "BarlowCondensed-SemiBold", fontSize: 13, letterSpacing: 1.2 }, scoreValue: { color: "#0F172A", fontFamily: "BarlowCondensed-Bold", fontSize: 29, letterSpacing: 0.2, marginTop: 6, textTransform: "uppercase" }, sectionTitle: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 20, letterSpacing: 1, marginTop: 24, textTransform: "uppercase" }, phaseLead: { color: "#64748B", fontFamily: "Barlow", fontSize: 13, lineHeight: 19, marginBottom: 11, marginTop: 4 }, metrics: { flexDirection: "row", gap: 9, marginTop: 10 }, metric: { backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderRadius: 0, borderWidth: 2, flex: 1, minHeight: 78, padding: 11 }, metricLabel: { color: "#64748B", fontFamily: "BarlowCondensed-SemiBold", fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase" }, metricValue: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 24, marginTop: 3 }, metricUnit: { color: "#64748B", fontFamily: "Barlow", fontSize: 12 },
  feedbackList: { gap: 7, marginTop: 10 }, focusTitle: { color: "#0F172A", fontFamily: "Barlow-SemiBold", fontSize: 16 }, feedbackText: { color: "#0F172A", flex: 1, fontFamily: "Barlow", fontSize: 14, lineHeight: 21 }, reasonRow: { flexDirection: "row", gap: 8 }, reasonMarker: { color: "#F97316", fontFamily: "BarlowCondensed-Bold", fontSize: 18 }, matchList: { gap: 8, marginTop: 10 }, match: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderRadius: 0, borderWidth: 2, flexDirection: "row", gap: 12, paddingHorizontal: 14, paddingVertical: 11 }, matchSelected: { backgroundColor: "#FFF7ED", borderColor: "#F97316" }, matchIdentity: { flex: 1 }, matchName: { color: "#0F172A", fontFamily: "BarlowCondensed-Bold", fontSize: 18, letterSpacing: 0.4, textTransform: "uppercase" }, matchStyle: { color: "#64748B", fontFamily: "Barlow", fontSize: 12, marginTop: 1 }, matchScore: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 22 }, matchStatus: { color: "#64748B", fontFamily: "BarlowCondensed-SemiBold", fontSize: 11, letterSpacing: 0.8 }, disclaimer: { color: "#64748B", fontFamily: "Barlow", fontSize: 12, lineHeight: 18, marginTop: 18 }, librarySummary: { borderLeftColor: "#16A34A", borderLeftWidth: 4, color: "#1E3A5F", fontFamily: "Barlow-SemiBold", fontSize: 14, paddingLeft: 10 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
