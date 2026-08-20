import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenTitle, SectionCard, SecondaryButton, StatusPill, palette } from "@/components/formpath-ui";
import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { ANONYMOUS_POSE_LIBRARY_STATUS } from "@/lib/anonymous-pose-library";
import { useProfile } from "@/lib/profile-store";

export default function SettingsScreen() {
  const { clearProfile } = useProfile();
  const confirmClear = () => Alert.alert("로컬 프로필 초기화", "이 기기에 저장된 목표와 슛 특성을 기본값으로 되돌립니다. reference 데이터에는 영향을 주지 않습니다.", [
    { text: "취소", style: "cancel" },
    { text: "초기화", style: "destructive", onPress: async () => { await clearProfile(); haptic.success(); } },
  ]);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTitle eyebrow="SETTINGS" title="내 데이터, 내 공간." detail="목표 값은 기기에 보관하고, 로그인 후 개인 스켈레톤은 Firebase 개인 경로에 저장합니다." />
        <SectionCard>
          <Text style={styles.sectionTitle}>Reference data status</Text>
          <StatusPill tone="warning">PROTOTYPE · NAMED COMPARISON LABEL</StatusPill>
          <View style={styles.statRow}><Stat label="승인 실제 모션" value={`${ANONYMOUS_POSE_LIBRARY_STATUS.profileCount}`} /><Stat label="프로토타입 이름" value={ANONYMOUS_POSE_LIBRARY_STATUS.visiblePlayerIdentity ? "1" : "0"} /><Stat label="직접 source" value={`${ANONYMOUS_POSE_LIBRARY_STATUS.directSourceSequenceCount}`} /></View>
          <Text style={styles.body}>현재 Stephen Curry 표시는 prototype comparison label입니다. 실제 관절 모션 출처는 익명 CMU optical-mocap이며, 선수의 실측 3D 모델이라고 주장하지 않습니다.</Text>
        </SectionCard>
        <SectionCard tone="sand">
          <Text style={styles.sectionTitle}>개인정보 보호</Text>
          <Text style={styles.body}>프로토타입 이름은 화면 비교에만 사용하며 추천 점수에 반영하지 않습니다. 신체 치수·얼굴 인식·원본 영상은 저장하지 않으며, 개인 pose JSON은 로그인한 Firebase UID 경로에만 저장됩니다.</Text>
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
