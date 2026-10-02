import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { PoseMotionViewer } from "@/components/pose-motion-viewer";
import { ScreenContainer } from "@/components/screen-container";
import { TopBar } from "@/components/ui/top-bar";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";

export default function LibraryScreen() {
  const router = useRouter();
  const [infoOpen, setInfoOpen] = useState(false);
  const reference = ANONYMOUS_POSE_REFERENCES[0];
  return (
    <ScreenContainer>
      <TopBar title="참조 동작" />
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        {reference ? <>
          <PoseMotionViewer compact motion={reference.motion} title={reference.styleTitle} hand="right" sourcePhaseFrames={reference.sourcePhaseFrames} />
          <View style={styles.caption}>
            <Text style={styles.motionTitle}>{reference.styleTitle}</Text>
            <Text style={styles.attribution}>CMU 모션 캡처 · 익명 참조</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="동작 정보" aria-expanded={infoOpen} accessibilityState={{ expanded: infoOpen }} onPress={() => setInfoOpen((value) => !value)} style={({ pressed }) => [styles.infoButton, pressed && styles.pressed]}>
            <Text style={styles.infoLabel}>동작 정보</Text>
            <MaterialCommunityIcons name={infoOpen ? "chevron-up" : "chevron-down"} size={20} color={tokens.mutedForeground} />
          </Pressable>
          {infoOpen ? <View style={styles.info}>
            <Text style={styles.infoText}>{reference.sourceAttribution}</Text>
            <Text style={styles.infoText}>광학 모션 캡처로 측정한 3D 참조 동작입니다. 화면의 움직임은 원본 단계 사이를 부드럽게 보간합니다.</Text>
            <Text style={styles.infoText}>원본 C3D 프레임{reference.sourcePhaseFrames ? `: ${reference.sourcePhaseFrames.join(" · ")}` : " 정보 없음"}</Text>
            <Text style={styles.infoText}>좌우로 드래그해 회전하고, 두 손가락으로 확대할 수 있습니다. 아래 점을 누르면 해당 단계로 이동합니다.</Text>
          </View> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="추천 목표 선택" onPress={() => router.replace("/assessment" as never)} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>추천 목표 선택</Text>
          </Pressable>
        </> : <Text style={styles.empty}>참조 동작을 준비하고 있습니다.</Text>}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", maxWidth: 560, paddingTop: 12, paddingBottom: 28, width: "100%" },
  caption: { gap: 4, paddingHorizontal: 20, paddingTop: 16 },
  motionTitle: { ...typography.headline, color: tokens.foreground },
  attribution: { ...typography.caption, color: tokens.mutedForeground },
  infoButton: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 48, paddingHorizontal: 20, marginTop: 8 },
  infoLabel: { ...typography.callout, color: tokens.mutedForeground },
  info: { gap: 12, paddingHorizontal: 20, paddingBottom: 16 },
  infoText: { ...typography.callout, color: tokens.mutedForeground },
  button: { alignItems: "center", backgroundColor: tokens.primary, borderRadius: 14, justifyContent: "center", minHeight: 48, marginHorizontal: 20, marginTop: 12, paddingHorizontal: 16, paddingVertical: 12 },
  buttonText: { ...typography.headline, color: tokens.primaryForeground },
  empty: { ...typography.body, color: tokens.mutedForeground, padding: 24 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
