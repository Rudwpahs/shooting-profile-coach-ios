import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { CaptureGuide } from "@/components/capture/capture-guide";
import { ScreenContainer } from "@/components/screen-container";
import { CaptureModePicker } from "@/components/shooting-profile/capture-mode-picker";
import { CaptureSlotCard } from "@/components/shooting-profile/capture-slot-card";
import { QualitySummary } from "@/components/shooting-profile/quality-summary";
import { TopBar } from "@/components/ui/top-bar";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { type SaveRepresentativeProfile, useShootingProfileCapture } from "@/hooks/use-shooting-profile-capture";
import { captureGuidanceForSlot, captureProtocolPresentation } from "@/lib/shooting-profile/capture-guidance";
import type { CaptureSessionState } from "@/lib/shooting-profile/capture-session-reducer";
import type { CaptureProtocolV2, ShootingHandV2 } from "@/lib/shooting-profile/types";

type CaptureSessionProps = {
  completionActionLabel: string;
  onClose: () => void;
  onComplete: (savedProfileId: string) => void;
  saveProfile?: SaveRepresentativeProfile;
};

/** Everything the presentation needs from the capture hook; the hook's return type satisfies it. */
export type CaptureController = {
  state: CaptureSessionState;
  canSave: boolean;
  selectMode: (mode: CaptureProtocolV2) => void;
  returnToModeSelect: () => void;
  setShootingHand: (hand: ShootingHandV2) => void;
  startCollection: () => void;
  acquireSlot: (slotId: string, source: "camera" | "library") => Promise<void> | void;
  retakeSlot: (slotId: string) => void;
  cancelSession: () => void;
  retrySession: () => void;
  save: () => Promise<void> | void;
};

type CaptureSessionViewProps = {
  controller: CaptureController;
  completionActionLabel: string;
  onClose: () => void;
  onComplete: (savedProfileId: string) => void;
  /** Stage width for the review skeleton; measured by the container when omitted. */
  width?: number;
};

