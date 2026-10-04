import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { getRepresentativeFocusStyle } from "@/components/shooting-profile/sequence-viewer";
import { representativeConfidence, representativeGlyph, representativeReleaseFrameIndex } from "@/components/skeleton/representative-glyph";
import { SkeletonGlyph } from "@/components/skeleton/skeleton-glyph";
import { LiquidPressable } from "@/components/ui/liquid";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { mergeFilmShotTiles } from "@/lib/film-space/film-shot-cloud-actions";
import type { FilmShotV1 } from "@/lib/film-space/film-shots";
import type { CloudFilmShotHeadSummaryV1 } from "@/lib/firebase-film-shots";
import { isOpaqueShootingProfileIdV2 } from "@/lib/firebase-shooting-profile-contract";
import type { ShootingProfileSummaryV2, ShootingProfileViewerRecordV2 } from "@/lib/firebase-shooting-profiles";

type MotionGridProps = {
  records: readonly ShootingProfileSummaryV2[];
  /** Full records already fetched for the owner, keyed by profile id. */
  glyphs: Readonly<Record<string, ShootingProfileViewerRecordV2>>;
  /** The owner's own footage kept on this device without pose analysis; shown as film tiles after the profiles. */
  filmShots?: readonly FilmShotV1[];
  /** The owner's kept cloud shots, or null when nothing is known about the cloud (the default in ordinary builds). */
  cloudFilmShots?: readonly CloudFilmShotHeadSummaryV1[] | null;
  loading: boolean;
  error: string | null;
  deletingProfileId: string | null;
  deletingFilmShotId?: string | null;
  canOpen: boolean;
  width: number;
  onOpen: (profileId: string) => void;
  onDelete: (profileId: string) => void;
  onOpenFilm?: (shotId: string) => void;
  /** Long press on a film tile, and the only press on a tile whose footage is not on this device. */
  onFilmActions?: (shotId: string) => void;
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
 * The owner's representative profiles as a 3-column skeleton grid, followed by
 * the owner's film shots. Each profile tile is the release-proxy still; a film
 * tile is the footage icon and the shot's name. Tap opens the analysis (or the
 * film reel), long-press deletes (also exposed as an accessibility action).
 * Honesty lives in the accessibility label, not in on-screen paragraphs: mode,
 * date, band, and the boundary; for footage, that no pose was analysed.
 */
