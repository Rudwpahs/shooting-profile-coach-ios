import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenTitle, SectionCard, SecondaryButton, StatusPill, palette } from "@/components/formpath-ui";
import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { useProfile } from "@/lib/profile-store";
import { REFERENCE_LIBRARY_STATUS } from "@/lib/reference-library";

export default function SettingsScreen() {
  const { clearProfile } = useProfile();
  const confirmClear = () => Alert.alert("로컬 프로필 초기화", "이 기기에 저장된 목표와 슛 특성을 기본값으로 되돌립니다. reference 데이터에는 영향을 주지 않습니다.", [
    { text: "취소", style: "cancel" },
    { text: "초기화", style: "destructive", onPress: async () => { await clearProfile(); haptic.success(); } },
  ]);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTitle eyebrow="SETTINGS" title="내 데이터, 내 기기." detail="현재 버전은 프로필과 평가 값을 이 기기에만 보관합니다." />
        <SectionCard>
          <Text style={styles.sectionTitle}>Reference data status</Text>
          <StatusPill tone="warning">PROVISIONAL · COMMERCIALIZATION GATE OPEN</StatusPill>
          <View style={styles.statRow}><Stat label="익명 legacy profile" value={`${REFERENCE_LIBRARY_STATUS.anonymizedLegacyProfiles}`} /><Stat label="후보 source clip" value={`${REFERENCE_LIBRARY_STATUS.legacyCandidateClips}`} /><Stat label="검증된 reference" value={`${REFERENCE_LIBRARY_STATUS.verifiedReferenceCount}`} /></View>
          <Text style={styles.body}>{REFERENCE_LIBRARY_STATUS.message}</Text>
        </SectionCard>
        <SectionCard tone="sand">
          <Text style={styles.sectionTitle}>개인정보 보호</Text>
          <Text style={styles.body}>선수 이름, 신체 치수, 얼굴 인식, 원본 영상 링크는 추천에 사용하지 않습니다. 현재 개인 목표와 입력한 특성은 로컬 저장소에만 보관됩니다.</Text>
        </SectionCard>
        <SectionCard>
          <Text style={styles.sectionTitle}>로컬 데이터</Text>
          <Text style={styles.body}>처음부터 다시 시작하고 싶다면 이 기기의 개인 평가값만 삭제할 수 있습니다.</Text>
          <SecondaryButton label="로컬 프로필 초기화" destructive onPress={confirmClear} />
        </SectionCard>
      </ScrollView>
    </ScreenContainer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 32, gap: 16 },
  sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  body: { color: palette.steel, fontSize: 14, lineHeight: 20 },
  statRow: { flexDirection: "row", gap: 8 },
  stat: { backgroundColor: palette.sand, borderRadius: 14, flex: 1, padding: 10 },
  statValue: { color: palette.ink, fontSize: 19, fontWeight: "800" },
  statLabel: { color: palette.steel, fontSize: 10, fontWeight: "700", lineHeight: 14, marginTop: 3 },
});
