import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useReducer, useRef } from "react";

import type { SaveShootingProfileInputV2 } from "@/lib/firebase-shooting-profile-contract";
import {
  admitCaptureSaveOperationV2,
  captureSaveOperationMatches,
  captureSessionRetainsSaveToken,
  captureSessionReducer,
  clearCaptureSaveOperationIfMatching,
  createCaptureSession,
  matchingShootingProfileSaveInputV2,
  runCaptureSaveOperationV2,
  type CaptureSaveOperationTokenV2,
  type RetainedNormalizedAttemptsV2,
} from "@/lib/shooting-profile/capture-session-reducer";
import { detectPhaseAnchors, resampleAttemptToPhaseGrid } from "@/lib/shooting-profile/phase-normalization";
import { buildRepresentativeSequence } from "@/lib/shooting-profile/representative-sequence";
import type { NormalizedViewAttemptV2 } from "@/lib/shooting-profile/repeated-shot";
import type {
  CaptureProtocolV2,
  ShootingHandV2,
} from "@/lib/shooting-profile/types";
import {
  cancelPoseClipV2,
  detectPoseClipV2,
} from "@/lib/pose-detection-v2";
import { validateSelectedShootingVideo } from "@/lib/video-intake";

export type ShootingProfileCaptureSource = "camera" | "library";

export type SaveRepresentativeProfile = (
  input: SaveShootingProfileInputV2,
) => Promise<string>;

type UseShootingProfileCaptureOptions = {
  saveProfile?: SaveRepresentativeProfile;
};

type ActiveRequest = {
  requestId: string;
  generation: number;
};

let requestCounter = 0;

function opaqueRequestId(): string {
  requestCounter += 1;
  const random = Math.random().toString(36).slice(2, 12);
  return `capture_${requestCounter.toString(36)}_${random}`;
}

function qualityRejectionReason(reasons: readonly string[]): string {
  if (reasons.includes("too_few_detected_frames")) {
    return "전신 관절을 충분한 프레임에서 찾지 못했습니다. 밝은 곳에서 전신이 계속 보이도록 다시 촬영하세요.";
  }
  if (reasons.includes("low_detection_ratio")) {
    return "영상 대부분에서 전신 포즈를 안정적으로 찾지 못했습니다. 카메라를 고정하고 같은 거리에서 다시 촬영하세요.";
  }
  if (reasons.includes("low_critical_joint_coverage")) {
    return "어깨·손목·골반·무릎·발목이 충분히 보이지 않았습니다. 전신과 슈팅 팔이 가려지지 않게 다시 촬영하세요.";
  }
  if (reasons.includes("critical_phase_gap")) {
    return "공을 올리고 놓는 구간의 포즈가 끊겼습니다. 해당 동작이 프레임 안에서 선명하게 이어지도록 다시 촬영하세요.";
  }
  return "이 클립은 포즈 품질 기준을 통과하지 못했습니다. 전신과 팔로우스루가 보이도록 다시 촬영하세요.";
}

function detectorFailureReason(status: string, reason: string): string {
  if (status === "native_build_required") {
    return "기기 내 포즈 분석에는 iPhone custom development build가 필요합니다.";
  }
  if (reason === "model_missing") {
    return "기기 내 포즈 모델을 불러오지 못했습니다. 앱 빌드를 확인한 뒤 다시 시도하세요.";
  }
  if (reason === "invalid_video") {
    return "선택한 영상을 기기에서 읽지 못했습니다. 다른 2–20초 영상을 선택하세요.";
  }
  if (reason === "person_roi_unavailable") {
    return "영상에서 한 사람의 전신 영역을 안정적으로 잡지 못했습니다. 전신과 뻗은 팔이 화면 안에 계속 보이도록 다시 촬영하세요.";
  }
  return "기기 내 포즈 분석을 완료하지 못했습니다. 잠시 후 다시 시도하세요.";
}

function recaptureReason(reason: string): string {
  if (reason === "no_complete_agreeing_subset") {
    return "반복 슛 사이의 일치도가 충분하지 않습니다. 평소 슛폼으로 해당 클립을 다시 촬영하세요.";
  }
  return "두 시점의 위상 결합 품질이 부족합니다. 안내를 확인하고 필요한 클립을 다시 촬영하세요.";
}