export function MotionGrid({
  records, glyphs, filmShots = [], cloudFilmShots = null, loading, error, deletingProfileId, deletingFilmShotId = null, canOpen, width,
  onOpen, onDelete, onOpenFilm, onFilmActions,
}: MotionGridProps) {
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
  const filmTiles = mergeFilmShotTiles(filmShots, cloudFilmShots);
  if (records.length === 0 && filmTiles.length === 0) {
    return (
      <View style={styles.state}>
        <Text accessibilityLiveRegion="polite" style={styles.stateText}>첫 슛폼을 촬영하면 여기에 쌓입니다</Text>
      </View>
    );
  }

  // One delete at a time across both kinds, as the route enforces: a long press elsewhere
  // while one is in flight would only open a confirm that goes nowhere.
  const deleteIdle = deletingProfileId === null && deletingFilmShotId === null;

  return (
    <View>
      <View style={[styles.grid, { width }]}>
        {records.map((record) => {
          const deleting = deletingProfileId === record.id;
          const validId = isOpaqueShootingProfileIdV2(record.id);
          const disabled = !canOpen || deleting || !validId;
          const canDelete = validId && deleteIdle;
          const full = glyphs[record.id];
          const confidence = full ? representativeConfidence(full.profile) : record.mode === "high_accuracy_3_plus_3" ? "high" : "basic";
          const band = confidence === "recapture" ? "재촬영 필요" : confidence === "high" ? "High" : "Basic";
          const label = validId
            ? `${modeLabel(record)} · ${createdDate(record)} · ${band} · 위상 결합 4D 추정 · 실측 3D 아님${canOpen ? " · 열기" : " · 대표 뷰어 꺼짐"}`
            : `${modeLabel(record)} · 기록 식별자가 유효하지 않아 열거나 삭제할 수 없습니다`;
          const focusKey = `tile-${record.id}`;
          return (
            <LiquidPressable
              key={record.id}
              accessibilityActions={validId ? [{ name: "longpress", label: "삭제" }] : []}
              accessibilityLabel={label}
              accessibilityRole="button"
              accessibilityState={{ disabled, busy: deleting }}
              aria-busy={deleting}
              aria-disabled={disabled}
              disabled={disabled}
              focusable
              magnetic
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === "longpress" && canDelete) onDelete(record.id);
              }}
              onBlur={() => setFocusedControl((current) => current === focusKey ? null : current)}
              onFocus={() => setFocusedControl(focusKey)}
              onLongPress={() => { if (canDelete) onDelete(record.id); }}
              onPress={() => onOpen(record.id)}
              rippleColor={tokens.foreground}
              style={[styles.tileHit, { width: tile, height: tile }, focusRing(focusedControl === focusKey)]}
              surfaceStyle={[styles.tile, { width: tile, height: tile }, deleting && styles.deleting]}
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
                <View style={[styles.dot, confidence === "high" ? styles.dotHigh : styles.dotRecapture]} />
              ) : null}
              {deleting ? <Text accessibilityLiveRegion="polite" style={styles.deletingText}>삭제 중</Text> : null}
            </LiquidPressable>
          );
        })}
        {filmTiles.map((shot) => {
          const deleting = deletingFilmShotId === shot.id;
          const disabled = deleting;
          const canAct = deleteIdle;
          const where = shot.onDevice ? (shot.inCloud ? "이 기기와 클라우드에 보관" : "이 기기에만 보관") : "클라우드에만 있음";
          const label = `${shot.title} · 내 영상 · ${where} · 포즈 분석 없음 · ${shot.clipCount}개 클립 · ${new Date(shot.createdAtMs).toLocaleDateString("ko-KR")} · ${shot.onDevice ? "열기" : "내려받기 옵션 열기"}`;
          const focusKey = `film-${shot.id}`;
          return (
            <LiquidPressable
              key={shot.id}
              accessibilityActions={[{ name: "longpress", label: "보관·삭제 옵션" }]}
              accessibilityLabel={label}
              accessibilityRole="button"
              accessibilityState={{ disabled, busy: deleting }}
              aria-busy={deleting}
              aria-disabled={disabled}
              disabled={disabled}
              focusable
              magnetic
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === "longpress" && canAct) onFilmActions?.(shot.id);
              }}
              onBlur={() => setFocusedControl((current) => current === focusKey ? null : current)}
              onFocus={() => setFocusedControl(focusKey)}
              onLongPress={() => { if (canAct) onFilmActions?.(shot.id); }}
              // Footage that is not on this device cannot be played; the tile offers the download instead.
              onPress={() => { if (shot.onDevice) onOpenFilm?.(shot.id); else if (canAct) onFilmActions?.(shot.id); }}
              rippleColor={tokens.foreground}
              style={[styles.tileHit, { width: tile, height: tile }, focusRing(focusedControl === focusKey)]}
              surfaceStyle={[styles.tile, styles.filmTile, { width: tile, height: tile }, deleting && styles.deleting]}
            >
              <MaterialCommunityIcons name={shot.onDevice ? "filmstrip" : "cloud-download-outline"} size={Math.round(tile * 0.3)} color={tokens.stageForeground} />
              <Text numberOfLines={1} style={styles.filmTitle}>{shot.title}</Text>
              {shot.onDevice && shot.inCloud ? (
                <View style={styles.cloudMark}>
                  <MaterialCommunityIcons name="cloud-check-outline" size={14} color={tokens.stageForeground} />
                </View>
              ) : null}
              {deleting ? <Text accessibilityLiveRegion="polite" style={styles.deletingText}>삭제 중</Text> : null}
            </LiquidPressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{filmTiles.length > 0 ? "길게 눌러 삭제 · 내 영상은 보관 옵션" : "길게 눌러 삭제"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  tileHit: { minHeight: 72, minWidth: 52 },
  tile: { backgroundColor: tokens.stage, minHeight: 72, minWidth: 52, overflow: "hidden", position: "relative" },
  filmTile: { alignItems: "center", gap: 6, justifyContent: "center", paddingHorizontal: 8 },
  filmTitle: { ...typography.label, color: tokens.stageForeground, textAlign: "center" },
  cloudMark: { pointerEvents: "none", position: "absolute", right: 6, top: 6 },
  pending: { alignItems: "center", justifyContent: "center" },
  dot: { borderRadius: 4, height: 8, pointerEvents: "none", position: "absolute", right: 6, top: 6, width: 8 },
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
