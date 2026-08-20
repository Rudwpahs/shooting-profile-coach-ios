import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useProfile } from "@/lib/profile-store";
import { applyGoalSelection, getGoalApplicationSummary, TRAINING_GOALS, type TrainingGoal } from "@/lib/recommendation";

type Hand = "auto" | "right" | "left";

export default function AssessmentScreen() {
  const router = useRouter();
  const { profile, updateProfile } = useProfile();
  const chooseGoal = async (goal: TrainingGoal) => {
    const next = applyGoalSelection(profile, goal);
    await updateProfile({ goal: next.goal, preferredStyle: next.preferredStyle, traits: next.traits });
  };

  return <ScreenContainer><ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
    <Text style={styles.eyebrow}>SHOOTING FORM ANALYSIS</Text>
    <Text style={styles.title}>추천 기준</Text>
    <Text style={styles.detail}>레벨·신체 밴드·스타일·스테퍼는 사용하지 않습니다. 목표 하나가 승인된 익명 실제 모션의 점수와 순위에 바로 반영됩니다.</Text>
    <View style={styles.block}>
      <Text style={styles.blockTitle}>PERSON</Text>
      <Text style={styles.blockDetail}>핸드는 3D 표시 방향에만 반영됩니다. 익명 모션의 적합도 점수에는 추정 신체조건을 넣지 않습니다.</Text>
      <View style={styles.handRow}>{(["auto", "right", "left"] as Hand[]).map((hand) => <View key={hand} style={[styles.hand, hand === "auto" && styles.handActive]}><Text style={[styles.handText, hand === "auto" && styles.handTextActive]}>{hand}</Text></View>)}</View>
    </View>
    <View style={styles.block}>
      <Text style={styles.blockTitle}>MATCH</Text>
      <Text style={styles.blockDetail}>원하는 변화 하나를 선택하세요. 선택 즉시 기존 프로필에 저장되고, 승인된 익명 실제 모션의 적합도와 순위가 다시 계산됩니다.</Text>
      <View style={styles.goalStack}>{TRAINING_GOALS.map((goal) => <Pressable key={goal.id} onPress={() => chooseGoal(goal.id)} style={({ pressed }) => [styles.goal, profile.goal === goal.id && styles.goalActive, pressed && styles.pressed]}><View><Text style={styles.goalTitle}>{goal.title}</Text><Text style={styles.goalDetail}>{goal.description}</Text></View><Text style={styles.goalIndicator}>{profile.goal === goal.id ? "APPLIED" : ""}</Text></Pressable>)}</View>
      <View style={styles.applied}><Text style={styles.appliedText}>{getGoalApplicationSummary(profile.goal)}</Text></View>
      <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><Text style={styles.backText}>MATCH RESULTS 보기</Text></Pressable>
    </View>
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", maxWidth: 760, padding: 20, width: "100%" }, eyebrow: { color: "#EA580C", fontFamily: "BarlowCondensed-Bold", fontSize: 13, letterSpacing: 2 }, title: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 44, letterSpacing: -0.5, marginTop: 6, textTransform: "uppercase" }, detail: { color: "#64748B", fontFamily: "Barlow", fontSize: 15, lineHeight: 22, marginBottom: 20, marginTop: 7 }, block: { backgroundColor: "#FFFFFF", borderColor: "#DBE3EE", borderWidth: 2, marginBottom: 16, padding: 18 }, blockTitle: { color: "#0F172A", fontFamily: "BarlowCondensed-Bold", fontSize: 27, letterSpacing: 0.7 }, blockDetail: { color: "#64748B", fontFamily: "Barlow", fontSize: 13, lineHeight: 19, marginTop: 3 }, handRow: { flexDirection: "row", marginTop: 14 }, hand: { borderColor: "#DBE3EE", borderWidth: 2, marginRight: -2, minWidth: 64, paddingHorizontal: 12, paddingVertical: 9 }, handActive: { backgroundColor: "#FFF7ED", borderColor: "#F97316", zIndex: 1 }, handText: { color: "#64748B", fontFamily: "BarlowCondensed-Bold", fontSize: 16 }, handTextActive: { color: "#EA580C" }, goalStack: { gap: 8, marginTop: 14 }, goal: { alignItems: "center", borderColor: "#DBE3EE", borderWidth: 2, flexDirection: "row", justifyContent: "space-between", padding: 13 }, goalActive: { backgroundColor: "#FFF7ED", borderColor: "#F97316" }, goalTitle: { color: "#1E3A5F", fontFamily: "BarlowCondensed-Bold", fontSize: 20, letterSpacing: 0.5 }, goalDetail: { color: "#64748B", fontFamily: "Barlow", fontSize: 12, marginTop: 2 }, goalIndicator: { color: "#EA580C", fontFamily: "BarlowCondensed-Bold", fontSize: 13, letterSpacing: 0.6 }, applied: { backgroundColor: "#F0FDF4", borderLeftColor: "#16A34A", borderLeftWidth: 4, marginTop: 14, padding: 11 }, appliedText: { color: "#166534", fontFamily: "Barlow-SemiBold", fontSize: 13 }, backButton: { alignItems: "center", backgroundColor: "#16A34A", marginTop: 18, minHeight: 47, justifyContent: "center" }, backText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 17, letterSpacing: 0.7 }, pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
