import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { ANONYMOUS_POSE_LIBRARY_STATUS } from "@/lib/anonymous-pose-library";
import { useProfile } from "@/lib/profile-store";
import { getGoalApplicationSummary, getPracticeFocus } from "@/lib/recommendation";

export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useProfile();
  const focus = getPracticeFocus(profile.goal);
  const goalLabel = profile.goal === "release" ? "릴리스" : profile.goal === "range" ? "거리" : profile.goal === "rhythm" ? "리듬" : "일관성";

  return <ScreenContainer containerClassName="bg-background">
    <View style={styles.canvas}><View style={styles.courtArc} /><View style={styles.courtLine} /></View>
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View><Text style={styles.kicker}>FORMPATH / PRACTICE</Text><Text style={styles.title}>오늘의 리듬</Text></View>
        <Pressable onPress={() => router.navigate("/profile" as never)} style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]} accessibilityLabel="내 기록 열기">
          <MaterialIcons name="person-outline" size={23} color="#F5F1E8" />
        </Pressable>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroGrid} />
        <View style={styles.heroTop}><View style={styles.focusTag}><View style={styles.signalDot} /><Text style={styles.focusTagText}>TODAY'S FOCUS</Text></View><Text style={styles.goalNumber}>01</Text></View>
        <Text style={styles.heroTitle}>{focus.title}</Text>
        <Text style={styles.heroCopy}>{focus.detail}</Text>
        <View style={styles.drillRow}><MaterialIcons name="sports-basketball" size={18} color="#F97316" /><Text style={styles.drillText}>{focus.drill}</Text></View>
        <Pressable onPress={() => router.navigate("/motion" as never)} style={({ pressed }) => [styles.heroAction, pressed && styles.pressed]}>
          <Text style={styles.heroActionText}>모션 분석 시작</Text><MaterialIcons name="arrow-forward" size={19} color="#0B1623" />
        </Pressable>
      </View>

      <View style={styles.metrics}>
        <Metric icon="track-changes" value={goalLabel} label="현재 목표" />
        <Metric icon="verified" value={`${ANONYMOUS_POSE_LIBRARY_STATUS.profileCount}개`} label="검증 모션" />
        <Metric icon="lock-outline" value="비공개" label="내 기록" />
      </View>

      <View style={styles.sectionHead}><View><Text style={styles.sectionKicker}>NEXT UP</Text><Text style={styles.sectionTitle}>다음 움직임</Text></View><Text style={styles.sectionIndex}>02 / 03</Text></View>
      <View style={styles.actionStack}>
        <ActionRow icon="accessibility-new" title="슛폼 분석" detail="Curry · Paul George 분석과 검증 모션을 확인합니다." tone="orange" onPress={() => router.navigate("/motion" as never)} />
        <ActionRow icon="folder-shared" title="내 분석 보관함" detail="저장한 개인 스켈레톤과 계정 상태를 관리합니다." tone="mint" onPress={() => router.navigate("/profile" as never)} />
      </View>

      <View style={styles.statusStrip}><View style={styles.statusIcon}><MaterialIcons name="verified" size={18} color="#1D9B77" /></View><View style={styles.statusTextWrap}><Text style={styles.statusEyebrow}>VERIFIED REFERENCE</Text><Text style={styles.statusText}>{getGoalApplicationSummary(profile.goal)}</Text></View><MaterialIcons name="chevron-right" size={23} color="#F5F1E8" /></View>
    </ScrollView>
  </ScreenContainer>;
}

function Metric({ icon, value, label }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; value: string; label: string }) {
  return <View style={styles.metric}><MaterialIcons name={icon} size={18} color="#F97316" /><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function ActionRow({ icon, title, detail, tone, onPress }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; title: string; detail: string; tone: "orange" | "mint"; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}><View style={[styles.actionIcon, tone === "mint" && styles.actionIconMint]}><MaterialIcons name={icon} size={23} color={tone === "mint" ? "#1D9B77" : "#F97316"} /></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionDetail}>{detail}</Text></View><MaterialIcons name="arrow-forward" size={20} color="#102235" /></Pressable>;
}

