import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { getRepresentativeFocusStyle } from "@/components/shooting-profile/sequence-viewer";
import { representativeConfidence, representativeGlyph, representativeReleaseFrameIndex } from "@/components/skeleton/representative-glyph";
import { SkeletonGlyph } from "@/components/skeleton/skeleton-glyph";
import { tokens } from "@/constants/tokens";
import { isOpaqueShootingProfileIdV2 } from "@/lib/firebase-shooting-profile-contract";
import type { ShootingProfileSummaryV2, ShootingProfileViewerRecordV2 } from "@/lib/firebase-shooting-profiles";

type MotionGridProps = {
  records: readonly ShootingProfileSummaryV2[];
  /** Full records already fetched for the owner, keyed by profile id. */
  glyphs: Readonly<Record<string, ShootingProfileViewerRecordV2>>;
  loading: boolean;
  error: string | null;
  deletingProfileId: string | null;
  canOpen: boolean;
  width: number;
  onOpen: (profileId: string) => void;
  onDelete: (profileId: string) => void;
};

const GAP = 2;
const COLUMNS = 3;

/** Keyboard focus keeps the viewer's double ring (outlineStyle solid + halo), layout-stable. */
const focusRing = (focused: boolean): ViewStyle => getRepresentativeFocusStyle(focused, "light");

function modeLabel(record: ShootingProfileSummaryV2): string {
  return record.mode === "basic_1_plus_1" ? "대표 스냅샷 추정 · 반복성 측정 아님" : "3회 반복 대표 슛폼";
}

function createdDate(record: ShootingProfileSummaryV2): string {
  return record.createdAt.toDate().toLocaleDateString("ko-KR");
}

/**
 * The owner's representative profiles as a 3-column skeleton grid. Each tile is
 * the release-proxy still; tap opens the analysis, long-press deletes (also
 * exposed as an accessibility action). Honesty lives in the accessibility
 * label, not in on-screen paragraphs: mode, date, band, and the boundary.
 */
export function MotionGrid({ records, glyphs, loading, error, deletingProfileId, canOpen, width, onOpen, onDelete }: MotionGridProps) {
  const [focusedControl, setFocusedControl] = useState<string | null>(null);
  const tile = Math.max(1, Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS));

  if (loading) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={tokens.mutedForeground} />
        <Text accessibilityLiveRegion="polite" style={styles.stateText}>대표 슛폼을 불러오는 중</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.state}>
        <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{error}</Text>
      </View>
    );
  }
  if (records.length === 0) {
    return (
      <View style={styles.state}>
        <Text accessibilityLiveRegion="polite" style={styles.stateText}>첫 슛폼을 촬영하면 여기에 쌓입니다</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.grid, { width }]}>
        {records.map((record) => {
          const deleting = deletingProfileId === record.id;
          const validId = isOpaqueShootingProfileIdV2(record.id);
          const disabled = !canOpen || deleting || !validId;
          const full = glyphs[record.id];
          const confidence = full ? representativeConfidence(full.profile) : record.mode === "high_accuracy_3_plus_3" ? "high" : "basic";
          const band = confidence === "recapture" ? "재촬영 필요" : confidence === "high" ? "High" : "Basic";
          const label = validId
            ? `${modeLabel(record)} · ${createdDate(record)} · ${band} · 위상 결합 4D 추정 · 실측 3D 아님${canOpen ? " · 열기" : " · 대표 뷰어 꺼짐"}`
            : `${modeLabel(record)} · 기록 식별자가 유효하지 않아 열거나 삭제할 수 없습니다`;
          const focusKey = `tile-${record.id}`;
          return (
            <Pressable
              key={record.id}
              accessibilityActions={validId ? [{ name: "longpress", label: "삭제" }] : []}
              accessibilityLabel={label}
              accessibilityRole="button"
              accessibilityState={{ disabled, busy: deleting }}
              aria-busy={deleting}
              aria-disabled={disabled}
              disabled={disabled}
              focusable
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === "longpress" && validId && !deleting) onDelete(record.id);
              }}
              onBlur={() => setFocusedControl((current) => current === focusKey ? null : current)}
              onFocus={() => setFocusedControl(focusKey)}
              onLongPress={() => { if (validId && !deleting) onDelete(record.id); }}
              onPress={() => onOpen(record.id)}
              style={({ pressed }) => [
                styles.tile,
                { width: tile, height: tile },
                focusRing(focusedControl === focusKey),
                deleting && styles.deleting,
                pressed && !disabled && styles.pressed,
              ]}
            >
              {full ? (
                <SkeletonGlyph
                  accessible={false}
                  accessibilityLabel={label}
                  confidence={confidence}
                  data={representativeGlyph(full.profile.frames[representativeReleaseFrameIndex(full.profile)], "oblique", full.shootingHand)}
                  height={tile}
                  padding={Math.round(tile * 0.12)}
                  width={tile}
                />
              ) : (
                <View style={[styles.pending, { width: tile, height: tile }]}>
                  <ActivityIndicator color={tokens.mutedForeground} size="small" />
                </View>
              )}
              {confidence !== "basic" ? (
                <View pointerEvents="none" style={[styles.dot, confidence === "high" ? styles.dotHigh : styles.dotRecapture]} />
              ) : null}
              {deleting ? <Text accessibilityLiveRegion="polite" style={styles.deletingText}>삭제 중</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>길게 눌러 삭제</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  tile: { backgroundColor: tokens.stage, minHeight: 72, minWidth: 52, overflow: "hidden", position: "relative" },
  pending: { alignItems: "center", justifyContent: "center" },
  dot: { borderRadius: 4, height: 8, position: "absolute", right: 6, top: 6, width: 8 },
  dotHigh: { backgroundColor: tokens.analysisHighConfidence },
  dotRecapture: { backgroundColor: tokens.warning },
  deleting: { opacity: 0.45 },
  deletingText: { bottom: 6, color: tokens.stageForeground, fontSize: 10, left: 6, position: "absolute" },
  hint: { color: tokens.mutedForeground, fontSize: 11, paddingHorizontal: 14, paddingTop: 8 },
  state: { alignItems: "center", justifyContent: "center", minHeight: 96, paddingHorizontal: 14, paddingVertical: 18 },
  stateText: { color: tokens.mutedForeground, fontSize: 13, marginTop: 6, textAlign: "center" },
  errorText: { color: tokens.destructive, fontSize: 13, lineHeight: 19, textAlign: "center" },
  pressed: { opacity: 0.72 },
});
