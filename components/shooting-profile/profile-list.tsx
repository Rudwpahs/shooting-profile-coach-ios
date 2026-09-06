import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import type { ShootingProfileSummaryV2 } from "@/lib/firebase-shooting-profiles";
import { isOpaqueShootingProfileIdV2 } from "@/lib/firebase-shooting-profile-contract";
import { tokens } from "@/constants/tokens";

type ShootingProfileListProps = {
  records: readonly ShootingProfileSummaryV2[];
  loading: boolean;
  error: string | null;
  deletingProfileId: string | null;
  canOpen: boolean;
  onOpen: (profileId: string) => void;
  onDelete: (profileId: string) => void;
};

function focusStyle(focused: boolean, dark = false): ViewStyle {
  if (!focused) return {};
  return {
    elevation: 8,
    outlineColor: tokens.focusRing,
    outlineOffset: 2,
    outlineStyle: "solid",
    outlineWidth: 3,
    shadowColor: dark ? tokens.background : tokens.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  };
}

function createdDate(record: ShootingProfileSummaryV2): string {
  return record.createdAt.toDate().toLocaleDateString("ko-KR");
}

export function ShootingProfileList({
  records,
  loading,
  error,
  deletingProfileId,
  canOpen,
  onOpen,
  onDelete,
}: ShootingProfileListProps) {
  const [focusedControl, setFocusedControl] = useState<string | null>(null);

  if (loading) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={tokens.primary} />
        <Text accessibilityLiveRegion="polite" style={styles.stateTitle}>대표 슛폼을 불러오는 중</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.state}>
        <MaterialIcons name="error-outline" size={28} color={tokens.destructive} />
        <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (records.length === 0) {
    return (
      <View style={styles.state}>
        <MaterialIcons name="view-in-ar" size={28} color={tokens.primary} />
        <Text accessibilityLiveRegion="polite" style={styles.stateTitle}>저장된 대표 슛폼이 없습니다</Text>
        <Text style={styles.stateCopy}>가이드 촬영을 완료하면 비공개 V2 기록이 이곳에 표시됩니다.</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {records.map((record) => {
        const deleting = deletingProfileId === record.id;
        const validId = isOpaqueShootingProfileIdV2(record.id);
        const deleteDisabled = deletingProfileId !== null || !validId;
        const openDisabled = !canOpen || deleting || !validId;
        const modeLabel = record.mode === "basic_1_plus_1"
          ? "대표 스냅샷 추정 · 반복성 측정 아님"
          : "3회 반복 대표 슛폼";
        return (
          <View key={record.id} style={styles.row}>
            <Pressable
              accessibilityLabel={validId ? `${modeLabel} 분석 열기` : `${modeLabel} 기록 식별자 오류`}
              accessibilityRole="button"
              accessibilityState={{ disabled: openDisabled }}
              disabled={openDisabled}
              focusable
              onBlur={() => setFocusedControl((current) => current === `open-${record.id}` ? null : current)}
              onFocus={() => setFocusedControl(`open-${record.id}`)}
              onPress={() => onOpen(record.id)}
              style={({ pressed }) => [
                styles.openButton,
                focusStyle(focusedControl === `open-${record.id}`),
                openDisabled && styles.disabled,
                pressed && !openDisabled && styles.pressed,
              ]}
            >
              <View style={styles.icon}>
                <MaterialIcons name="view-in-ar" size={21} color={tokens.primary} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.mode}>{modeLabel}</Text>
                <Text style={styles.meta}>신뢰도 {Math.round(record.confidence * 100)}% · {createdDate(record)}</Text>
                <Text style={styles.boundary}>위상 결합 4D 추정 · 실측 3D 아님</Text>
                {!validId ? <Text accessibilityLiveRegion="assertive" style={styles.invalid}>기록 식별자가 유효하지 않아 열거나 삭제할 수 없습니다.</Text> : null}
                {!canOpen ? <Text style={styles.unavailable}>대표 뷰어가 꺼져 있어 지금은 열 수 없습니다.</Text> : null}
              </View>
              <MaterialIcons name="chevron-right" size={22} color={tokens.foreground} />
            </Pressable>
            <Pressable
              accessibilityLabel={validId ? `${modeLabel} 삭제` : `${modeLabel} 삭제 불가`}
              accessibilityRole="button"
              accessibilityState={{ disabled: deleteDisabled, busy: deleting }}
              disabled={deleteDisabled}
              focusable
              onBlur={() => setFocusedControl((current) => current === `delete-${record.id}` ? null : current)}
              onFocus={() => setFocusedControl(`delete-${record.id}`)}
              onPress={() => onDelete(record.id)}
              style={({ pressed }) => [
                styles.deleteButton,
                focusStyle(focusedControl === `delete-${record.id}`),
                deleteDisabled && styles.disabled,
                pressed && !deleteDisabled && styles.pressed,
              ]}
            >
              <MaterialIcons name={deleting ? "hourglass-top" : "delete-outline"} size={20} color={tokens.primary} />
              <Text accessibilityLiveRegion="polite" style={styles.deleteText}>{deleting ? "삭제 중" : "삭제"}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: { alignItems: "center", borderBottomColor: tokens.border, borderBottomWidth: 1, flexDirection: "row", gap: 8, paddingVertical: 8 },
  openButton: { alignItems: "center", borderRadius: 12, flex: 1, flexDirection: "row", gap: 10, minHeight: 72, minWidth: 44, paddingHorizontal: 6, paddingVertical: 6 },
  icon: { alignItems: "center", backgroundColor: tokens.primarySoft, borderRadius: 12, height: 42, justifyContent: "center", width: 42 },
  copy: { flex: 1 },
  mode: { color: tokens.foreground, fontFamily: "BarlowCondensed-Bold", fontSize: 17 },
  meta: { color: tokens.mutedForeground, fontFamily: "Barlow", fontSize: 11, marginTop: 2 },
  boundary: { color: tokens.warning, fontFamily: "Barlow-SemiBold", fontSize: 11, lineHeight: 16, marginTop: 2 },
  unavailable: { color: tokens.mutedForeground, fontFamily: "Barlow", fontSize: 10, lineHeight: 14, marginTop: 2 },
  invalid: { color: tokens.destructive, fontFamily: "Barlow-SemiBold", fontSize: 10, lineHeight: 14, marginTop: 2 },
  deleteButton: { alignItems: "center", backgroundColor: tokens.primarySoft, borderRadius: 11, justifyContent: "center", minHeight: 52, minWidth: 52, paddingHorizontal: 5 },
  deleteText: { color: tokens.destructive, fontFamily: "BarlowCondensed-Bold", fontSize: 11, marginTop: 1 },
  state: { alignItems: "center", justifyContent: "center", minHeight: 116, paddingHorizontal: 12, paddingVertical: 18 },
  stateTitle: { color: tokens.foreground, fontFamily: "BarlowCondensed-Bold", fontSize: 18, marginTop: 7, textAlign: "center" },
  stateCopy: { color: tokens.mutedForeground, fontFamily: "Barlow", fontSize: 12, lineHeight: 18, marginTop: 3, textAlign: "center" },
  errorText: { color: tokens.destructive, fontFamily: "Barlow-SemiBold", fontSize: 13, lineHeight: 19, marginTop: 7, textAlign: "center" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
