import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PrimaryButton, SectionCard, StatusPill, palette, ScreenTitle } from "@/components/formpath-ui";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { useProfile } from "@/lib/profile-store";
import { recommendShotForms } from "@/lib/recommendation";
import { PoseMotionViewer } from "@/components/pose-motion-viewer";

export default function HomeScreen() {
  const router = useRouter();
  const { profile, ready } = useProfile();
  const recommendation = recommendShotForms(profile)[0];
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <ScreenTitle eyebrow="FORMPATH / TODAY" title="내 몸에 맞는 한 가지 흐름." detail="선수 이름 없이 16개 익명 슛폼의 움직임 특성과 비교합니다." />
    <SectionCard tone="navy"><StatusPill tone="warning">16 YOUTUBE POSE MODELS · NOT METRIC 3D</StatusPill><Text style={styles.navyHeading}>{recommendation.reference.shortLabel}</Text><Text style={styles.navyBody}>{recommendation.reference.styleTitle}</Text><View style={styles.scoreRow}><View><Text style={styles.score}>{recommendation.fitScore}</Text><Text style={styles.scoreLabel}>내 조건 적합도</Text></View><View style={styles.scoreRule} /><View style={styles.scoreTextWrap}><Text style={styles.scoreText}>{recommendation.focus.title}</Text><Text style={styles.scoreDetail}>{recommendation.reasons[0]}</Text></View></View></SectionCard>
    <PoseMotionViewer reference={recommendation.reference} />
    <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>왜 이 모션인가요</Text><Text style={styles.sectionMeta}>LOCAL ONLY</Text></View>
    <SectionCard tone="sand"><Text style={styles.cardEyebrow}>조건 적합도 {recommendation.bodyFitScore}/100</Text><Text style={styles.cardTitle}>{recommendation.reasons[1]}</Text><Text style={styles.cardBody}>{recommendation.focus.detail}</Text><PrimaryButton label="내 조건 다시 조정하기" onPress={() => { haptic.light(); router.push("/assessment"); }} icon={<IconSymbol name="chevron.right" size={19} color="#FFFFFF" />} /></SectionCard>
    <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>추천의 기준</Text><Text style={styles.sectionMeta}>{ready ? "준비됨" : "불러오는 중"}</Text></View>
    <View style={styles.traitGrid}><TraitBlock title="목표" value={{ consistency: "일관성", range: "거리", release: "릴리스", rhythm: "리듬" }[profile.goal]} /><TraitBlock title="희망 스타일" value={{ quick: "빠른 리듬", power: "힘 연결", "high-release": "높은 릴리스", balanced: "균형형" }[profile.preferredStyle]} /><TraitBlock title="하체 힘" value={{ compact: "가볍게", balanced: "균형", extended: "강하게" }[profile.body.lowerBodyPower]} /><TraitBlock title="어깨 범위" value={{ compact: "제한적", balanced: "균형", extended: "넓은 편" }[profile.body.shoulderMobility]} /></View>
    <Text style={styles.footnote}>이 추천은 단일 시점 YouTube pose의 익명 특성 비교입니다. 신체 통증·부상·의학적 판단을 대신하지 않으며, 보정된 metric 3D 측정도 아닙니다.</Text>
  </ScrollView></ScreenContainer>;
}
function TraitBlock({ title, value }: { title: string; value: string }) { return <View style={styles.traitBlock}><Text style={styles.traitLabel}>{title}</Text><Text style={styles.traitValue}>{value}</Text></View>; }
const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 32, gap: 16 }, navyHeading: { color: palette.white, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 }, navyBody: { color: "#C9D8E4", fontSize: 15, lineHeight: 22 }, scoreRow: { alignItems: "center", flexDirection: "row", gap: 14, marginTop: 4 }, score: { color: "#FFAB89", fontSize: 34, fontWeight: "800" }, scoreLabel: { color: "#C9D8E4", fontSize: 11, fontWeight: "700" }, scoreRule: { backgroundColor: "#35526A", height: 42, width: 1 }, scoreTextWrap: { flex: 1, gap: 3 }, scoreText: { color: palette.white, fontSize: 15, fontWeight: "800" }, scoreDetail: { color: "#C9D8E4", fontSize: 12, lineHeight: 17 }, sectionHeader: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", marginTop: 6 }, sectionTitle: { color: palette.ink, fontSize: 18, fontWeight: "800" }, sectionMeta: { color: palette.steel, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 }, cardEyebrow: { color: palette.orange, fontSize: 12, fontWeight: "800", letterSpacing: 0.8 }, cardTitle: { color: palette.ink, fontSize: 19, fontWeight: "800", lineHeight: 27 }, cardBody: { color: palette.steel, fontSize: 14, lineHeight: 20 }, traitGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, traitBlock: { backgroundColor: palette.white, borderColor: palette.mist, borderRadius: 16, borderWidth: 1, minWidth: "47%", padding: 14 }, traitLabel: { color: palette.steel, fontSize: 12, fontWeight: "700" }, traitValue: { color: palette.ink, fontSize: 17, fontWeight: "800", marginTop: 5 }, footnote: { color: palette.steel, fontSize: 12, lineHeight: 18, marginTop: 4 } });