const FALLBACK_WIDTH = 375;
const MAX_WIDTH = 680;
const STEP_TITLES: Readonly<Record<CaptureSessionState["status"], string>> = {
  mode_select: "어떻게 만들까요?",
  setup: "서는 곳과 카메라",
  collecting: "촬영",
  ready_to_aggregate: "결합 중",
  aggregating: "결합 중",
  result_review: "확인",
  saving: "확인",
  complete: "저장 완료",
  cancelled: "멈춤",
  error: "다시 확인",
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

/** Owns the capture hook; nothing else. */
export function CaptureSession({ completionActionLabel, onClose, onComplete, saveProfile }: CaptureSessionProps) {
  const capture = useShootingProfileCapture({ saveProfile });
  return <CaptureSessionView completionActionLabel={completionActionLabel} controller={capture} onClose={onClose} onComplete={onComplete} />;
}

/**
 * Capture in four moves: where to stand and where the camera goes (from
 * guidance data), shoot, then accept or recapture. Every status of the
 * unchanged state machine is rendered; recapture copy is the typed reason
 * the hook already translated.
 */
export function CaptureSessionView({ controller, completionActionLabel, onClose, onComplete, width: forcedWidth }: CaptureSessionViewProps) {
  const { state } = controller;
  const [focusedControl, setFocusedControl] = useState<string | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const width = Math.min(forcedWidth ?? (measuredWidth || FALLBACK_WIDTH), MAX_WIDTH);
  const saving = state.status === "saving";
  const presentation = state.mode ? captureProtocolPresentation(state.mode, state.shootingHand) : null;

  const close = () => {
    controller.cancelSession();
    onClose();
  };

  const focus = (key: string) => ({
    focusable: true,
    onBlur: () => setFocusedControl((current) => current === key ? null : current),
    onFocus: () => setFocusedControl(key),
  });

  const renderSlots = () => (
    <View style={styles.slots}>
      {(presentation?.views ?? []).map((guidance) => {
        const slots = state.slots.filter((slot) => slot.view === guidance.view);
        const accepted = slots.filter((slot) => slot.status === "accepted").length;
        return (
          <View key={guidance.view} style={styles.slotGroup}>
            <View style={styles.slotHead}>
              <Text style={styles.slotTitle}>{guidance.title}</Text>
              <Text accessibilityLiveRegion="polite" style={styles.slotCount}>{accepted}/{slots.length}</Text>
            </View>
            {slots.map((slot) => (
              <CaptureSlotCard
                key={slot.id}
                disabled={saving}
                onCamera={() => void controller.acquireSlot(slot.id, "camera")}
                onLibrary={() => void controller.acquireSlot(slot.id, "library")}
                onRetake={() => controller.retakeSlot(slot.id)}
                slot={slot}
                title={captureGuidanceForSlot(slot, state.shootingHand).title}
              />
            ))}
          </View>
        );
      })}
    </View>
  );

  const primary = (key: string, label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      {...focus(key)}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, focusStyle(focusedControl === key, true), disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );

  const secondary = (key: string, label: string, onPress: () => void) => (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: false }}
      disabled={false}
      {...focus(key)}
      onPress={onPress}
      style={({ pressed }) => [styles.secondary, focusStyle(focusedControl === key), pressed && styles.pressed]}
    >
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );

  return (
    <ScreenContainer
      containerClassName="bg-background"
      edges={["top", "bottom", "left", "right"]}
      onLayout={(event) => setMeasuredWidth(Math.round(event.nativeEvent.layout.width))}
    >
      <TopBar
        right={(
          <Pressable
            accessibilityLabel="대표 슛폼 촬영 화면 닫기"
            accessibilityRole="button"
            accessibilityState={{ disabled: saving, busy: saving }}
            disabled={saving}
            {...focus("close")}
            onPress={close}
            style={({ pressed }) => [styles.close, focusStyle(focusedControl === "close"), saving && styles.disabled, pressed && !saving && styles.pressed]}
          >
            <Text style={styles.closeText}>닫기</Text>
          </Pressable>
        )}
        title="슛폼 촬영"
      />
      <ScrollView contentContainerStyle={[styles.page, { width }]} showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={styles.step}>{STEP_TITLES[state.status]}</Text>

        {state.status === "mode_select" ? <CaptureModePicker onSelect={controller.selectMode} /> : null}

        {state.status === "setup" && presentation ? (
          <View style={styles.stack}>
            <View style={styles.handRow}>
              {(["right", "left"] as const).map((hand) => {
                const selected = state.shootingHand === hand;
                const key = `hand-${hand}`;
                return (
                  <Pressable
                    key={hand}
                    accessibilityLabel={`${hand === "right" ? "오른손" : "왼손"} 슈터 선택`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: false, selected }}
                    aria-selected={selected}
                    disabled={false}
                    {...focus(key)}
                    onPress={() => controller.setShootingHand(hand)}
                    style={({ pressed }) => [styles.hand, selected && styles.handSelected, focusStyle(focusedControl === key), pressed && styles.pressed]}
                  >
                    <Text style={[styles.handText, selected && styles.handTextSelected]}>{hand === "right" ? "오른손" : "왼손"}</Text>
                  </Pressable>
                );
              })}
            </View>
            <CaptureGuide views={presentation.views} />
            <Text numberOfLines={1} style={styles.modeLine}>{presentation.modeTitle} · {presentation.modeLine}</Text>
            {primary("start", `${presentation.views[0]?.title ?? "정면"}부터 촬영`, controller.startCollection)}
            {secondary("mode", "모드 변경", controller.returnToModeSelect)}
          </View>
        ) : null}

        {state.status === "collecting" ? (
          <View style={styles.stack}>
            {renderSlots()}
            {secondary("cancel", "촬영 세션 취소", controller.cancelSession)}
          </View>
        ) : null}

        {state.status === "ready_to_aggregate" || state.status === "aggregating" ? (
          <View style={styles.center}>
            <ActivityIndicator color={tokens.primary} size="large" />
            <Text accessibilityLiveRegion="polite" style={styles.centerLine}>정면과 측면을 위상으로 결합하는 중</Text>
          </View>
        ) : null}

        {(state.status === "result_review" || state.status === "saving") && state.mode && state.profile && state.confidence !== undefined ? (
          <View style={styles.stack}>
            <QualitySummary
              canSave={controller.canSave}
              confidence={state.confidence}
              mode={state.mode}
              onSave={() => void controller.save()}
              profile={state.profile}
              saving={saving}
              shootingHand={state.shootingHand}
              width={width}
            />
            <Text numberOfLines={1} style={styles.retakeLine}>평소 폼과 다르면 클립 하나만 다시 선택하세요</Text>
            {renderSlots()}
          </View>
        ) : null}

        {state.status === "complete" ? (
          <View style={styles.center}>
            <View style={styles.completeIcon}>
              <MaterialCommunityIcons name="lock" size={28} color={tokens.primaryForeground} />
            </View>
            <Text accessibilityLiveRegion="polite" style={styles.centerLine}>원본 영상은 업로드하지 않았고, 파생된 대표 슛폼 데이터만 비공개로 저장했습니다.</Text>
            {primary("complete", completionActionLabel, () => state.savedProfileId && onComplete(state.savedProfileId), !state.savedProfileId)}
          </View>
        ) : null}

        {state.status === "cancelled" ? (
          <View style={styles.center}>
            <MaterialCommunityIcons name="pause-circle-outline" size={44} color={tokens.mutedForeground} />
            <Text style={styles.centerLine}>기기 내 분석 요청을 취소했습니다. 통과한 결과는 이 화면 안에서만 유지됩니다.</Text>
            {primary("resume", "세션으로 돌아가기", controller.retrySession)}
            {secondary("cancel-close", "화면 닫기", onClose)}
          </View>
        ) : null}

        {state.status === "error" ? (
          <View style={styles.center}>
            <MaterialCommunityIcons name="alert-circle-outline" size={44} color={tokens.warning} />
            <Text accessibilityLiveRegion="assertive" style={styles.errorLine}>{state.errorMessage ?? "세션을 계속하지 못했습니다."}</Text>
            {primary("retry", state.recoveryStatus === "result_review" ? "리뷰로 돌아가기" : "클립 확인하기", controller.retrySession)}
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  page: { alignSelf: "center", paddingBottom: 36, paddingTop: 6 },
  close: { alignItems: "center", borderRadius: 22, height: 44, justifyContent: "center", minHeight: 44, minWidth: 44, paddingHorizontal: 4 },
  closeText: { ...typography.callout, color: tokens.foreground, fontWeight: "600" },
  step: { ...typography.title, color: tokens.foreground, paddingHorizontal: 14, paddingBottom: 10, paddingTop: 8 },
  stack: { gap: 12, paddingHorizontal: 14 },
  handRow: { flexDirection: "row", gap: 8 },
  hand: { alignItems: "center", backgroundColor: tokens.elevatedSurface, borderRadius: 999, flex: 1, justifyContent: "center", minHeight: 44, minWidth: 44 },
  handSelected: { backgroundColor: tokens.foreground },
  handText: { ...typography.callout, color: tokens.foreground, fontWeight: "600" },
  handTextSelected: { color: tokens.background },
  modeLine: { ...typography.caption, color: tokens.mutedForeground },
  slots: { gap: 14 },
  slotGroup: { gap: 8 },
  slotHead: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between" },
  slotTitle: { ...typography.headline, color: tokens.foreground },
  slotCount: { ...typography.label, color: tokens.mutedForeground },
  primary: { alignItems: "center", backgroundColor: tokens.primary, borderRadius: 12, justifyContent: "center", minHeight: 48, minWidth: 44, paddingHorizontal: 16 },
  primaryText: { ...typography.headline, color: tokens.primaryForeground },
  secondary: { alignItems: "center", borderRadius: 12, justifyContent: "center", minHeight: 44, minWidth: 44, paddingHorizontal: 14 },
  secondaryText: { ...typography.callout, color: tokens.foreground, fontWeight: "600" },
  center: { alignItems: "center", gap: 14, paddingHorizontal: 24, paddingTop: 28 },
  centerLine: { ...typography.callout, color: tokens.mutedForeground, textAlign: "center" },
  errorLine: { ...typography.callout, color: tokens.warning, textAlign: "center" },
  completeIcon: { alignItems: "center", backgroundColor: tokens.positive, borderRadius: 26, height: 52, justifyContent: "center", width: 52 },
  retakeLine: { ...typography.caption, color: tokens.mutedForeground, paddingTop: 4 },
  disabled: { opacity: 0.44 },
  pressed: { opacity: 0.72 },
});
