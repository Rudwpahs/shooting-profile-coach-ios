import { buildCapturePlan } from "@/lib/shooting-profile/capture-plan";
import {
  isOpaqueShootingProfileIdV2,
  type SaveShootingProfileInputV2,
} from "@/lib/firebase-shooting-profile-contract";
import type { NormalizedViewAttemptV2 } from "@/lib/shooting-profile/repeated-shot";
import type {
  CaptureProtocolV2,
  LandmarkSequenceV2,
  RepresentativePose4DV2,
  ShootingHandV2,
} from "@/lib/shooting-profile/types";

export type CaptureSessionStatus =
  | "mode_select"
  | "setup"
  | "collecting"
  | "ready_to_aggregate"
  | "aggregating"
  | "result_review"
  | "saving"
  | "complete"
  | "cancelled"
  | "error";

export type CaptureSlotStatus =
  | "empty"
  | "acquiring"
  | "analyzing"
  | "accepted"
  | "rejected"
  | "cancelled";

export type CaptureProgress = {
  stage: "metadata" | "coarse_pose" | "dense_pose" | "quality" | "complete";
  completed: number;
  total: number;
};

export type CaptureSessionRecoveryStatus = "mode_select" | "setup" | "collecting" | "result_review";

export type OwnerValueEnvelope<T> = {
  ownerUid: string;
  value: T;
};

export function valueForExactOwner<T>(
  currentOwnerUid: string | null,
  envelope: OwnerValueEnvelope<T> | null,
): T | undefined {
  return currentOwnerUid !== null && envelope?.ownerUid === currentOwnerUid
    ? envelope.value
    : undefined;
}

export function ownerGenerationMatches(
  currentOwnerUid: string | null,
  expectedOwnerUid: string,
  activeGeneration: number,
  expectedGeneration: number,
): boolean {
  return currentOwnerUid === expectedOwnerUid && activeGeneration === expectedGeneration;
}

export type OwnerOperationToken = {
  ownerUid: string;
  profileId: string;
  token: number;
};

export function ownerOperationMatches(
  currentOwnerUid: string | null,
  active: OwnerOperationToken | null,
  expectedToken: number,
): boolean {
  return active !== null
    && active.ownerUid === currentOwnerUid
    && active.token === expectedToken;
}

export function clearOwnerOperationIfMatching(
  active: OwnerOperationToken | null,
  expectedToken: number,
): OwnerOperationToken | null {
  return active?.token === expectedToken ? null : active;
}

export function captureSessionRetainsSaveToken(status: CaptureSessionStatus): boolean {
  return status === "result_review" || status === "saving";
}

/** Where a slot's clip came from. Provenance only; never a URI, path, or file name. */
export type CaptureSlotSourceV2 = "camera" | "library";

export type CaptureSessionSlot = ReturnType<typeof buildCapturePlan>[number] & {
  status: CaptureSlotStatus;
  enabled: boolean;
  generation: number;
  requestId?: string;
  captureSource?: CaptureSlotSourceV2;
  progress?: CaptureProgress;
  sequence?: LandmarkSequenceV2;
  rejectionReason?: string;
};

export type CaptureSessionState = {
  status: CaptureSessionStatus;
  mode: CaptureProtocolV2 | null;
  shootingHand: ShootingHandV2;
  slots: CaptureSessionSlot[];
  sessionGeneration: number;
  profile?: RepresentativePose4DV2;
  confidence?: number;
  savedProfileId?: string;
  errorMessage?: string;
  /** Stable machine-readable recapture reason from the two-view pipeline, never user copy. */
  recaptureReasonCode?: string;
  recoveryStatus?: CaptureSessionRecoveryStatus;
};

export type RetainedNormalizedAttemptsV2 = {
  sessionGeneration: number;
  mode: CaptureProtocolV2;
  shootingHand: ShootingHandV2;
  normalizedAttempts: readonly NormalizedViewAttemptV2[];
};

