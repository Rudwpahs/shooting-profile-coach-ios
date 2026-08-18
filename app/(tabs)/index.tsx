import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { PrimaryButton, SectionCard, StatusPill, palette, ScreenTitle } from "@/components/formpath-ui";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { useProfile } from "@/lib/profile-store";
import { recommendArchetypes } from "@/lib/recommendation";

export default function HomeScreen() {
  const router = useRouter();
  const { profile, ready } = useProfile();
  const recommendation = recommendArchetypes(profile)[0];

  return (
    <ScreenContainer className="" containerClassName="" safeAreaClassName="" >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTitle eyebrow="FORMPATH / TODAY" title="한 번에, 하나의 변화." detail="선수 이름 대신 내 목표와 내 슛 특성에 집중합니다." />

        <SectionCard tone="navy">
          <StatusPill tone="warning">PROVISIONAL REFERENCE LIBRARY</StatusPill>
          <Text style={styles.navyHeading}>{recommendation.archetype.shortLabel}</Text>
          <Text style={styles.navyBody}>{recommendation.archetype.description}</Text>
          <View style={styles.scoreRow}>
            <View><Text style={styles.score}>{recommendation.fitScore}</Text><Text style={styles.scoreLabel}>현재 목표 적합도</Text></View>
            <View style={styles.scoreRule} />
            <View style={styles.scoreTextWrap}><Text style={styles.scoreText}>{recommendation.focus.title}</Text><Text style={styles.scoreDetail}>오늘은 한 가지 움직임만 고정해 보세요.</Text></View>
          </View>
        </SectionCard>

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>오늘의 다음 행동</Text><Text style={styles.sectionMeta}>LOCAL ONLY</Text></View>
        <SectionCard tone="sand">
          <Text style={styles.cardEyebrow}>15분 연습</Text>
          <Text style={styles.cardTitle}>{recommendation.focus.drill}</Text>
          <Text style={styles.cardBody}>{recommendation.focus.detail}</Text>
          <PrimaryButton label="내 특성 평가하기" onPress={() => { haptic.light(); router.push("/assessment"); }} icon={<IconSymbol name="chevron.right" size={19} color="#FFFFFF" />} />
        </SectionCard>

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>추천의 기준</Text><Text style={styles.sectionMeta}>{ready ? "준비됨" : "불러오는 중"}</Text></View>
        <View style={styles.traitGrid}>
          <TraitBlock title="목표" value={{ consistency: "일관성", range: "거리", release: "릴리스", rhythm: "리듬" }[profile.goal]} />
          <TraitBlock title="레벨" value={{ beginner: "기초", developing: "성장 중", advanced: "경기 준비" }[profile.skillLevel]} />
          <TraitBlock title="리듬" value={`${profile.traits.rhythm}/100`} />
          <TraitBlock title="하체 드라이브" value={`${profile.traits.lowerBodyDrive}/100`} />
        </View>
        <Text style={styles.footnote}>이 앱은 의료 평가나 선수 식별 도구가 아닙니다. reference의 검증 상태는 라이브러리와 설정에서 확인할 수 있습니다.</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function TraitBlock({ title, value }: { title: string; value: string }) {
  return <View style={styles.traitBlock}><Text style={styles.traitLabel}>{title}</Text><Text style={styles.traitValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 32, gap: 16 },
  navyHeading: { color: palette.white, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  navyBody: { color: "#C9D8E4", fontSize: 15, lineHeight: 22 },
  scoreRow: { alignItems: "center", flexDirection: "row", gap: 14, marginTop: 4 },
  score: { color: "#FFAB89", fontSize: 34, fontWeight: "800" },
  scoreLabel: { color: "#C9D8E4", fontSize: 11, fontWeight: "700" },
  scoreRule: { backgroundColor: "#35526A", height: 42, width: 1 },
  scoreTextWrap: { flex: 1, gap: 3 },
  scoreText: { color: palette.white, fontSize: 15, fontWeight: "800" },
  scoreDetail: { color: "#C9D8E4", fontSize: 12, lineHeight: 17 },
  sectionHeader: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  sectionTitle: { color: palette.ink, fontSize: 18, fontWeight: "800" },
  sectionMeta: { color: palette.steel, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  cardEyebrow: { color: palette.orange, fontSize: 12, fontWeight: "800", letterSpacing: 0.8 },
  cardTitle: { color: palette.ink, fontSize: 19, fontWeight: "800", lineHeight: 27 },
  cardBody: { color: palette.steel, fontSize: 14, lineHeight: 20 },
  traitGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  traitBlock: { backgroundColor: palette.white, borderColor: palette.mist, borderRadius: 16, borderWidth: 1, minWidth: "47%", padding: 14 },
  traitLabel: { color: palette.steel, fontSize: 12, fontWeight: "700" },
  traitValue: { color: palette.ink, fontSize: 17, fontWeight: "800", marginTop: 5 },
  footnote: { color: palette.steel, fontSize: 12, lineHeight: 18, marginTop: 4 },
});
