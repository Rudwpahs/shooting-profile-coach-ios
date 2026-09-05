import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import type { RealVideoEvaluationController } from "@/hooks/use-real-video-evaluation";
import { describeRealVideoEvaluationState } from "@/lib/shooting-profile/real-video-evaluation";

type RealVideoEvaluationPanelProps = {
  controller: RealVideoEvaluationController;
};

const ADMISSION_COPY: Record<string, string> = {
  session_not_ready: "정면과 측면 클립이 모두 통과한 뒤에 사용할 수 있습니다.",
  library_source_not_admissible: "평가 증거는 이 앱에서 직접 촬영한 클립만 사용합니다. 라이브러리에서 고른 영상은 제외됩니다.",
  unknown_capture_source: "이 클립의 촬영 출처를 확인할 수 없어 평가 증거로 쓸 수 없습니다. 다시 촬영하세요.",
};

/**
 * Internal, development-build-only panel. It is only rendered when the capture
 * hook reports the private evaluation flag as enabled, and it exposes exactly
 * three user-initiated actions: confirm consent, build the derived report, then
 * hand it to the system share sheet. Nothing here runs automatically.
 */
export function RealVideoEvaluationPanel({ controller }: RealVideoEvaluationPanelProps) {
  const { busy, canBuild, canShare, consentConfirmed, evaluation } = controller;
  const building = evaluation.status === "building";
  const sharing = evaluation.status === "sharing";
  const admissionCopy = controller.admissionReason
    ? ADMISSION_COPY[controller.admissionReason] ?? controller.admissionReason
    : undefined;

  return (
    <View style={styles.panel}>
      <Text style={styles.kicker}>INTERNAL · DEV BUILD ONLY</Text>
      <Text style={styles.title}>파생 평가 리포트</Text>
      <Text style={styles.copy}>
        원본 영상과 랜드마크는 기기 밖으로 나가지 않습니다. 공유 시트에는 스키마를 통과한 파생 지표 JSON만 전달됩니다.
      </Text>

      <Pressable
        accessibilityHint="이 앱에서 직접 촬영한 본인 영상일 때만 선택하세요."
        accessibilityLabel="본인 촬영 동의를 확인했음을 표시"
        accessibilityRole="checkbox"
        // accessibilityState drives iOS VoiceOver; the aria aliases carry the
        // same state on the web runtime. React Native supports both.
        accessibilityState={{ busy, checked: consentConfirmed, disabled: busy }}
        aria-busy={busy}
        aria-checked={consentConfirmed}
        disabled={busy}
        focusable
        onPress={controller.toggleConsent}
        style={({ pressed }) => [styles.consentRow, busy && styles.disabled, pressed && !busy && styles.pressed]}
      >
        <Text style={styles.consentMark}>{consentConfirmed ? "☑" : "☐"}</Text>
        <Text style={styles.consentText}>
          본인이 촬영했고 사용에 동의한 영상입니다. 동의 기록 ID는 개발 빌드 환경변수에서 읽습니다.
        </Text>
      </Pressable>

      {admissionCopy ? (
        <Text accessibilityLiveRegion="polite" style={styles.blocked}>{admissionCopy}</Text>
      ) : null}

      <View style={styles.statusRow}>
        {busy ? <ActivityIndicator accessibilityLabel="처리 중" color="#102235" size="small" /> : null}
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          {describeRealVideoEvaluationState(evaluation)}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="파생 평가 리포트 생성"
          accessibilityRole="button"
          accessibilityState={{ busy: building, disabled: !canBuild }}
          aria-busy={building}
          disabled={!canBuild}
          focusable
          onPress={() => void controller.build()}
          style={({ pressed }) => [styles.primaryButton, !canBuild && styles.disabled, pressed && canBuild && styles.pressed]}
        >
          <Text style={styles.primaryText}>{building ? "생성 중…" : "파생 리포트 생성"}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="파생 평가 리포트 공유 또는 저장"
          accessibilityRole="button"
          accessibilityState={{ busy: sharing, disabled: !canShare }}
          aria-busy={sharing}
          disabled={!canShare}
          focusable
          onPress={() => void controller.share()}
          style={({ pressed }) => [styles.secondaryButton, !canShare && styles.disabled, pressed && canShare && styles.pressed]}
        >
          <Text style={styles.secondaryText}>{sharing ? "공유 중…" : "리포트 공유 · 저장"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: "#FFFEFA", borderColor: "#102235", borderRadius: 17, borderStyle: "dashed", borderWidth: 1, marginTop: 22, padding: 14 },
  kicker: { color: "#9A3412", fontFamily: "BarlowCondensed-Bold", fontSize: 10, letterSpacing: 1.2 },
  title: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 20, marginTop: 2 },
  copy: { color: "#5A6B80", fontFamily: "Barlow", fontSize: 13, lineHeight: 19, marginTop: 6 },
  consentRow: { alignItems: "flex-start", flexDirection: "row", gap: 8, marginTop: 12, minHeight: 44, paddingVertical: 4 },
  consentMark: { color: "#102235", fontFamily: "Barlow-SemiBold", fontSize: 16, lineHeight: 20 },
  consentText: { color: "#102235", flex: 1, fontFamily: "Barlow", fontSize: 13, lineHeight: 19 },
  blocked: { color: "#8A2F14", fontFamily: "Barlow-SemiBold", fontSize: 13, lineHeight: 19, marginTop: 10 },
  statusRow: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 10 },
  status: { color: "#102235", flex: 1, fontFamily: "Barlow-SemiBold", fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", gap: 9, marginTop: 12 },
  primaryButton: { alignItems: "center", backgroundColor: "#102235", borderRadius: 12, flex: 1, justifyContent: "center", minHeight: 44, minWidth: 44, paddingHorizontal: 10 },
  primaryText: { color: "#FFFFFF", fontFamily: "BarlowCondensed-Bold", fontSize: 14 },
  secondaryButton: { alignItems: "center", borderColor: "#8795A6", borderRadius: 12, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 44, minWidth: 44, paddingHorizontal: 10 },
  secondaryText: { color: "#102235", fontFamily: "BarlowCondensed-Bold", fontSize: 14 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
});