const styles = StyleSheet.create({
  canvas: { backgroundColor: "#F5F1E8", bottom: 0, left: 0, overflow: "hidden", position: "absolute", right: 0, top: 0 },
  courtArc: { borderColor: "rgba(16,34,53,0.08)", borderRadius: 300, borderWidth: 1, height: 480, left: -278, position: "absolute", top: -190, width: 480 },
  courtLine: { backgroundColor: "rgba(249,115,22,0.22)", height: 1, position: "absolute", right: 0, top: 112, width: 96 },
  page: { alignSelf: "center", maxWidth: 680, paddingBottom: 116, paddingHorizontal: 16, paddingTop: 20, width: "100%" },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  kicker: { color: "#F97316", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 1.7 },
  title: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 45, letterSpacing: -1.1, lineHeight: 49, marginTop: 2 },
  profileButton: { alignItems: "center", backgroundColor: "#102235", borderRadius: 16, height: 48, justifyContent: "center", width: 48 },
  heroCard: { backgroundColor: "#0B1623", borderRadius: 24, marginTop: 20, minHeight: 315, overflow: "hidden", padding: 20 },
  heroGrid: { borderColor: "rgba(231,237,241,0.08)", borderRadius: 160, borderWidth: 1, height: 310, position: "absolute", right: -95, top: -105, width: 310 },
  heroTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  focusTag: { alignItems: "center", flexDirection: "row", gap: 7 },
  signalDot: { backgroundColor: "#F97316", borderRadius: 99, height: 7, width: 7 },
  focusTagText: { color: "#E7EDF1", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 1.2 },
  goalNumber: { color: "rgba(231,237,241,0.38)", fontFamily: "BarlowCondensed-Bold", fontSize: 20, letterSpacing: 1 },
  heroTitle: { color: "#F5F1E8", fontFamily: "BarlowCondensed-Bold", fontSize: 34, lineHeight: 36, marginTop: 28, maxWidth: "88%" },
  heroCopy: { color: "#B6C2CD", fontFamily: "Barlow", fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: "88%" },
  drillRow: { alignItems: "flex-start", borderTopColor: "rgba(231,237,241,0.14)", borderTopWidth: 1, flexDirection: "row", gap: 8, marginTop: 20, paddingTop: 13 },
  drillText: { color: "#E7EDF1", flex: 1, fontFamily: "Barlow-SemiBold", fontSize: 12, lineHeight: 18 },
  heroAction: { alignItems: "center", backgroundColor: "#F97316", borderRadius: 15, flexDirection: "row", gap: 9, justifyContent: "center", marginTop: 16, minHeight: 49 },
  heroActionText: { color: "#0B1623", fontFamily: "BarlowCondensed-Bold", fontSize: 16, letterSpacing: 0.4 },
  metrics: { backgroundColor: "#FFFEFA", borderColor: "#D9E0E4", borderRadius: 18, borderWidth: 1, flexDirection: "row", marginTop: 14, paddingVertical: 14 },
  metric: { alignItems: "center", flex: 1, gap: 3 },
  metricValue: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 19 },
  metricLabel: { color: "#667789", fontFamily: "Barlow-SemiBold", fontSize: 10 },
  sectionHead: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginTop: 27 },
  sectionKicker: { color: "#F97316", fontFamily: "BarlowCondensed-Bold", fontSize: 11, letterSpacing: 1.2 },
  sectionTitle: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 28, marginTop: 1 },
  sectionIndex: { color: "#667789", fontFamily: "BarlowCondensed-Bold", fontSize: 12, letterSpacing: 0.8 },
  actionStack: { gap: 10, marginTop: 12 },
  actionRow: { alignItems: "center", backgroundColor: "#FFFEFA", borderColor: "#D9E0E4", borderRadius: 18, borderWidth: 1, flexDirection: "row", gap: 12, minHeight: 82, paddingHorizontal: 14 },
  actionIcon: { alignItems: "center", backgroundColor: "#FFF1E8", borderRadius: 13, height: 46, justifyContent: "center", width: 46 },
  actionIconMint: { backgroundColor: "#E8F6F1" },
  actionCopy: { flex: 1 },
  actionTitle: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 19 },
  actionDetail: { color: "#667789", fontFamily: "Barlow", fontSize: 12, lineHeight: 16, marginTop: 1 },
  statusStrip: { alignItems: "center", backgroundColor: "#102235", borderRadius: 18, flexDirection: "row", gap: 10, marginTop: 16, minHeight: 72, paddingHorizontal: 14 },
  statusIcon: { alignItems: "center", backgroundColor: "rgba(29,155,119,0.16)", borderRadius: 12, height: 38, justifyContent: "center", width: 38 },
  statusTextWrap: { flex: 1 },
  statusEyebrow: { color: "#7AD8B7", fontFamily: "BarlowCondensed-Bold", fontSize: 10, letterSpacing: 1.2 },
  statusText: { color: "#F5F1E8", fontFamily: "Barlow-SemiBold", fontSize: 12, lineHeight: 17, marginTop: 2 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
