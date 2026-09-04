import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Share } from "react-native";

import type { CaptureSessionState } from "@/lib/shooting-profile/capture-session-reducer";
import {
  admitEvaluationAttempts,
  buildRealVideoEvaluation,
  describeRealVideoEvaluationState,
  shareRealVideoEvaluation,
  type EvaluationAttemptAdmissionReasonV1,
  type RealVideoEvaluationFilePreparer,
  type RealVideoEvaluationShareResult,
  type RealVideoEvaluationSharePayload,
  type RealVideoEvaluationState,
} from "@/lib/shooting-profile/real-video-evaluation";

export type UseRealVideoEvaluationOptions = {
  enabled: boolean;
  state: CaptureSessionState;
  consentRecordId: string;
  /**
   * Writes the report to a temporary file for the share sheet. Injected rather
   * than imported so this hook keeps no file-system dependency of its own.
   */
  prepareFile: RealVideoEvaluationFilePreparer;
  /** Injectable for tests; production uses the React Native share sheet. */
  share?: (payload: RealVideoEvaluationSharePayload) => Promise<RealVideoEvaluationShareResult>;
  /** Injectable for tests; production announces to VoiceOver/TalkBack. */
  announce?: (message: string) => void;
};

export type RealVideoEvaluationController = {
  evaluation: RealVideoEvaluationState;
  consentConfirmed: boolean;
  busy: boolean;
  canBuild: boolean;
  canShare: boolean;
  admissionReason?: EvaluationAttemptAdmissionReasonV1;
  toggleConsent: () => void;
  build: () => Promise<void>;
  share: () => Promise<void>;
};

function defaultShare(payload: RealVideoEvaluationSharePayload): Promise<RealVideoEvaluationShareResult> {
  // User-initiated system share sheet only; nothing is copied, posted, or tracked.
  // The temporary derived-report file is removed after the attempt.
  return Share.share({ url: payload.url, title: payload.title });
}

function defaultAnnounce(message: string): void {
  // iOS VoiceOver ignores accessibilityLiveRegion, so state changes are spoken explicitly.
  AccessibilityInfo.announceForAccessibility(message);
}

/**
 * Owns the development-build-only evaluation interaction: an explicit consent
 * confirmation, one in-flight build, one in-flight share, and a spoken status
 * for every terminal state. It never persists, uploads, or copies anything.
 */
export function useRealVideoEvaluation({
  enabled,
  state,
  consentRecordId,
  prepareFile,
  share = defaultShare,
  announce = defaultAnnounce,
}: UseRealVideoEvaluationOptions): RealVideoEvaluationController {
  const [evaluation, setEvaluation] = useState<RealVideoEvaluationState>({ status: "idle" });
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const evaluationRef = useRef(evaluation);
  const inFlightRef = useRef(false);
  const stateRef = useRef(state);

  useEffect(() => {
    evaluationRef.current = evaluation;
  }, [evaluation]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // A new capture generation invalidates any derived report and its consent.
  useEffect(() => {
    inFlightRef.current = false;
    setEvaluation({ status: "idle" });
    setConsentConfirmed(false);
  }, [state.sessionGeneration]);

  const admission = useMemo(
    () => (enabled ? admitEvaluationAttempts(state) : undefined),
    [enabled, state],
  );
  const admissionReason = admission?.status === "rejected" ? admission.reason : undefined;

  const settle = useCallback((next: RealVideoEvaluationState) => {
    inFlightRef.current = false;
    setEvaluation(next);
    announce(describeRealVideoEvaluationState(next));
  }, [announce]);

  const toggleConsent = useCallback(() => {
    if (!enabled || inFlightRef.current) return;
    setConsentConfirmed((current) => !current);
  }, [enabled]);

  const build = useCallback(async () => {
    if (!enabled || inFlightRef.current) return;
    const snapshot = stateRef.current;
    inFlightRef.current = true;
    setEvaluation({ status: "building", sessionGeneration: snapshot.sessionGeneration });
    // Yield once so the busy state paints before the synchronous reconstruction.
    await Promise.resolve();
    const result = buildRealVideoEvaluation(snapshot, {
      sourceClass: "consented_self_capture",
      consentConfirmed,
      consentRecordId,
    });
    settle(result.status === "ready"
      ? {
        status: "ready",
        sessionGeneration: snapshot.sessionGeneration,
        report: result.report,
        json: result.json,
      }
      : {
        status: "build_failed",
        sessionGeneration: snapshot.sessionGeneration,
        reason: result.reason,
      });
  }, [consentConfirmed, consentRecordId, enabled, settle]);

  const shareReport = useCallback(async () => {
    if (!enabled || inFlightRef.current) return;
    const current = evaluationRef.current;
    if (!("json" in current)) return;
    inFlightRef.current = true;
    setEvaluation({ ...current, status: "sharing" });
    const outcome = await shareRealVideoEvaluation(current.json, prepareFile, share);
    settle({ ...current, status: outcome });
  }, [enabled, prepareFile, settle, share]);

  const busy = evaluation.status === "building" || evaluation.status === "sharing";
  return {
    evaluation,
    consentConfirmed,
    busy,
    canBuild: enabled && admission?.status === "admitted" && consentConfirmed && !busy,
    canShare: enabled && "json" in evaluation && !busy,
    admissionReason,
    toggleConsent,
    build,
    share: shareReport,
  };
}
