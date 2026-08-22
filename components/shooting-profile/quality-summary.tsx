import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

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
  const [focused, setFocused] = useState(false);
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
          {saving
            ? "12개 허용 관절의 위상 정규화 2D 관찰값과 대표 추정치만 비공개로 저장하는 중입니다. 원본 영상, 파일명, 원본 MediaPipe 깊이값은 업로드하지 않습니다. 아직 저장 완료로 표시하지 않습니다."
            : canSave
            ? "아직 저장되지 않았습니다. 저장하면 12개 허용 관절의 위상 정규화 2D 관찰값과 대표 추정치만 업로드합니다. 원본 영상, 파일명, 원본 MediaPipe 깊이값은 업로드하지 않습니다. 이 파생 데이터는 사용자가 삭제할 때까지 비공개로 보관됩니다."
            : "아직 저장되지 않았습니다. 이 결과의 비공개 저장 준비 데이터가 현재 세션에 없습니다. 필요한 클립을 다시 촬영해 주세요."}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={saving ? "대표 슛폼 비공개 저장 중" : canSave ? "대표 슛폼을 비공개 프로필로 저장" : "비공개 저장 기능 준비 중"}
        accessibilityRole="button"
        accessibilityState={{ disabled: saveDisabled, busy: saving }}
        disabled={saveDisabled}
        focusable
        onBlur={() => setFocused(false)}
        onFocus={() => setFocused(true)}
        onPress={onSave}
        style={({ pressed }) => [
          styles.saveButton,
          focusStyle(focused),
          saveDisabled && styles.disabled,
          pressed && !saveDisabled && styles.pressed,
        ]}
      >
        <MaterialIcons name="lock" size={18} color="#FFFFFF" />
        <Text accessibilityLiveRegion="polite" style={styles.saveText}>{saving ? "저장 중" : canSave ? "비공개 저장" : "비공개 저장 준비 중"}</Text>
      </Pressable>
    </View>
  );
}

function focusStyle(focused: boolean): ViewStyle {
  if (!focused) return {};
  return {
    elevation: 8,
    outlineColor: "#FFFFFF",
    outlineOffset: 2,
    outlineStyle: "solid",
    outlineWidth: 3,
    shadowColor: "#102235",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  };
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
  saveButton: { alignItems: "center", backgroundColor: "#C24122", borderRadius: 13, flexDirection: "row", gap: 7, justifyContent: "center", marginTop: 12, minHeight: 44, minWidth: 44, paddingHorizontal: 14 },
  saveText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 16 },
  disabled: { opacity: 0.44 },
  pressed: { opacity: 0.74 },
});
