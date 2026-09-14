import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { LoopStage } from "@/components/skeleton/loop-stage";
import { representativeConfidence } from "@/components/skeleton/representative-glyph";
import { SkeletonLoop } from "@/components/skeleton/skeleton-loop";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { confidenceBandCopy } from "@/lib/skeleton/analysis-evidence";
import type { CaptureProtocolV2, RepresentativePose4DV2, ShootingHandV2 } from "@/lib/shooting-profile/types";

type QualitySummaryProps = {
  mode: CaptureProtocolV2;
  profile: RepresentativePose4DV2;
  /** Passed by the session for parity with the stored record; the analysis route's detail layer shows it after saving. */
  confidence: number;
  shootingHand: ShootingHandV2;
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
  width: number;
};

/**
 * Review: the result skeleton first, one band line, then the truthful consent
 * copy and the save action. The percentage stays out of this step; the
 * analysis route's detail layer shows it after saving.
 */
export function QualitySummary({ mode, profile, confidence, shootingHand, canSave, saving, onSave, width }: QualitySummaryProps) {
  void confidence;
  const [focused, setFocused] = useState(false);
  const saveDisabled = !canSave || saving;
  const band = confidenceBandCopy(profile);
  const height = Math.round(width * 0.9);
  const evidence = mode === "basic_1_plus_1" ? "대표 스냅샷 추정 · 반복성 측정 아님" : "3회 반복 일치도를 확인하는 고정밀 모드";

  return (
    <View style={styles.review}>
      <LoopStage accessibilityLabel="대표 슛폼 결과 skeleton" height={height} width={width}>
        {(paused) => (
          <SkeletonLoop
            accessibilityLabel="대표 슛폼 결과 skeleton, 사선 시점 재생"
            confidence={representativeConfidence(profile)}
            height={height}
            paused={paused}
            profile={profile}
            shootingHand={shootingHand}
            view="oblique"
            width={width}
          />
        )}
      </LoopStage>
      <View accessible accessibilityLabel={`${band.title}, ${band.quality}. ${evidence}. 위상 결합 4D 추정 · 실측 3D 아님`} style={styles.bandRow}>
        <View style={[styles.dot, band.band === "high" && styles.dotHigh, !profile.quality.passed && styles.dotRecapture]} />
        <Text numberOfLines={1} style={styles.bandText}>{band.title} · <Text style={profile.quality.passed ? styles.pass : styles.recapture}>{band.quality}</Text></Text>
      </View>
      <Text numberOfLines={1} style={styles.evidence}>{evidence} · 위상 결합 4D 추정 · 실측 3D 아님</Text>
      <View style={styles.consent}>
        <MaterialCommunityIcons name="lock-outline" size={18} color={tokens.mutedForeground} />
        <Text style={styles.consentText}>
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
        style={({ pressed }) => [styles.save, focusStyle(focused), saveDisabled && styles.disabled, pressed && !saveDisabled && styles.pressed]}
      >
        <MaterialCommunityIcons name="lock" size={18} color={tokens.primaryForeground} />
        <Text accessibilityLiveRegion="polite" style={styles.saveText}>{saving ? "저장 중" : canSave ? "비공개 저장" : "비공개 저장 준비 중"}</Text>
      </Pressable>
    </View>
  );
}

function focusStyle(focused: boolean): ViewStyle {
  if (!focused) return {};
  return {
    elevation: 8,
    outlineColor: tokens.focusRing,
    outlineOffset: 2,
    outlineStyle: "solid",
    outlineWidth: 3,
    shadowColor: tokens.background,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  };
}

const styles = StyleSheet.create({
  review: { gap: 8 },
  bandRow: { alignItems: "center", flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingTop: 8 },
  dot: { backgroundColor: tokens.mutedForeground, borderRadius: 5, height: 10, width: 10 },
  dotHigh: { backgroundColor: tokens.analysisHighConfidence },
  dotRecapture: { backgroundColor: tokens.warning },
  bandText: { ...typography.callout, color: tokens.foreground, fontWeight: "700" },
  pass: { color: tokens.positive, fontWeight: "400" },
  recapture: { color: tokens.warning, fontWeight: "400" },
  evidence: { ...typography.caption, color: tokens.mutedForeground, paddingHorizontal: 14 },
  consent: { alignItems: "flex-start", flexDirection: "row", gap: 8, marginHorizontal: 14, marginTop: 6 },
  consentText: { ...typography.caption, color: tokens.mutedForeground, flex: 1 },
  save: { alignItems: "center", backgroundColor: tokens.primary, borderRadius: 12, flexDirection: "row", gap: 8, justifyContent: "center", marginHorizontal: 14, marginTop: 8, minHeight: 48, minWidth: 44, paddingHorizontal: 16 },
  saveText: { ...typography.headline, color: tokens.primaryForeground },
  disabled: { opacity: 0.44 },
  pressed: { opacity: 0.74 },
});
