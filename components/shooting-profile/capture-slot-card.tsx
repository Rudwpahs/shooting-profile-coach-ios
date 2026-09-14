import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import type { CaptureSessionSlot } from "@/lib/shooting-profile/capture-session-reducer";

type CaptureSlotCardProps = {
  slot: CaptureSessionSlot;
  /** The view's guidance title, e.g. 정면 or 슈팅 측면. */
  title: string;
  onCamera: () => void;
  onLibrary: () => void;
  onRetake: () => void;
  disabled?: boolean;
};

function slotLabel(slot: CaptureSessionSlot, title: string): string {
  return `${title} ${slot.takeIndex + 1}회`;
}

function statusCopy(slot: CaptureSessionSlot): string {
  if (slot.status === "acquiring") return "권한 확인 및 영상 선택 중";
  if (slot.status === "analyzing") {
    const progress = slot.progress;
    return progress && progress.total > 0 ? `기기 내 포즈 분석 중 · ${progress.completed}/${progress.total}` : "기기 내 포즈 분석 준비 중";
  }
  if (slot.status === "accepted") return "통과";
  if (slot.status === "rejected") return "재촬영 필요";
  if (slot.status === "cancelled") return "선택 취소";
  return slot.enabled ? "촬영 가능" : "이전 클립 통과 후";
}

function StatusDot({ slot }: { slot: CaptureSessionSlot }) {
  const color = slot.status === "accepted"
    ? tokens.positive
    : slot.status === "rejected"
      ? tokens.warning
      : slot.status === "acquiring" || slot.status === "analyzing"
        ? tokens.primary
        : tokens.mutedForeground;
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

/**
 * One take: a status line, then the actions that apply. Rejection copy is the
 * typed reason the hook already translated; it never grows into a paragraph.
 */
export function CaptureSlotCard({ slot, title, onCamera, onLibrary, onRetake, disabled = false }: CaptureSlotCardProps) {
  const label = slotLabel(slot, title);
  const working = slot.status === "acquiring" || slot.status === "analyzing";
  const captureDisabled = disabled || !slot.enabled || working || slot.status === "accepted";
  const retakeDisabled = disabled || working;

  return (
    <View style={[styles.row, !slot.enabled && slot.status !== "accepted" && styles.waiting]}>
      <StatusDot slot={slot} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.label}>{label}</Text>
        <Text accessibilityLiveRegion="polite" numberOfLines={1} style={styles.status}>{statusCopy(slot)}</Text>
        {slot.rejectionReason ? (
          <Text accessibilityLiveRegion="assertive" numberOfLines={2} style={styles.reason}>{slot.rejectionReason}</Text>
        ) : null}
      </View>
      {slot.status === "accepted" ? (
        <Pressable
          accessibilityLabel={`${label} 클립 다시 촬영 또는 선택`}
          accessibilityRole="button"
          accessibilityState={{ disabled: retakeDisabled }}
          disabled={retakeDisabled}
          onPress={onRetake}
          style={({ pressed }) => [styles.action, styles.secondaryAction, retakeDisabled && styles.disabled, pressed && !retakeDisabled && styles.pressed]}
        >
          <MaterialCommunityIcons name="refresh" size={18} color={tokens.foreground} />
          <Text style={styles.actionText}>다시</Text>
        </Pressable>
      ) : (
        <>
          <Pressable
            accessibilityLabel={`${label} 카메라로 로컬 슈팅 클립 촬영`}
            accessibilityRole="button"
            accessibilityState={{ disabled: captureDisabled }}
            disabled={captureDisabled}
            onPress={onCamera}
            style={({ pressed }) => [styles.action, styles.primaryAction, captureDisabled && styles.disabled, pressed && !captureDisabled && styles.pressed]}
          >
            <MaterialCommunityIcons name="video" size={18} color={tokens.primaryForeground} />
            <Text style={[styles.actionText, styles.primaryActionText]}>촬영</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`${label} 기기 보관함에서 슈팅 영상 선택`}
            accessibilityRole="button"
            accessibilityState={{ disabled: captureDisabled }}
            disabled={captureDisabled}
            onPress={onLibrary}
            style={({ pressed }) => [styles.action, styles.secondaryAction, captureDisabled && styles.disabled, pressed && !captureDisabled && styles.pressed]}
          >
            <MaterialCommunityIcons name="folder-play-outline" size={18} color={tokens.foreground} />
            <Text style={styles.actionText}>보관함</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", backgroundColor: tokens.surface, borderRadius: 14, flexDirection: "row", gap: 10, minHeight: 64, paddingHorizontal: 12, paddingVertical: 8 },
  waiting: { opacity: 0.55 },
  dot: { borderRadius: 4, height: 8, width: 8 },
  copy: { flex: 1, gap: 1 },
  label: { ...typography.headline, color: tokens.foreground },
  status: { ...typography.caption, color: tokens.mutedForeground },
  reason: { ...typography.caption, color: tokens.warning },
  action: { alignItems: "center", borderRadius: 22, flexDirection: "row", gap: 5, height: 44, justifyContent: "center", minHeight: 44, minWidth: 44, paddingHorizontal: 12 },
  actionText: { ...typography.callout, color: tokens.foreground, fontWeight: "600" },
  primaryAction: { backgroundColor: tokens.primary },
  primaryActionText: { color: tokens.primaryForeground },
  secondaryAction: { backgroundColor: tokens.elevatedSurface },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.7 },
});
