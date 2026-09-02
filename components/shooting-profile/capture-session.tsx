import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { CaptureModePicker } from "@/components/shooting-profile/capture-mode-picker";
import { CaptureSlotCard } from "@/components/shooting-profile/capture-slot-card";
import { QualitySummary } from "@/components/shooting-profile/quality-summary";
import { RealVideoEvaluationPanel } from "@/components/shooting-profile/real-video-evaluation-panel";
import {
  type SaveRepresentativeProfile,
  useShootingProfileCapture,
} from "@/hooks/use-shooting-profile-capture";

type CaptureSessionProps = {
  completionActionLabel: string;
  onClose: () => void;
  onComplete: (savedProfileId: string) => void;
  saveProfile?: SaveRepresentativeProfile;
};

function StepHeader({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <View style={styles.stepHeader}>
      <Text style={styles.stepCount}>{current} / 4</Text>
      <Text style={styles.stepNames}>모드 · 설정 · 촬영 · 리뷰</Text>
    </View>
  );
}

function SetupInstruction({ icon, children }: { icon: "accessibility-new" | "straighten" | "photo-size-select-large" | "sports-basketball"; children: string }) {
  return (
    <View style={styles.instructionRow}>
      <MaterialIcons name={icon} size={19} color="#F97316" />
      <Text style={styles.instructionText}>{children}</Text>
    </View>
  );
}

function focusStyle(focused: boolean, dark = false): ViewStyle {
  if (!focused) return {};
  return {
    elevation: 8,
    outlineColor: dark ? "#FFFFFF" : "#102235",
    outlineOffset: 2,
    outlineStyle: "solid",
    outlineWidth: 3,
    shadowColor: "#F97316",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  };
}