export function matchingShootingProfileSaveInputV2(
  state: CaptureSessionState,
  retained: RetainedNormalizedAttemptsV2 | null,
): SaveShootingProfileInputV2 | null {
  if (
    state.status !== "result_review"
    || !state.profile
    || state.confidence === undefined
    || state.mode === null
    || retained === null
  ) return null;
  const expectedAttemptsPerView = state.mode === "basic_1_plus_1" ? 1 : 3;
  const frontAttemptCount = retained.normalizedAttempts.filter(
    (attempt) => attempt.frames[0]?.view === "front",
  ).length;
  const sideAttemptCount = retained.normalizedAttempts.filter(
    (attempt) => attempt.frames[0]?.view === "shooting_side",
  ).length;
  if (
    retained.sessionGeneration !== state.sessionGeneration
    || retained.mode !== state.mode
    || retained.shootingHand !== state.shootingHand
    || state.profile.mode !== state.mode
    || retained.normalizedAttempts.length !== expectedAttemptsPerView * 2
    || frontAttemptCount !== expectedAttemptsPerView
    || sideAttemptCount !== expectedAttemptsPerView
  ) return null;
  return {
    profile: state.profile,
    shootingHand: state.shootingHand,
    confidence: state.confidence,
    normalizedAttempts: retained.normalizedAttempts,
  };
}

export type CaptureSaveOperationTokenV2 = {
  token: string;
  sessionGeneration: number;
};

export function admitCaptureSaveOperationV2(
  active: CaptureSaveOperationTokenV2 | null,
  candidate: CaptureSaveOperationTokenV2,
): CaptureSaveOperationTokenV2 | null {
  return active === null ? candidate : null;
}

export function captureSaveOperationMatches(
  active: CaptureSaveOperationTokenV2 | null,
  expected: CaptureSaveOperationTokenV2,
  currentSessionGeneration: number,
): boolean {
  return active?.token === expected.token
    && active.sessionGeneration === expected.sessionGeneration
    && currentSessionGeneration === expected.sessionGeneration;
}

export function clearCaptureSaveOperationIfMatching(
  active: CaptureSaveOperationTokenV2 | null,
  expected: CaptureSaveOperationTokenV2,
): CaptureSaveOperationTokenV2 | null {
  return active?.token === expected.token
    && active.sessionGeneration === expected.sessionGeneration
    ? null
    : active;
}

export type CaptureSaveRunResultV2 = "not_started" | "succeeded" | "failed" | "ignored";

export async function runCaptureSaveOperationV2({
  state,
  retained,
  saveProfile,
  isCurrent,
  onStarted,
  onSucceeded,
  onFailed,
  onFinally,
}: {
  state: CaptureSessionState;
  retained: RetainedNormalizedAttemptsV2 | null;
  saveProfile: (input: SaveShootingProfileInputV2) => Promise<string>;
  isCurrent: () => boolean;
  onStarted: () => void;
  onSucceeded: (profileId: string, sessionGeneration: number) => void;
  onFailed: (sessionGeneration: number) => void;
  onFinally: () => void;
}): Promise<CaptureSaveRunResultV2> {
  const saveInput = matchingShootingProfileSaveInputV2(state, retained);
  if (!saveInput) return "not_started";

  onStarted();
  try {
    let profileId: string;
    try {
      profileId = await saveProfile(saveInput);
    } catch {
      if (!isCurrent()) return "ignored";
      onFailed(state.sessionGeneration);
      return "failed";
    }
    if (!isCurrent()) return "ignored";
    if (!isOpaqueShootingProfileIdV2(profileId)) {
      onFailed(state.sessionGeneration);
      return "failed";
    }
    onSucceeded(profileId, state.sessionGeneration);
    return "succeeded";
  } finally {
    onFinally();
  }
}

export type OwnerBoundDeleteRunResultV2 = "succeeded" | "failed" | "ignored";

export async function runOwnerBoundDeleteOperationV2({
  deleteProfile,
  isCurrent,
  onSucceeded,
  onFailed,
  onFinally,
}: {
  deleteProfile: () => Promise<void>;
  isCurrent: () => boolean;
  onSucceeded: () => void;
  onFailed: () => void;
  onFinally: () => void;
}): Promise<OwnerBoundDeleteRunResultV2> {
  try {
    try {
      await deleteProfile();
    } catch {
      if (!isCurrent()) return "ignored";
      onFailed();
      return "failed";
    }
    if (!isCurrent()) return "ignored";
    onSucceeded();
    return "succeeded";
  } finally {
    onFinally();
  }
}

