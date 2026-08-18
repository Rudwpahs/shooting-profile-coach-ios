import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { PrimaryButton, SectionCard, palette, ScreenTitle } from "@/components/formpath-ui";
import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { useProfile } from "@/lib/profile-store";
import { type SkillLevel, type TrainingGoal } from "@/lib/recommendation";

export default function AssessmentScreen() {
  const router = useRouter();
  const { profile, updateProfile } = useProfile();
  const [skillLevel, setSkillLevel] = useState<SkillLevel>(profile.skillLevel);
  const [goal, setGoal] = useState<TrainingGoal>(profile.goal);
  const [traits, setTraits] = useState(profile.traits);
  const summary = useMemo(() => ({ skillLevel, goal, traits }), [skillLevel, goal, traits]);

  const save = async () => {
    await updateProfile(summary);
    haptic.success();
    router.replace("/");
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTitle eyebrow="LOCAL ASSESSMENT" title="내 슛 특성" detail="이름이나 신체 치수 없이, 지금 바꾸고 싶은 움직임만 기록합니다." />
        <SectionCard>
          <Text style={styles.label}>현재 레벨</Text>
          <View style={styles.optionRow}>
            <Choice label="기초" selected={skillLevel === "beginner"} onPress={() => { setSkillLevel("beginner"); haptic.selection(); }} />
            <Choice label="성장 중" selected={skillLevel === "developing"} onPress={() => { setSkillLevel("developing"); haptic.selection(); }} />
            <Choice label="경기 준비" selected={skillLevel === "advanced"} onPress={() => { setSkillLevel("advanced"); haptic.selection(); }} />
          </View>
        </SectionCard>
        <SectionCard>
          <Text style={styles.label}>가장 원하는 변화</Text>
          <View style={styles.goalStack}>
            <GoalChoice title="일관성" detail="매번 같은 준비와 릴리스" selected={goal === "consistency"} onPress={() => { setGoal("consistency"); haptic.selection(); }} />
            <GoalChoice title="거리" detail="하체에서 시작되는 힘의 연결" selected={goal === "range"} onPress={() => { setGoal("range"); haptic.selection(); }} />
            <GoalChoice title="릴리스" detail="안정적이고 편안한 공의 출발점" selected={goal === "release"} onPress={() => { setGoal("release"); haptic.selection(); }} />
            <GoalChoice title="리듬" detail="캐치부터 팔로우스루까지의 흐름" selected={goal === "rhythm"} onPress={() => { setGoal("rhythm"); haptic.selection(); }} />
          </View>
        </SectionCard>
        <SectionCard tone="sand">
          <Text style={styles.label}>내가 느끼는 현재 특성</Text>
          <Text style={styles.helper}>정확한 관절각이 아니라 현재의 체감과 촬영 관찰을 0–100으로 가볍게 기록합니다.</Text>
          <TraitStepper label="릴리스 높이" value={traits.releaseElevation} onChange={(value) => setTraits({ ...traits, releaseElevation: value })} />
          <TraitStepper label="팔의 확장" value={traits.armExtension} onChange={(value) => setTraits({ ...traits, armExtension: value })} />
          <TraitStepper label="하체 드라이브" value={traits.lowerBodyDrive} onChange={(value) => setTraits({ ...traits, lowerBodyDrive: value })} />
          <TraitStepper label="동작 리듬" value={traits.rhythm} onChange={(value) => setTraits({ ...traits, rhythm: value })} />
        </SectionCard>
        <PrimaryButton label="이 특성으로 추천 보기" onPress={save} />
      </ScrollView>
    </ScreenContainer>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
}

function GoalChoice({ title, detail, selected, onPress }: { title: string; detail: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.goalChoice, selected && styles.goalSelected, pressed && styles.pressed]}><View><Text style={[styles.goalTitle, selected && styles.goalTitleSelected]}>{title}</Text><Text style={[styles.goalDetail, selected && styles.goalDetailSelected]}>{detail}</Text></View><Text style={[styles.check, selected && styles.checkSelected]}>{selected ? "✓" : ""}</Text></Pressable>;
}

function TraitStepper({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <View style={styles.stepper}><View><Text style={styles.stepperLabel}>{label}</Text><Text style={styles.stepperSub}>현재 {value}/100</Text></View><View style={styles.stepperControls}><Pressable onPress={() => { onChange(Math.max(0, value - 10)); haptic.selection(); }} style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}><Text style={styles.stepButtonText}>−</Text></Pressable><Text style={styles.valueText}>{value}</Text><Pressable onPress={() => { onChange(Math.min(100, value + 10)); haptic.selection(); }} style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}><Text style={styles.stepButtonText}>＋</Text></Pressable></View></View>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 32, gap: 16 },
  label: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  helper: { color: palette.steel, fontSize: 13, lineHeight: 19 },
  optionRow: { flexDirection: "row", gap: 8 },
  chip: { alignItems: "center", borderColor: palette.mist, borderRadius: 13, borderWidth: 1, flex: 1, minHeight: 43, justifyContent: "center", paddingHorizontal: 6 },
  chipSelected: { backgroundColor: palette.navy, borderColor: palette.navy },
  chipText: { color: palette.steel, fontSize: 12, fontWeight: "800" },
  chipTextSelected: { color: palette.white },
  goalStack: { gap: 8 },
  goalChoice: { alignItems: "center", borderColor: palette.mist, borderRadius: 16, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", padding: 13 },
  goalSelected: { backgroundColor: "#FFF0E9", borderColor: palette.orange },
  goalTitle: { color: palette.ink, fontSize: 15, fontWeight: "800" },
  goalTitleSelected: { color: "#B9421E" },
  goalDetail: { color: palette.steel, fontSize: 12, marginTop: 3 },
  goalDetailSelected: { color: "#B86A50" },
  check: { borderColor: palette.mist, borderRadius: 99, borderWidth: 1, color: palette.white, height: 21, textAlign: "center", width: 21 },
  checkSelected: { backgroundColor: palette.orange, borderColor: palette.orange },
  stepper: { alignItems: "center", borderTopColor: "#E7DDCB", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingTop: 12 },
  stepperLabel: { color: palette.ink, fontSize: 14, fontWeight: "800" },
  stepperSub: { color: palette.steel, fontSize: 11, marginTop: 3 },
  stepperControls: { alignItems: "center", flexDirection: "row", gap: 9 },
  stepButton: { alignItems: "center", backgroundColor: palette.white, borderColor: palette.mist, borderRadius: 99, borderWidth: 1, height: 34, justifyContent: "center", width: 34 },
  stepButtonText: { color: palette.ink, fontSize: 20, fontWeight: "700" },
  valueText: { color: palette.ink, fontSize: 16, fontWeight: "800", minWidth: 28, textAlign: "center" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