export function CaptureSession({ completionActionLabel, onClose, onComplete, saveProfile }: CaptureSessionProps) {
  const capture = useShootingProfileCapture({ saveProfile });
  const { state } = capture;
  const [focusedControl, setFocusedControl] = useState<string | null>(null);
  const saving = state.status === "saving";
  const frontSlots = state.slots.filter((slot) => slot.view === "front");
  const sideSlots = state.slots.filter((slot) => slot.view === "shooting_side");
  const frontAccepted = frontSlots.filter((slot) => slot.status === "accepted").length;
  const sideAccepted = sideSlots.filter((slot) => slot.status === "accepted").length;

  const close = () => {
    capture.cancelSession();
    onClose();
  };

  const renderSlots = () => (
    <>
      <View style={styles.slotSection}>
        <View style={styles.slotSectionHeading}>
          <Text style={styles.slotSectionTitle}>정면 클립</Text>
          <Text style={styles.slotProgress}>정면 {frontAccepted}/{frontSlots.length}</Text>
        </View>
        <View style={styles.slotList}>
          {frontSlots.map((slot) => (
            <CaptureSlotCard
              key={slot.id}
              disabled={state.status === "saving"}
              onCamera={() => void capture.acquireSlot(slot.id, "camera")}
              onLibrary={() => void capture.acquireSlot(slot.id, "library")}
              onRetake={() => capture.retakeSlot(slot.id)}
              slot={slot}
            />
          ))}
        </View>
      </View>
      <View style={styles.slotSection}>
        <View style={styles.slotSectionHeading}>
          <Text style={styles.slotSectionTitle}>슈팅 측면 클립</Text>
          <Text style={styles.slotProgress}>측면 {sideAccepted}/{sideSlots.length}</Text>
        </View>
        <View style={styles.slotList}>
          {sideSlots.map((slot) => (
            <CaptureSlotCard
              key={slot.id}
              disabled={state.status === "saving"}
              onCamera={() => void capture.acquireSlot(slot.id, "camera")}
              onLibrary={() => void capture.acquireSlot(slot.id, "library")}
              onRetake={() => capture.retakeSlot(slot.id)}
              slot={slot}
            />
          ))}
        </View>
      </View>
    </>
  );

  return (
    <ScreenContainer containerClassName="bg-background" edges={["top", "bottom", "left", "right"]}>
      <View style={styles.canvas} />
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>FORMPATH / PRIVATE CAPTURE</Text>
          <Text style={styles.headerTitle}>대표 슛폼 만들기</Text>
        </View>
        <Pressable
          accessibilityLabel="대표 슛폼 촬영 화면 닫기"
          accessibilityRole="button"
          accessibilityState={{ disabled: saving, busy: saving }}
          disabled={saving}
          focusable
          onBlur={() => setFocusedControl((current) => current === "close" ? null : current)}
          onFocus={() => setFocusedControl("close")}
          onPress={close}
          style={({ pressed }) => [styles.closeButton, focusStyle(focusedControl === "close"), saving && styles.disabled, pressed && !saving && styles.pressed]}
        >
          <MaterialIcons name="close" size={20} color="#102235" />
          <Text style={styles.closeText}>닫기</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        {state.status === "mode_select" ? (
          <View>
            <StepHeader current={1} />
            <CaptureModePicker onSelect={capture.selectMode} />
          </View>
        ) : null}

        {state.status === "setup" && state.mode ? (
          <View>
            <StepHeader current={2} />
            <Text style={styles.pageTitle}>촬영 조건을 맞춰주세요</Text>
            <Text style={styles.pageIntro}>
              정면 클립을 모두 마친 뒤 카메라를 한 번 옮겨 슈팅 측면 클립을 촬영합니다.
            </Text>

            <View style={styles.modeSummary}>
              <View style={styles.modeSummaryCopy}>
                <Text style={styles.summaryLabel}>선택 모드</Text>
                <Text style={styles.summaryValue}>
                  {state.mode === "basic_1_plus_1" ? "Basic · 1 + 1" : "High accuracy · 3 + 3"}
                </Text>
                <Text style={styles.summaryEvidence}>
                  {state.mode === "basic_1_plus_1"
                    ? "대표 스냅샷 추정 · 반복성 측정 아님"
                    : "3회 반복 일치도를 확인하는 고정밀 모드"}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="촬영 모드 다시 선택"
                accessibilityRole="button"
                accessibilityState={{ disabled: false }}
                disabled={false}
                focusable
                onBlur={() => setFocusedControl((current) => current === "mode" ? null : current)}
                onFocus={() => setFocusedControl("mode")}
                onPress={capture.returnToModeSelect}
                style={({ pressed }) => [styles.textButton, focusStyle(focusedControl === "mode", true), pressed && styles.pressed]}
              >
                <Text style={styles.textButtonText}>모드 변경</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>슈팅 손</Text>
            <View style={styles.handRow}>
              {(["right", "left"] as const).map((hand) => {
                const selected = state.shootingHand === hand;
                return (
                  <Pressable
                    key={hand}
                    accessibilityLabel={`${hand === "right" ? "오른손" : "왼손"} 슈터 선택`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: false, selected }}
                    disabled={false}
                    focusable
                    onBlur={() => setFocusedControl((current) => current === `hand-${hand}` ? null : current)}
                    onFocus={() => setFocusedControl(`hand-${hand}`)}
                    onPress={() => capture.setShootingHand(hand)}
                    style={({ pressed }) => [
                      styles.handButton,
                      selected && styles.handButtonSelected,
                      focusStyle(focusedControl === `hand-${hand}`, selected),
                      pressed && styles.pressed,
                    ]}
                  >
                    <MaterialIcons name={selected ? "check-circle" : "radio-button-unchecked"} size={19} color={selected ? "#FFFFFF" : "#102235"} />
                    <Text style={[styles.handText, selected && styles.handTextSelected]}>
                      {hand === "right" ? "오른손" : "왼손"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.instructions}>
              <SetupInstruction icon="accessibility-new">머리부터 발끝까지 전신이 계속 보이게 하세요.</SetupInstruction>
              <SetupInstruction icon="straighten">카메라를 고정하고 수평을 유지하세요.</SetupInstruction>
              <SetupInstruction icon="photo-size-select-large">각 클립의 거리와 화면 구성을 비슷하게 맞추세요.</SetupInstruction>
              <SetupInstruction icon="sports-basketball">평소의 자연스러운 슛폼을 준비부터 팔로우스루까지 반복하세요.</SetupInstruction>
            </View>

            <Pressable
              accessibilityLabel="정면 클립부터 촬영 시작"
              accessibilityRole="button"
              accessibilityState={{ disabled: false }}
              disabled={false}
              focusable
              onBlur={() => setFocusedControl((current) => current === "start" ? null : current)}
              onFocus={() => setFocusedControl("start")}
              onPress={capture.startCollection}
              style={({ pressed }) => [styles.startButton, focusStyle(focusedControl === "start", true), pressed && styles.primaryPressed]}
            >
              <Text style={styles.startText}>정면 클립부터 시작</Text>
              <MaterialIcons name="arrow-forward" size={19} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : null}

        {state.status === "collecting" ? (
          <View>
            <StepHeader current={3} />
            <Text style={styles.pageTitle}>정면부터 순서대로 촬영하세요</Text>
            <Text accessibilityLiveRegion="polite" style={styles.pageIntro}>
              정면 {frontAccepted}/{frontSlots.length} · 측면 {sideAccepted}/{sideSlots.length}. 통과한 클립 다음 슬롯만 열립니다.
            </Text>
            {renderSlots()}
            <Pressable
              accessibilityLabel="현재 대표 슛폼 촬영 세션 취소"
              accessibilityRole="button"
              accessibilityState={{ disabled: false }}
              disabled={false}
              focusable
              onBlur={() => setFocusedControl((current) => current === "cancel" ? null : current)}
              onFocus={() => setFocusedControl("cancel")}
              onPress={capture.cancelSession}
              style={({ pressed }) => [styles.cancelButton, focusStyle(focusedControl === "cancel"), pressed && styles.pressed]}
            >
              <Text style={styles.cancelText}>촬영 세션 취소</Text>
            </Pressable>
          </View>
        ) : null}

        {state.status === "ready_to_aggregate" || state.status === "aggregating" ? (
          <View style={styles.centerState}>
            <StepHeader current={3} />
            <ActivityIndicator color="#C24122" size="large" />
            <Text style={styles.centerTitle}>정규화된 슛 위상을 결합하는 중</Text>
            <Text accessibilityLiveRegion="polite" style={styles.centerCopy}>
              모든 필수 클립이 통과했습니다. 정면과 측면의 서로 다른 시간축을 각각 정규화하고 있습니다.
            </Text>
          </View>
        ) : null}

        {(state.status === "result_review" || state.status === "saving")
          && state.mode && state.profile && state.confidence !== undefined ? (
          <View>
            <StepHeader current={4} />
            <QualitySummary
              canSave={capture.canSave}
              confidence={state.confidence}
              mode={state.mode}
              onSave={() => void capture.save()}
              profile={state.profile}
              saving={state.status === "saving"}
            />
            <Text style={styles.retakeHeading}>클립별 확인</Text>
            <Text style={styles.retakeIntro}>결과가 평소 폼과 다르면 필요한 클립 하나만 다시 선택하세요.</Text>
            {renderSlots()}
            {capture.evaluationEnabled ? (
              <RealVideoEvaluationPanel
                canBuild={capture.evaluationAvailable}
                evaluation={capture.evaluation}
                onBuild={capture.buildEvaluationReport}
                onShare={() => void capture.shareEvaluationReport()}
              />
            ) : null}
          </View>
        ) : null}

        {state.status === "complete" ? (
          <View style={styles.centerState}>
            <StepHeader current={4} />
            <View style={styles.completeIcon}>
              <MaterialIcons name="lock" size={28} color="#FFFFFF" />
            </View>
            <Text style={styles.centerTitle}>비공개 저장 완료</Text>
            <Text accessibilityLiveRegion="polite" style={styles.centerCopy}>
              원본 영상은 업로드하지 않았고, 파생된 대표 슛폼 데이터만 비공개로 저장했습니다.
            </Text>
            <Pressable
              accessibilityLabel="대표 슛폼 촬영 완료 화면 닫기"
              accessibilityRole="button"
              accessibilityState={{ disabled: !state.savedProfileId }}
              disabled={!state.savedProfileId}
              focusable
              onBlur={() => setFocusedControl((current) => current === "complete" ? null : current)}
              onFocus={() => setFocusedControl("complete")}
              onPress={() => state.savedProfileId && onComplete(state.savedProfileId)}
              style={({ pressed }) => [styles.startButton, focusStyle(focusedControl === "complete", true), !state.savedProfileId && styles.disabled, pressed && !!state.savedProfileId && styles.primaryPressed]}
            >
              <Text style={styles.startText}>{completionActionLabel}</Text>
            </Pressable>
          </View>
        ) : null}

        {state.status === "cancelled" ? (
          <View style={styles.centerState}>
            <MaterialIcons name="pause-circle-outline" size={44} color="#61738A" />
            <Text style={styles.centerTitle}>촬영 세션을 멈췄습니다</Text>
            <Text style={styles.centerCopy}>기기 내 분석 요청을 취소했습니다. 통과한 파생 결과는 이 화면 안에서만 유지됩니다.</Text>
            <Pressable
              accessibilityLabel="멈춘 대표 슛폼 촬영 세션 다시 시작"
              accessibilityRole="button"
              accessibilityState={{ disabled: false }}
              disabled={false}
              focusable
              onBlur={() => setFocusedControl((current) => current === "resume" ? null : current)}
              onFocus={() => setFocusedControl("resume")}
              onPress={capture.retrySession}
              style={({ pressed }) => [styles.startButton, focusStyle(focusedControl === "resume", true), pressed && styles.primaryPressed]}
            >
              <Text style={styles.startText}>세션으로 돌아가기</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="멈춘 대표 슛폼 촬영 세션 닫기"
              accessibilityRole="button"
              accessibilityState={{ disabled: false }}
              disabled={false}
              focusable
              onBlur={() => setFocusedControl((current) => current === "cancel-close" ? null : current)}
              onFocus={() => setFocusedControl("cancel-close")}
              onPress={onClose}
              style={({ pressed }) => [styles.cancelButton, focusStyle(focusedControl === "cancel-close"), pressed && styles.pressed]}
            >
              <Text style={styles.cancelText}>화면 닫기</Text>
            </Pressable>
          </View>
        ) : null}

        {state.status === "error" ? (
          <View style={styles.centerState}>
            <MaterialIcons name="error-outline" size={44} color="#C24122" />
            <Text style={styles.centerTitle}>다시 확인해 주세요</Text>
            <Text accessibilityLiveRegion="assertive" style={styles.globalError}>
              {state.errorMessage ?? "세션을 계속하지 못했습니다."}
            </Text>
            <Pressable
              accessibilityLabel="오류 이전 대표 슛폼 촬영 단계로 돌아가기"
              accessibilityRole="button"
              accessibilityState={{ disabled: false }}
              disabled={false}
              focusable
              onBlur={() => setFocusedControl((current) => current === "retry" ? null : current)}
              onFocus={() => setFocusedControl("retry")}
              onPress={capture.retrySession}
              style={({ pressed }) => [styles.startButton, focusStyle(focusedControl === "retry", true), pressed && styles.primaryPressed]}
            >
              <Text style={styles.startText}>
                {state.recoveryStatus === "result_review" ? "리뷰로 돌아가기" : "클립 확인하기"}
              </Text>
            </Pressable>
            {capture.evaluationEnabled ? (
              <RealVideoEvaluationPanel
                canBuild={capture.evaluationAvailable}
                evaluation={capture.evaluation}
                onBuild={capture.buildEvaluationReport}
                onShare={() => void capture.shareEvaluationReport()}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  canvas: { backgroundColor: "#F5F1E8", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  header: { alignItems: "center", borderBottomColor: "#D9E0E4", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  kicker: { color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 10, letterSpacing: 1.2 },
  headerTitle: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 22, marginTop: 1 },
  closeButton: { alignItems: "center", borderColor: "#B8C2CA", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 5, justifyContent: "center", minHeight: 44, minWidth: 70, paddingHorizontal: 10 },
  closeText: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 14 },
  page: { alignSelf: "center", maxWidth: 680, paddingBottom: 36, paddingHorizontal: 16, paddingTop: 18, width: "100%" },
  stepHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 13 },
  stepCount: { color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 13, letterSpacing: 1 },
  stepNames: { color: "#61738A", fontFamily: "Barlow-SemiBold", fontSize: 11 },
  pageTitle: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 32, lineHeight: 36 },
  pageIntro: { color: "#61738A", fontFamily: "Barlow", fontSize: 14, lineHeight: 21, marginTop: 6 },
  modeSummary: { alignItems: "center", backgroundColor: "#102235", borderRadius: 17, flexDirection: "row", gap: 10, marginTop: 18, padding: 14 },
  modeSummaryCopy: { flex: 1 },
  summaryLabel: { color: "#B6C2CD", fontFamily: "Barlow", fontSize: 11 },
  summaryValue: { color: "#F5F1E8", fontFamily: "BarlowCondensed-Bold", fontSize: 20, marginTop: 2 },
  summaryEvidence: { color: "#FDBA74", fontFamily: "Barlow-SemiBold", fontSize: 11, lineHeight: 16, marginTop: 3 },
  textButton: { alignItems: "center", borderColor: "#F5F1E8", borderRadius: 11, borderWidth: 1, justifyContent: "center", minHeight: 44, minWidth: 44, paddingHorizontal: 10 },
  textButtonText: { color: "#F5F1E8", fontFamily: "BarlowCondensed-Bold", fontSize: 13 },
  sectionLabel: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 18, marginTop: 21 },
  handRow: { flexDirection: "row", gap: 9, marginTop: 9 },
  handButton: { alignItems: "center", borderColor: "#B8C2CA", borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 44, minWidth: 44 },
  handButtonSelected: { backgroundColor: "#102235", borderColor: "#102235" },
  handText: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 15 },
  handTextSelected: { color: "#FFFFFF" },
  instructions: { backgroundColor: "#FFFEFA", borderColor: "#D9E0E4", borderRadius: 17, borderWidth: 1, gap: 11, marginTop: 18, padding: 14 },
  instructionRow: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
  instructionText: { color: "#102235", flex: 1, fontFamily: "Barlow", fontSize: 13, lineHeight: 19 },
  startButton: { alignItems: "center", backgroundColor: "#C24122", borderRadius: 14, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 18, minHeight: 48, minWidth: 44, paddingHorizontal: 14 },
  startText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 17 },
  slotSection: { marginTop: 22 },
  slotSectionHeading: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginBottom: 9 },
  slotSectionTitle: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 22 },
  slotProgress: { color: "#C24122", fontFamily: "BarlowCondensed-Bold", fontSize: 14 },
  slotList: { gap: 10 },
  cancelButton: { alignItems: "center", borderColor: "#B8C2CA", borderRadius: 13, borderWidth: 1, justifyContent: "center", marginTop: 14, minHeight: 44, minWidth: 44, paddingHorizontal: 14 },
  cancelText: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 15 },
  centerState: { alignItems: "center", paddingHorizontal: 8, paddingTop: 34 },
  centerTitle: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 27, marginTop: 14, textAlign: "center" },
  centerCopy: { color: "#61738A", fontFamily: "Barlow", fontSize: 14, lineHeight: 21, marginTop: 6, textAlign: "center" },
  completeIcon: { alignItems: "center", backgroundColor: "#166534", borderRadius: 24, height: 52, justifyContent: "center", width: 52 },
  retakeHeading: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 24, marginTop: 25 },
  retakeIntro: { color: "#61738A", fontFamily: "Barlow", fontSize: 13, lineHeight: 19, marginTop: 3 },
  globalError: { color: "#9A3412", fontFamily: "Barlow-SemiBold", fontSize: 14, lineHeight: 21, marginTop: 8, textAlign: "center" },
  disabled: { opacity: 0.44 },
  pressed: { opacity: 0.72 },
  primaryPressed: { opacity: 0.76 },
});
