import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CaptureSessionSlot } from "@/lib/shooting-profile/capture-session-reducer";

type CaptureSlotCardProps = {
  slot: CaptureSessionSlot;
  onCamera: () => void;
  onLibrary: () => void;
  onRetake: () => void;
  disabled?: boolean;
};

function slotLabel(slot: CaptureSessionSlot): string {
  const view = slot.view === "front" ? "정면" : "슈팅 측면";
  return `${view} ${slot.takeIndex + 1}회`;
}

function statusCopy(slot: CaptureSessionSlot): string {
  if (slot.status === "acquiring") return "권한 확인 및 영상 선택 중";
  if (slot.status === "analyzing") {
    const progress = slot.progress;
    return progress && progress.total > 0
      ? `기기 내 포즈 분석 중 · ${progress.completed}/${progress.total}`
      : "기기 내 포즈 분석 준비 중";
  }
  if (slot.status === "accepted") return "통과 · 다음 클립으로 진행할 수 있습니다";
  if (slot.status === "rejected") return "재촬영 필요";
  if (slot.status === "cancelled") return "선택 취소 · 다시 시작할 수 있습니다";
  return slot.enabled ? "촬영 가능" : "이전 클립 통과 후 촬영 가능";
}

function statusIcon(slot: CaptureSessionSlot) {
  if (slot.status === "accepted") return <MaterialIcons name="check-circle" size={21} color="#166534" />;
  if (slot.status === "rejected") return <MaterialIcons name="error-outline" size={21} color="#C24122" />;
  if (slot.status === "acquiring" || slot.status === "analyzing") {
    return <MaterialIcons name="hourglass-top" size={21} color="#F97316" />;
  }
  if (slot.status === "cancelled") return <MaterialIcons name="cancel" size={21} color="#61738A" />;
  return <MaterialIcons name={slot.enabled ? "radio-button-unchecked" : "lock-outline"} size={21} color="#61738A" />;
}

export function CaptureSlotCard({
  slot,
  onCamera,
  onLibrary,
  onRetake,
  disabled = false,
}: CaptureSlotCardProps) {
  const label = slotLabel(slot);
  const working = slot.status === "acquiring" || slot.status === "analyzing";
  const captureDisabled = disabled || !slot.enabled || working || slot.status === "accepted";
  const retakeDisabled = disabled || working;

  return (
    <View style={[styles.card, !slot.enabled && slot.status !== "accepted" && styles.waitingCard]}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.label}>{label}</Text>
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            {statusCopy(slot)}
          </Text>
        </View>
        {statusIcon(slot)}
      </View>

      {slot.rejectionReason ? (
        <View style={styles.errorBox}>
          <MaterialIcons name="info-outline" size={18} color="#C24122" />
          <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
            {slot.rejectionReason}
          </Text>
        </View>
      ) : null}

      {slot.status === "accepted" ? (
        <Pressable
          accessibilityLabel={`${label} 클립 다시 촬영 또는 선택`}
          accessibilityRole="button"
          accessibilityState={{ disabled: retakeDisabled }}
          disabled={retakeDisabled}
          onPress={onRetake}
          style={({ pressed }) => [
            styles.retakeButton,
            retakeDisabled && styles.disabled,
            pressed && !retakeDisabled && styles.pressed,
          ]}
        >
          <MaterialIcons name="refresh" size={18} color="#102235" />
          <Text style={styles.retakeText}>이 클립 다시 선택</Text>
        </Pressable>
      ) : (
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={`${label} 카메라로 로컬 슈팅 클립 촬영`}
            accessibilityRole="button"
            accessibilityState={{ disabled: captureDisabled }}
            disabled={captureDisabled}
            onPress={onCamera}
            style={({ pressed }) => [
              styles.primaryButton,
              captureDisabled && styles.disabled,
              pressed && !captureDisabled && styles.pressed,
            ]}
          >
            <MaterialIcons name="videocam" size={18} color="#FFFFFF" />
            <Text style={styles.primaryText}>카메라 촬영</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`${label} 기기 보관함에서 슈팅 영상 선택`}
            accessibilityRole="button"
            accessibilityState={{ disabled: captureDisabled }}
            disabled={captureDisabled}
            onPress={onLibrary}
            style={({ pressed }) => [
              styles.secondaryButton,
              captureDisabled && styles.disabled,
              pressed && !captureDisabled && styles.pressed,
            ]}
          >
            <MaterialIcons name="video-library" size={18} color="#102235" />
            <Text style={styles.secondaryText}>영상 선택</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFFEFA", borderColor: "#D9E0E4", borderRadius: 16, borderWidth: 1, padding: 14 },
  waitingCard: { backgroundColor: "#F1F3F3" },
  heading: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  headingCopy: { flex: 1 },
  label: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 19 },
  status: { color: "#61738A", fontFamily: "Barlow", fontSize: 12, lineHeight: 17, marginTop: 2 },
  errorBox: { alignItems: "flex-start", backgroundColor: "#FFF0E8", borderRadius: 11, flexDirection: "row", gap: 7, marginTop: 11, padding: 10 },
  errorText: { color: "#9A3412", flex: 1, fontFamily: "Barlow-SemiBold", fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  primaryButton: { alignItems: "center", backgroundColor: "#C24122", borderRadius: 12, flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 44, paddingHorizontal: 8 },
  primaryText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 15 },
  secondaryButton: { alignItems: "center", borderColor: "#102235", borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 44, paddingHorizontal: 8 },
  secondaryText: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 15 },
  retakeButton: { alignItems: "center", borderColor: "#B8C2CA", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 7, justifyContent: "center", marginTop: 12, minHeight: 44, paddingHorizontal: 12 },
  retakeText: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 14 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72 },
});