export function useShootingProfileCapture(
  options: UseShootingProfileCaptureOptions = {},
) {
  const [state, dispatch] = useReducer(
    captureSessionReducer,
    undefined,
    () => createCaptureSession(),
  );
  const stateRef = useRef(state);
  const activeRequestsRef = useRef(new Map<string, ActiveRequest>());
  const saveInFlightRef = useRef<CaptureSaveOperationTokenV2 | null>(null);
  const normalizedAttemptsRef = useRef<RetainedNormalizedAttemptsV2 | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!captureSessionRetainsSaveToken(state.status)) {
      saveInFlightRef.current = null;
    }
  }, [state.status]);

  const cancelRequest = useCallback((slotId: string) => {
    const active = activeRequestsRef.current.get(slotId);
    if (!active) return;
    activeRequestsRef.current.delete(slotId);
    void cancelPoseClipV2(active.requestId);
  }, []);

  const cancelAllRequests = useCallback(() => {
    const requests = [...activeRequestsRef.current.values()];
    activeRequestsRef.current.clear();
    requests.forEach(({ requestId }) => {
      void cancelPoseClipV2(requestId);
    });
  }, []);

  const invalidateDerivedSave = useCallback(() => {
    saveInFlightRef.current = null;
    normalizedAttemptsRef.current = null;
  }, []);

  useEffect(() => () => {
    cancelAllRequests();
    invalidateDerivedSave();
  }, [cancelAllRequests, invalidateDerivedSave]);

  const selectMode = useCallback((mode: CaptureProtocolV2) => {
    cancelAllRequests();
    invalidateDerivedSave();
    dispatch({ type: "SELECT_MODE", mode });
  }, [cancelAllRequests, invalidateDerivedSave]);

  const returnToModeSelect = useCallback(() => {
    cancelAllRequests();
    invalidateDerivedSave();
    dispatch({ type: "RETURN_TO_MODE_SELECT" });
  }, [cancelAllRequests, invalidateDerivedSave]);

  const setShootingHand = useCallback((shootingHand: ShootingHandV2) => {
    if (stateRef.current.shootingHand === shootingHand) return;
    cancelAllRequests();
    invalidateDerivedSave();
    dispatch({ type: "SET_SHOOTING_HAND", shootingHand });
  }, [cancelAllRequests, invalidateDerivedSave]);

  const startCollection = useCallback(() => {
    dispatch({ type: "START_COLLECTION" });
  }, []);

  const acquireSlot = useCallback(async (
    slotId: string,
    source: ShootingProfileCaptureSource,
  ) => {
    const snapshot = stateRef.current;
    if (snapshot.status !== "collecting") return;
    const slot = snapshot.slots.find((candidate) => candidate.id === slotId);
    if (!slot?.enabled || slot.status === "acquiring" || slot.status === "analyzing") return;
    if (activeRequestsRef.current.has(slotId)) return;

    const requestId = opaqueRequestId();
    const generation = slot.generation + 1;
    activeRequestsRef.current.set(slotId, { requestId, generation });
    dispatch({ type: "SLOT_ACQUIRE_STARTED", slotId, requestId, generation });
    const requestIsActive = () => {
      const active = activeRequestsRef.current.get(slotId);
      return active?.requestId === requestId && active.generation === generation;
    };

    try {
      const permission = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!requestIsActive()) return;
      if (!permission.granted) {
        dispatch({
          type: "SLOT_REJECTED",
          slotId,
          requestId,
          generation,
          reason: source === "camera"
            ? "로컬 슈팅 클립을 촬영하려면 카메라 권한이 필요합니다. iPhone 설정에서 허용한 뒤 다시 시도하세요."
            : "기기에서 슈팅 영상을 선택하려면 사진 접근 권한이 필요합니다. iPhone 설정에서 허용한 뒤 다시 시도하세요.",
        });
        return;
      }

      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["videos"],
        allowsMultipleSelection: false,
        videoMaxDuration: 20,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      };
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);
      if (!requestIsActive()) return;
      if (result.canceled || !result.assets[0]) {
        dispatch({ type: "SLOT_CANCELLED", slotId, requestId, generation });
        return;
      }

      const asset = result.assets[0];
      const intakeFailure = validateSelectedShootingVideo(asset);
      if (intakeFailure) {
        dispatch({
          type: "SLOT_REJECTED",
          slotId,
          requestId,
          generation,
          reason: intakeFailure,
        });
        return;
      }

      const detected = await detectPoseClipV2({
        requestId,
        uri: asset.uri,
        view: slot.view,
        shootingHand: snapshot.shootingHand,
        takeIndex: slot.takeIndex,
        profile: "personal_v2",
      }, (progress) => {
        dispatch({
          type: "SLOT_PROGRESS",
          slotId,
          requestId,
          generation,
          progress: {
            stage: progress.stage,
            completed: progress.completed,
            total: progress.total,
          },
        });
      });

      if (detected.status === "cancelled") {
        dispatch({ type: "SLOT_CANCELLED", slotId, requestId, generation });
        return;
      }
      if (detected.status !== "complete") {
        dispatch({
          type: "SLOT_REJECTED",
          slotId,
          requestId,
          generation,
          reason: detectorFailureReason(detected.status, detected.reason),
        });
        return;
      }
      if (!detected.sequence.quality.passed) {
        dispatch({
          type: "SLOT_REJECTED",
          slotId,
          requestId,
          generation,
          reason: qualityRejectionReason(detected.sequence.quality.reasons),
        });
        return;
      }
      dispatch({
        type: "SLOT_ACCEPTED",
        slotId,
        requestId,
        generation,
        sequence: detected.sequence,
      });
    } catch {
      dispatch({
        type: "SLOT_REJECTED",
        slotId,
        requestId,
        generation,
        reason: "영상 선택 또는 기기 내 분석을 완료하지 못했습니다. 잠시 후 다시 시도하세요.",
      });
    } finally {
      const active = activeRequestsRef.current.get(slotId);
      if (active?.requestId === requestId && active.generation === generation) {
        activeRequestsRef.current.delete(slotId);
      }
      // Picker media is not retained here. User-library originals are never deleted,
      // and app-cache deletion is left to the OS unless this app can prove ownership.
    }
  }, []);

  const retakeSlot = useCallback((slotId: string) => {
    invalidateDerivedSave();
    dispatch({ type: "RETAKE_SLOT", slotId });
    cancelRequest(slotId);
  }, [cancelRequest, invalidateDerivedSave]);

  const cancelSession = useCallback(() => {
    dispatch({ type: "CANCEL_SESSION" });
    cancelAllRequests();
    invalidateDerivedSave();
  }, [cancelAllRequests, invalidateDerivedSave]);

  const retrySession = useCallback(() => {
    dispatch({ type: "RETRY_SESSION" });
  }, []);

  useEffect(() => {
    if (state.status !== "ready_to_aggregate" || state.mode === null) return;
    const sessionGeneration = state.sessionGeneration;
    const acceptedSlots = state.slots.filter((slot) => (
      slot.status === "accepted" && slot.sequence !== undefined
    ));
    if (acceptedSlots.length !== state.slots.length) return;

    dispatch({ type: "AGGREGATE_STARTED" });
    normalizedAttemptsRef.current = null;
    try {
      const attempts = acceptedSlots.map((slot): NormalizedViewAttemptV2 => {
        const sequence = slot.sequence;
        if (!sequence) throw new Error("accepted slot is missing its derived sequence");
        const phaseAnchors = detectPhaseAnchors(sequence);
        return {
          id: slot.id,
          phaseAnchors,
          frames: resampleAttemptToPhaseGrid(sequence, phaseAnchors),
        };
      });
      const result = buildRepresentativeSequence({
        mode: state.mode,
        frontAttempts: attempts.filter((attempt) => attempt.frames[0]?.view === "front"),
        shootingSideAttempts: attempts.filter((attempt) => attempt.frames[0]?.view === "shooting_side"),
        rootMotion: { status: "unavailable" },
      });
      if (result.status === "complete") {
        normalizedAttemptsRef.current = {
          sessionGeneration,
          mode: state.mode,
          shootingHand: state.shootingHand,
          normalizedAttempts: attempts,
        };
        dispatch({
          type: "AGGREGATE_COMPLETED",
          sessionGeneration,
          profile: result.profile,
          confidence: result.confidence,
        });
      } else {
        normalizedAttemptsRef.current = null;
        dispatch({
          type: "AGGREGATE_RECAPTURE_REQUIRED",
          sessionGeneration,
          reason: recaptureReason(result.reason),
        });
      }
    } catch {
      normalizedAttemptsRef.current = null;
      dispatch({
        type: "AGGREGATE_RECAPTURE_REQUIRED",
        sessionGeneration,
        reason: "슛 위상 정렬을 완료하지 못했습니다. 전신과 준비부터 팔로우스루가 보이는 클립으로 다시 시도하세요.",
      });
    }
  }, [state.mode, state.sessionGeneration, state.shootingHand, state.slots, state.status]);

  const save = useCallback(async () => {
    const snapshot = stateRef.current;
    const retained = normalizedAttemptsRef.current;
    if (!options.saveProfile || !matchingShootingProfileSaveInputV2(snapshot, retained)) return;
    const operation = admitCaptureSaveOperationV2(saveInFlightRef.current, {
      token: opaqueRequestId(),
      sessionGeneration: snapshot.sessionGeneration,
    });
    if (!operation) return;
    saveInFlightRef.current = operation;

    await runCaptureSaveOperationV2({
      state: snapshot,
      retained,
      saveProfile: options.saveProfile,
      isCurrent: () => captureSaveOperationMatches(
        saveInFlightRef.current,
        operation,
        stateRef.current.sessionGeneration,
      ),
      onStarted: () => dispatch({ type: "SAVE_STARTED" }),
      onSucceeded: (profileId, sessionGeneration) => dispatch({
        type: "SAVE_SUCCEEDED",
        sessionGeneration,
        profileId,
      }),
      onFailed: (sessionGeneration) => dispatch({
        type: "SAVE_FAILED",
        sessionGeneration,
        reason: "비공개 저장을 완료하지 못했습니다. 연결을 확인하고 다시 시도하세요.",
      }),
      onFinally: () => {
        saveInFlightRef.current = clearCaptureSaveOperationIfMatching(
          saveInFlightRef.current,
          operation,
        );
      },
    });
  }, [options.saveProfile]);

  const canSave = options.saveProfile !== undefined
    && matchingShootingProfileSaveInputV2(state, normalizedAttemptsRef.current) !== null;

  return {
    state,
    canSave,
    selectMode,
    returnToModeSelect,
    setShootingHand,
    startCollection,
    acquireSlot,
    retakeSlot,
    cancelSession,
    retrySession,
    save,
  };
}
