import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  describeRealVideoEvaluationState,
  type RealVideoEvaluationState,
} from "@/lib/shooting-profile/real-video-evaluation";

type RealVideoEvaluationPanelProps = {
  canBuild: boolean;
  evaluation: RealVideoEvaluationState;
  onBuild: () => void;
  onShare: () => void;
};

/**
 * Internal, development-build-only panel. It is only rendered when the capture
 * hook reports the private evaluation flag as enabled, and it exposes exactly
 * two user-initiated actions: build the derived report, then hand it to the
 * system share sheet. Nothing here runs automatically.
 */
export function RealVideoEvaluationPanel({ canBuild, evaluation, onBuild, onShare }: RealVideoEvaluationPanelProps) {
  const canShare = "json" in evaluation;
  return (
    <View style={styles.panel}>
      <Text style={styles.kicker}>INTERNAL · DEV BUILD ONLY</Text>
      <Text style={styles.title}>파생 평가 리포트</Text>
      <Text style={styles.copy}>
        원본 영상과 랜드마크는 기기 밖으로 나가지 않습니다. 공유 시트에는 스키마를 통과한 파생 지표 JSON만 전달됩니다.
      </Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {describeRealVideoEvaluationState(evaluation)}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="파생 평가 리포트 생성"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canBuild }}
          disabled={!canBuild}
          focusable
          onPress={onBuild}
          style={({ pressed }) => [styles.primaryButton, !canBuild && styles.disabled, pressed && canBuild && styles.pressed]}
        >
          <Text style={styles.primaryText}>파생 리포트 생성</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="파생 평가 리포트 공유 또는 저장"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canShare }}
          disabled={!canShare}
          focusable
          onPress={onShare}
          style={({ pressed }) => [styles.secondaryButton, !canShare && styles.disabled, pressed && canShare && styles.pressed]}
        >
          <Text style={styles.secondaryText}>리포트 공유 · 저장</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: "#FFFEFA", borderColor: "#102235", borderRadius: 17, borderStyle: "dashed", borderWidth: 1, marginTop: 22, padding: 14 },
  kicker: { color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 10, letterSpacing: 1.2 },
  title: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 20, marginTop: 2 },
  copy: { color: "#61738A", fontFamily: "Barlow", fontSize: 13, lineHeight: 19, marginTop: 6 },
  status: { color: "#102235", fontFamily: "Barlow-SemiBold", fontSize: 13, lineHeight: 19, marginTop: 10 },
  actions: { flexDirection: "row", gap: 9, marginTop: 12 },
  primaryButton: { alignItems: "center", backgroundColor: "#102235", borderRadius: 12, flex: 1, justifyContent: "center", minHeight: 44, minWidth: 44, paddingHorizontal: 10 },
  primaryText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 14 },
  secondaryButton: { alignItems: "center", borderColor: "#B8C2CA", borderRadius: 12, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 44, minWidth: 44, paddingHorizontal: 10 },
  secondaryText: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 14 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
});