export type CaptureSessionAction =
  | { type: "SELECT_MODE"; mode: CaptureProtocolV2 }
  | { type: "RETURN_TO_MODE_SELECT" }
  | { type: "SET_SHOOTING_HAND"; shootingHand: ShootingHandV2 }
  | { type: "START_COLLECTION" }
  | {
    type: "SLOT_ACQUIRE_STARTED";
    slotId: string;
    requestId: string;
    generation: number;
    captureSource: CaptureSlotSourceV2;
  }
  | {
    type: "SLOT_PROGRESS";
    slotId: string;
    requestId: string;
    generation: number;
    progress: CaptureProgress;
  }
  | {
    type: "SLOT_ACCEPTED";
    slotId: string;
    requestId: string;
    generation: number;
    sequence: LandmarkSequenceV2;
  }
  | {
    type: "SLOT_REJECTED";
    slotId: string;
    requestId: string;
    generation: number;
    reason: string;
  }
  | {
    type: "SLOT_CANCELLED";
    slotId: string;
    requestId: string;
    generation: number;
  }
  | { type: "RETAKE_SLOT"; slotId: string }
  | { type: "AGGREGATE_STARTED" }
  | {
    type: "AGGREGATE_COMPLETED";
    sessionGeneration: number;
    profile: RepresentativePose4DV2;
    confidence: number;
  }
  | {
    type: "AGGREGATE_RECAPTURE_REQUIRED";
    sessionGeneration: number;
    reason: string;
    reasonCode?: string;
  }
  | { type: "SAVE_STARTED" }
  | { type: "SAVE_SUCCEEDED"; sessionGeneration: number; profileId: string }
  | { type: "SAVE_FAILED"; sessionGeneration: number; reason: string }
  | { type: "SESSION_ERROR"; reason: string; recoverTo?: CaptureSessionRecoveryStatus }
  | { type: "CANCEL_SESSION" }
  | { type: "RETRY_SESSION" };

function initialSlots(mode: CaptureProtocolV2): CaptureSessionSlot[] {
  return buildCapturePlan(mode).map((slot, index) => ({
    ...slot,
    status: "empty" as const,
    enabled: index === 0,
    generation: 0,
  }));
}

export function createCaptureSession(
  mode: CaptureProtocolV2 | null = null,
  shootingHand: ShootingHandV2 = "right",
): CaptureSessionState {
  return {
    status: mode === null ? "mode_select" : "setup",
    mode,
    shootingHand,
    slots: mode === null ? [] : initialSlots(mode),
    sessionGeneration: 0,
  };
}

function clearDerivedSession(state: CaptureSessionState): CaptureSessionState {
  return {
    status: state.status,
    mode: state.mode,
    shootingHand: state.shootingHand,
    slots: state.slots,
    sessionGeneration: state.sessionGeneration,
  };
}

function deriveCollectionState(state: CaptureSessionState): CaptureSessionState {
  const allAccepted = state.slots.length > 0
    && state.slots.every((slot) => slot.status === "accepted");
  const slots = state.slots.map((slot, index, allSlots) => ({
    ...slot,
    enabled: !allAccepted
      && slot.status !== "accepted"
      && allSlots.slice(0, index).every((predecessor) => predecessor.status === "accepted"),
  }));
  return {
    ...clearDerivedSession(state),
    status: allAccepted ? "ready_to_aggregate" : "collecting",
    slots,
  };
}

function resetForSelection(
  state: CaptureSessionState,
  mode: CaptureProtocolV2,
  shootingHand: ShootingHandV2,
): CaptureSessionState {
  return {
    status: "setup",
    mode,
    shootingHand,
    slots: initialSlots(mode),
    sessionGeneration: state.sessionGeneration + 1,
  };
}

function matchingRequest(
  slot: CaptureSessionSlot,
  requestId: string,
  generation: number,
): boolean {
  return slot.requestId === requestId && slot.generation === generation;
}

function updateMatchingSlot(
  state: CaptureSessionState,
  slotId: string,
  requestId: string,
  generation: number,
  update: (slot: CaptureSessionSlot) => CaptureSessionSlot,
): CaptureSessionState {
  const index = state.slots.findIndex((slot) => slot.id === slotId);
  if (index < 0 || !matchingRequest(state.slots[index], requestId, generation)) return state;
  const slots = [...state.slots];
  slots[index] = update(slots[index]);
  return { ...state, slots };
}

