import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type {
  CaptureProtocolV2,
  RepresentativePose4DV2,
} from "@/lib/shooting-profile/types";

type QualitySummaryProps = {
  mode: CaptureProtocolV2;
  profile: RepresentativePose4DV2;
  confidence: number;
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
};

export function QualitySummary({
  mode,
  profile,
  confidence,
  canSave,
  saving,
  onSave,
}: QualitySummaryProps) {
  const saveDisabled = !canSave || saving;
  const qualityLabel = profile.quality.passed ? "결합 품질 통과" : "재촬영 필요";
  const evidence = mode === "basic_1_plus_1"
    ? "대표 스냅샷 추정 · 반복성 측정 아님"
    : "3회 반복 일치도를 확인하는 고정밀 모드";

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.iconWrap}>
          <MaterialIcons name="view-in-ar" size={24} color="#F97316" />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>대표 슛폼 검토</Text>
          <Text style={styles.boundary}>위상 결합 4D 추정 · 실측 3D 아님</Text>
        </View>
      </View>

      <View style={styles.metricRow}>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{Math.round(confidence * 100)}%</Text>
          <Text style={styles.metricLabel}>추정 신뢰도</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>101</Text>
          <Text style={styles.metricLabel}>정규화 위상</Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <MaterialIcons
          name={profile.quality.passed ? "check-circle" : "error-outline"}
          size={19}
          color={profile.quality.passed ? "#166534" : "#C24122"}
        />
        <Text accessibilityLiveRegion="polite" style={styles.statusText}>{qualityLabel}</Text>
      </View>
      <Text style={styles.evidence}>{evidence}</Text>
      <Text style={styles.detail}>
        정면과 슈팅 측면은 서로 다른 슛을 정규화된 위상으로 결합했습니다. 한 순간을 동시 측정한 결과가 아닙니다.
      </Text>

      <View style={styles.saveBoundary}>
        <MaterialIcons name="lock-outline" size={18} color="#102235" />
        <Text style={styles.saveBoundaryText}>
          {canSave
            ? "아직 저장되지 않았습니다. 확인 후 비공개 저장을 선택하세요."
            : "아직 저장되지 않았습니다. 비공개 저장 연결은 다음 구현 단계에서 제공됩니다."}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={canSave ? "대표 슛폼을 비공개 프로필로 저장" : "비공개 저장 기능 준비 중"}
        accessibilityRole="button"
        accessibilityState={{ disabled: saveDisabled }}
        disabled={saveDisabled}
        onPress={onSave}
        style={({ pressed }) => [
          styles.saveButton,
          saveDisabled && styles.disabled,
          pressed && !saveDisabled && styles.pressed,
        ]}
      >
        <MaterialIcons name="lock" size={18} color="#FFFFFF" />
        <Text style={styles.saveText}>{saving ? "저장 중" : canSave ? "비공개 저장" : "비공개 저장 준비 중"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFFEFA", borderColor: "#D9E0E4", borderRadius: 20, borderWidth: 1, padding: 17 },
  heading: { alignItems: "center", flexDirection: "row", gap: 11 },
  iconWrap: { alignItems: "center", backgroundColor: "#FFF0E8", borderRadius: 13, height: 46, justifyContent: "center", width: 46 },
  headingCopy: { flex: 1 },
  title: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 24 },
  boundary: { color: "#C24122", fontFamily: "Barlow-SemiBold", fontSize: 12, lineHeight: 17, marginTop: 2 },
  metricRow: { backgroundColor: "#102235", borderRadius: 14, flexDirection: "row", marginTop: 16, paddingVertical: 13 },
  metric: { alignItems: "center", flex: 1 },
  metricValue: { color: "#F5F1E8", fontFamily: "BarlowCondensed-Bold", fontSize: 22 },
  metricLabel: { color: "#B6C2CD", fontFamily: "Barlow", fontSize: 11, marginTop: 1 },
  statusRow: { alignItems: "center", flexDirection: "row", gap: 7, marginTop: 15 },
  statusText: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 16 },
  evidence: { color: "#C24122", fontFamily: "Barlow-SemiBold", fontSize: 13, lineHeight: 19, marginTop: 10 },
  detail: { color: "#61738A", fontFamily: "Barlow", fontSize: 13, lineHeight: 19, marginTop: 4 },
  saveBoundary: { alignItems: "flex-start", backgroundColor: "#EEF4F8", borderRadius: 12, flexDirection: "row", gap: 7, marginTop: 14, padding: 11 },
  saveBoundaryText: { color: "#102235", flex: 1, fontFamily: "Barlow", fontSize: 12, lineHeight: 18 },
  saveButton: { alignItems: "center", backgroundColor: "#C24122", borderRadius: 13, flexDirection: "row", gap: 7, justifyContent: "center", marginTop: 12, minHeight: 44, paddingHorizontal: 14 },
  saveText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 16 },
  disabled: { opacity: 0.44 },
  pressed: { opacity: 0.74 },
});
