import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { getRepresentativeFocusStyle } from "@/components/shooting-profile/sequence-viewer";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import {
  anchorPositions,
  confidenceBandCopy,
  jointConeSummary,
  primaryFinding,
} from "@/lib/skeleton/analysis-evidence";
import type { RepresentativePose4DV2, ShootingHandV2 } from "@/lib/shooting-profile/types";

/** Layer 1: a confidence dot, the band, and the one finding the record supports. */
export function AnalysisSummaryLine({ profile }: { profile: RepresentativePose4DV2 }) {
  const band = confidenceBandCopy(profile);
  const finding = primaryFinding(profile);
  const recapture = !profile.quality.passed;
  return (
    <View accessible accessibilityLabel={`${band.title}, ${band.quality}. ${finding.line}`} style={styles.summary}>
      <View style={styles.bandRow}>
        <View style={[styles.dot, band.band === "high" && styles.dotHigh, recapture && styles.dotRecapture]} />
        <Text style={styles.bandText}>{band.title}</Text>
        <Text style={[styles.qualityText, recapture && styles.qualityRecapture]}> · {band.quality}</Text>
      </View>
      <Text style={styles.finding}>{finding.line}</Text>
    </View>
  );
}

function Disclosure({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.disclosure}>
      <Pressable
        accessibilityLabel={`${title} ${expanded ? "접기" : "펼치기"}`}
        accessibilityRole="button"
        accessibilityState={{ expanded, disabled: false }}
        aria-expanded={expanded}
        disabled={false}
        focusable
        onBlur={() => setFocused(false)}
        onFocus={() => setFocused(true)}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.disclosureHead, getRepresentativeFocusStyle(focused, "light"), pressed && styles.pressed]}
        testID={`disclosure-${id}`}
      >
        <Text style={styles.disclosureTitle}>{title}</Text>
        <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={22} color={tokens.mutedForeground} />
      </Pressable>
      {expanded ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/** Layer 2: the numbers and conventions behind the band, collapsed by default. */
export function AnalysisDetails({ profile, confidence, shootingHand }: { profile: RepresentativePose4DV2; confidence?: number; shootingHand: ShootingHandV2 }) {
  const confidencePercent = confidence !== undefined && Number.isFinite(confidence)
    ? `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`
    : "—";
  return (
    <Disclosure id="details" title="자세히">
      <Row label="추정 신뢰도" value={confidencePercent} />
      <Row label="모드" value={profile.mode === "basic_1_plus_1" ? "Basic 1+1 · 반복성 측정 아님" : "High accuracy 3+3 · 3회 반복 일치"} />
      <Row label="위상" value={anchorPositions(profile).map((anchor) => `${anchor.label} ${anchor.percent}%`).join(" · ")} />
      <Row label="표시" value={shootingHand === "left" ? "왼손 슈터 · x축 미러" : "오른손 슈터 · 원본 x축"} />
      <Row label="샘플" value={`저장 위상 ${profile.frames.length}개 · 관측 관절 12 · 파생 4`} />
    </Disclosure>
  );
}

/** Layer 3: per-joint uncertainty cones and the boundary of what this record is. */
export function AnalysisEvidence({ profile }: { profile: RepresentativePose4DV2 }) {
  const cones = jointConeSummary(profile);
  const maxCone = Math.max(1, ...cones.map((cone) => cone.maxConeDegrees));
  return (
    <Disclosure id="evidence" title="위상 · 각도 · 증거">
      {cones.map((cone) => (
        <View key={cone.joint} accessible accessibilityLabel={`${cone.label} 최대 콘 ${Math.round(cone.maxConeDegrees)}도, 평균 ${Math.round(cone.meanConeDegrees)}도`} style={styles.coneRow}>
          <Text style={styles.coneLabel}>{cone.label}</Text>
          <View style={styles.coneTrack}>
            <View style={[styles.coneFill, { width: `${Math.max(2, Math.round((cone.maxConeDegrees / maxCone) * 100))}%` }]} />
          </View>
          <Text style={styles.coneValue}>{Math.round(cone.maxConeDegrees)}°</Text>
        </View>
      ))}
      <Text style={styles.boundary}>위상 결합 4D 추정 · 실측 3D 아님 · 불확실성 모델 heuristic_v1 · 콘은 관절 방향 추정의 각도 범위입니다</Text>
    </Disclosure>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 4, paddingHorizontal: 14, paddingTop: 10 },
  bandRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  dot: { backgroundColor: tokens.mutedForeground, borderRadius: 5, height: 10, width: 10 },
  dotHigh: { backgroundColor: tokens.analysisHighConfidence },
  dotRecapture: { backgroundColor: tokens.warning },
  bandText: { ...typography.callout, color: tokens.foreground, fontWeight: "700" },
  qualityText: { ...typography.callout, color: tokens.positive },
  qualityRecapture: { color: tokens.warning },
  finding: { ...typography.finding, color: tokens.foreground },
  disclosure: { borderTopColor: tokens.border, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12 },
  disclosureHead: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 48, minWidth: 44, paddingHorizontal: 14 },
  disclosureTitle: { ...typography.headline, color: tokens.foreground },
  disclosureBody: { gap: 8, paddingBottom: 12, paddingHorizontal: 14 },
  row: { flexDirection: "row", gap: 12 },
  rowLabel: { ...typography.callout, color: tokens.mutedForeground, width: 72 },
  rowValue: { ...typography.callout, color: tokens.foreground, flex: 1, fontVariant: ["tabular-nums"] },
  coneRow: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 24 },
  coneLabel: { ...typography.caption, color: tokens.mutedForeground, width: 88 },
  coneTrack: { backgroundColor: tokens.elevatedSurface, borderRadius: 3, flex: 1, height: 6, overflow: "hidden" },
  coneFill: { backgroundColor: tokens.analysisLowConfidence, borderRadius: 3, height: 6 },
  coneValue: { ...typography.caption, color: tokens.foreground, fontVariant: ["tabular-nums"], textAlign: "right", width: 36 },
  boundary: { ...typography.label, color: tokens.mutedForeground, paddingTop: 6 },
  pressed: { opacity: 0.6 },
});