function sequenceMatchesSlot(
  state: CaptureSessionState,
  slot: CaptureSessionSlot,
  sequence: LandmarkSequenceV2,
): boolean {
  return sequence.view === slot.view
    && sequence.takeIndex === slot.takeIndex
    && sequence.shootingHand === state.shootingHand;
}

export function captureSessionReducer(
  state: CaptureSessionState,
  action: CaptureSessionAction,
): CaptureSessionState {
  switch (action.type) {
    case "SELECT_MODE":
      return resetForSelection(state, action.mode, state.shootingHand);
    case "RETURN_TO_MODE_SELECT":
      return {
        ...createCaptureSession(null, state.shootingHand),
        sessionGeneration: state.sessionGeneration + 1,
      };
    case "SET_SHOOTING_HAND":
      if (state.shootingHand === action.shootingHand) return state;
      return state.mode === null
        ? { ...createCaptureSession(null, action.shootingHand), sessionGeneration: state.sessionGeneration + 1 }
        : resetForSelection(state, state.mode, action.shootingHand);
    case "START_COLLECTION":
      return state.status === "setup" && state.mode !== null
        ? deriveCollectionState(state)
        : state;
    case "SLOT_ACQUIRE_STARTED": {
      if (state.status !== "collecting") return state;
      const index = state.slots.findIndex((slot) => slot.id === action.slotId);
      const slot = state.slots[index];
      if (!slot?.enabled || action.generation !== slot.generation + 1 || !action.requestId) return state;
      if (action.captureSource !== "camera" && action.captureSource !== "library") return state;
      const slots = [...state.slots];
      slots[index] = {
        ...slot,
        status: "acquiring",
        enabled: true,
        generation: action.generation,
        requestId: action.requestId,
        captureSource: action.captureSource,
        progress: { stage: "metadata", completed: 0, total: 0 },
        sequence: undefined,
        rejectionReason: undefined,
      };
      return clearDerivedSession({ ...state, slots });
    }
    case "SLOT_PROGRESS": {
      const next = updateMatchingSlot(
        state,
        action.slotId,
        action.requestId,
        action.generation,
        (slot) => ({ ...slot, status: "analyzing", progress: action.progress }),
      );
      return state.status === "collecting" ? next : state;
    }
    case "SLOT_ACCEPTED": {
      if (state.status !== "collecting" || !action.sequence.quality.passed) return state;
      const slot = state.slots.find((candidate) => candidate.id === action.slotId);
      if (!slot || !matchingRequest(slot, action.requestId, action.generation)) return state;
      if (!sequenceMatchesSlot(state, slot, action.sequence)) return state;
      const next = updateMatchingSlot(
        state,
        action.slotId,
        action.requestId,
        action.generation,
        (candidate) => ({
          ...candidate,
          status: "accepted",
          enabled: false,
          requestId: undefined,
          progress: { stage: "complete", completed: 1, total: 1 },
          sequence: action.sequence,
          rejectionReason: undefined,
        }),
      );
      return deriveCollectionState(next);
    }
    case "SLOT_REJECTED": {
      if (state.status !== "collecting" || !action.reason.trim()) return state;
      const next = updateMatchingSlot(
        state,
        action.slotId,
        action.requestId,
        action.generation,
        (slot) => ({
          ...slot,
          status: "rejected",
          requestId: undefined,
          progress: undefined,
          sequence: undefined,
          rejectionReason: action.reason,
        }),
      );
      return next === state ? state : deriveCollectionState(next);
    }
    case "SLOT_CANCELLED": {
      if (state.status !== "collecting") return state;
      const next = updateMatchingSlot(
        state,
        action.slotId,
        action.requestId,
        action.generation,
        (slot) => ({
          ...slot,
          status: "cancelled",
          requestId: undefined,
          progress: undefined,
          sequence: undefined,
          rejectionReason: undefined,
        }),
      );
      return next === state ? state : deriveCollectionState(next);
    }
    case "RETAKE_SLOT": {
      const index = state.slots.findIndex((slot) => slot.id === action.slotId);
      if (index < 0 || state.mode === null) return state;
      const target = state.slots[index];
      const collectionRecovery = state.status === "error" && state.recoveryStatus === "collecting";
      const validState = state.status === "collecting"
        || state.status === "ready_to_aggregate"
        || state.status === "result_review"
        || collectionRecovery;
      const validTarget = state.status === "collecting"
        ? target.status !== "empty"
        : state.status === "ready_to_aggregate" || state.status === "result_review"
          ? target.status === "accepted"
          : target.status === "accepted" || target.status === "rejected" || target.status === "cancelled";
      if (!validState || !validTarget) return state;
      const slots = state.slots.map((slot, slotIndex) => slotIndex === index ? {
        ...slot,
        status: "empty" as const,
        enabled: false,
        generation: slot.generation + 1,
        requestId: undefined,
        captureSource: undefined,
        progress: undefined,
        sequence: undefined,
        rejectionReason: undefined,
      } : slot);
      return deriveCollectionState(clearDerivedSession({ ...state, slots }));
    }
    case "AGGREGATE_STARTED":
      return state.status === "ready_to_aggregate"
        ? { ...state, status: "aggregating" }
        : state;
    case "AGGREGATE_COMPLETED":
      if (
        state.status !== "aggregating"
        || action.sessionGeneration !== state.sessionGeneration
        || action.profile.mode !== state.mode
      ) return state;
      return {
        ...state,
        status: "result_review",
        profile: action.profile,
        confidence: action.confidence,
        errorMessage: undefined,
        recoveryStatus: undefined,
      };
    case "AGGREGATE_RECAPTURE_REQUIRED":
      if (state.status !== "aggregating" || action.sessionGeneration !== state.sessionGeneration) return state;
      return {
        ...clearDerivedSession(state),
        status: "error",
        errorMessage: action.reason,
        ...(action.reasonCode === undefined ? {} : { recaptureReasonCode: action.reasonCode }),
        recoveryStatus: "collecting",
      };
    case "SAVE_STARTED":
      return state.status === "result_review" && state.profile !== undefined
        ? { ...state, status: "saving", errorMessage: undefined, recoveryStatus: undefined }
        : state;
    case "SAVE_SUCCEEDED":
      return state.status === "saving"
        && action.sessionGeneration === state.sessionGeneration
        && isOpaqueShootingProfileIdV2(action.profileId)
        ? { ...state, status: "complete", savedProfileId: action.profileId }
        : state;
    case "SAVE_FAILED":
      return state.status === "saving" && action.sessionGeneration === state.sessionGeneration
        ? {
          ...state,
          status: "error",
          errorMessage: action.reason,
          recoveryStatus: "result_review",
        }
        : state;
    case "SESSION_ERROR":
      return {
        ...state,
        status: "error",
        errorMessage: action.reason,
        recoveryStatus: action.recoverTo
          ?? (state.status === "mode_select" ? "mode_select" : state.slots.length ? "collecting" : "setup"),
      };
    case "CANCEL_SESSION": {
      if (state.status === "cancelled") return state;
      const recoveryStatus: CaptureSessionRecoveryStatus = state.status === "error" && state.recoveryStatus
        ? state.recoveryStatus
        : state.status === "mode_select"
          ? "mode_select"
          : state.status === "result_review" || state.status === "saving"
            ? "result_review"
            : state.status === "setup"
              ? "setup"
              : "collecting";
      return {
        ...state,
        status: "cancelled",
        recoveryStatus,
        slots: state.slots.map((slot) => slot.status === "acquiring" || slot.status === "analyzing"
          ? {
            ...slot,
            status: "cancelled",
            enabled: false,
            generation: slot.generation + 1,
            requestId: undefined,
            progress: undefined,
            sequence: undefined,
          }
          : slot),
      };
    }
    case "RETRY_SESSION":
      if ((state.status !== "cancelled" && state.status !== "error") || !state.recoveryStatus) return state;
      if (state.recoveryStatus === "collecting") {
        const next = {
          ...state,
          status: "collecting",
          errorMessage: undefined,
          recoveryStatus: undefined,
        } as CaptureSessionState;
        return state.status === "cancelled" ? deriveCollectionState(next) : next;
      }
      return {
        ...state,
        status: state.recoveryStatus,
        errorMessage: undefined,
        recoveryStatus: undefined,
      };
  }
}
