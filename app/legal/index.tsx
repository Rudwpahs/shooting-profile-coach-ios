import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { tokens } from "@/constants/tokens";
import { LEGAL_CONFIG, getLegalReleaseBlockers, legalValue } from "@/lib/compliance/legal-config";

type LegalTarget = "/legal/privacy" | "/legal/terms" | "/legal/cookies";

export default function LegalIndexScreen() {
  const router = useRouter();
  const blockers = getLegalReleaseBlockers();
  const operator = legalValue(LEGAL_CONFIG.operatorName, "운영자명");
  const support = legalValue(LEGAL_CONFIG.supportEmail, "고객지원 이메일");

  const go = (target: LegalTarget) => router.push(target as never);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityLabel="이전 화면으로 돌아가기"
          accessibilityRole="button"
          focusable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="chevron-left" size={20} color={tokens.foreground} />
          <Text style={styles.backText}>뒤로</Text>
        </Pressable>

        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>Legal & Privacy</Text>
          <Text style={styles.subtitle}>개인정보, 이용 조건과 웹 쿠키 정보를 한곳에서 확인합니다.</Text>
        </View>

        <View style={styles.card}>
          <LegalRow label="개인정보 처리방침" onPress={() => go("/legal/privacy")} />
          <LegalRow label="이용약관" onPress={() => go("/legal/terms")} />
          <LegalRow label="쿠키 안내" onPress={() => go("/legal/cookies")} />
        </View>

        <View style={styles.infoCard}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>운영 및 지원</Text>
          <Text style={styles.copy}>운영자: {operator}</Text>
          <Text style={styles.copy}>지원: {support}</Text>
          {LEGAL_CONFIG.businessInfo ? <Text style={styles.copy}>{LEGAL_CONFIG.businessInfo}</Text> : null}
        </View>

        {blockers.length > 0 ? (
          <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.blockerCard}>
            <Text style={styles.blockerTitle}>개발 빌드 · 출시 정보 미완료</Text>
            <Text style={styles.copy}>실제 운영자·연락처·공개 정책 URL·Firestore 리전이 모두 확인되기 전에는 출시 준비 완료로 처리하지 않습니다.</Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

function LegalRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      focusable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.rowText}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color={tokens.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 32, paddingHorizontal: 18, paddingTop: 12 },
  backButton: { alignItems: "center", alignSelf: "flex-start", borderRadius: 10, flexDirection: "row", gap: 4, minHeight: 44, minWidth: 44, paddingHorizontal: 6 },
  backText: { color: tokens.foreground, fontSize: 14, fontWeight: "700" },
  pressed: { opacity: 0.8 },
  header: { gap: 6 },
  title: { color: tokens.foreground, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: tokens.mutedForeground, fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  row: { alignItems: "center", borderBottomColor: tokens.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", minHeight: 52, paddingHorizontal: 14 },
  rowText: { color: tokens.foreground, fontSize: 15, fontWeight: "700" },
  infoCard: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 14, borderWidth: 1, gap: 7, padding: 14 },
  blockerCard: { backgroundColor: tokens.elevatedSurface, borderColor: tokens.warning, borderRadius: 14, borderWidth: 1, gap: 7, padding: 14 },
  sectionTitle: { color: tokens.foreground, fontSize: 15, fontWeight: "800" },
  blockerTitle: { color: tokens.warning, fontSize: 14, fontWeight: "800" },
  copy: { color: tokens.mutedForeground, fontSize: 13, lineHeight: 19 },
});
