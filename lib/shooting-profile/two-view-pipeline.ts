import {
  validateShootingProfileWriteV2,
  type SaveShootingProfileInputV2,
} from "@/lib/firebase-shooting-profile-contract";
import type { CrossViewPhaseAlignmentResultV1 } from "@/lib/shooting-profile/cross-view-alignment";
import {
  assessNormalizedCrossViewGeometry,
  type CrossViewGeometryReasonV1,
  type CrossViewGeometryResultV1,
} from "@/lib/shooting-profile/cross-view-geometry";
import {
  detectPhaseAnchors,
  PhaseDetectionError,
  resampleAttemptToPhaseGrid,
  type PhaseDetectionErrorReasonV1,
} from "@/lib/shooting-profile/phase-normalization";
import type { NormalizedViewAttemptV2 } from "@/lib/shooting-profile/repeated-shot";
import {
  buildRepresentativeSequence,
  type RepresentativeSequenceRecaptureReasonV1,
  type RepresentativeSequenceResultV1,
} from "@/lib/shooting-profile/representative-sequence";
import type {
  CaptureProtocolV2,
  CaptureViewV2,
  LandmarkSequenceV2,
  ShootingHandV2,
} from "@/lib/shooting-profile/types";

/** One validated on-device clip analysis, keyed by its capture slot id. */
export type TwoViewPipelineAttemptV1 = Readonly<{
  id: string;
  sequence: LandmarkSequenceV2;
}>;

export type TwoViewPipelineInputV1 = Readonly<{
  mode: CaptureProtocolV2;
  shootingHand: ShootingHandV2;
  attempts: readonly TwoViewPipelineAttemptV1[];
}>;

export type TwoViewPipelineRecaptureReasonV1 =
  | RepresentativeSequenceRecaptureReasonV1
  | Exclude<CrossViewGeometryReasonV1, "insufficient_view_evidence">
  | "attempt_set_invalid"
  | "phase_detection_failed"
  | "phase_normalization_failed"
  | "persistence_contract_violation";

type CompleteSequenceResult = Extract<RepresentativeSequenceResultV1, { status: "complete" }>;

export type TwoViewPipelineResultV1 =
  | Readonly<{
    status: "complete";
    /** Exactly what `saveShootingProfileV2` accepts, already validated by the cloud contract. */
    saveInput: SaveShootingProfileInputV2;
    profile: CompleteSequenceResult["profile"];
    confidence: number;
    normalizedAttempts: readonly NormalizedViewAttemptV2[];
    selectedAttemptsByView: CompleteSequenceResult["selectedAttemptsByView"];
    crossViewGeometry: CrossViewGeometryResultV1;
    crossViewAlignment: CompleteSequenceResult["crossViewAlignment"];
    evidenceSummary: CompleteSequenceResult["evidenceSummary"];
    /** Detected anchor positions as fractions of each take's ready->follow-through span. */
    normalizedAnchorPositionsByAttempt: Readonly<Record<string, readonly number[]>>;
  }>
  | Readonly<{
    status: "recapture_required";
    reason: TwoViewPipelineRecaptureReasonV1;
    /** Stable sub-reason such as a `PhaseDetectionErrorReasonV1`; never user copy or media identity. */
    detail?: PhaseDetectionErrorReasonV1 | string;
    affectedAttemptIds: readonly string[];
    affectedBones: readonly string[];
    crossViewGeometry?: CrossViewGeometryResultV1;
    crossViewAlignment?: CrossViewPhaseAlignmentResultV1;
  }>;

function recapture(
  reason: TwoViewPipelineRecaptureReasonV1,
  affectedAttemptIds: readonly string[],
  options: {
    detail?: string;
    affectedBones?: readonly string[];
    crossViewGeometry?: CrossViewGeometryResultV1;
    crossViewAlignment?: CrossViewPhaseAlignmentResultV1;
  } = {},
): TwoViewPipelineResultV1 {
  return Object.freeze({
    status: "recapture_required" as const,
    reason,
    ...(options.detail === undefined ? {} : { detail: options.detail }),
    affectedAttemptIds: Object.freeze([...affectedAttemptIds]),
    affectedBones: Object.freeze([...(options.affectedBones ?? [])]),
    ...(options.crossViewGeometry === undefined ? {} : { crossViewGeometry: options.crossViewGeometry }),
    ...(options.crossViewAlignment === undefined ? {} : { crossViewAlignment: options.crossViewAlignment }),
  });
}

function attemptsPerView(mode: CaptureProtocolV2): number {
  return mode === "basic_1_plus_1" ? 1 : 3;
}

function invalidAttemptIds(input: TwoViewPipelineInputV1): string[] {
  const required = attemptsPerView(input.mode);
  const seenIds = new Set<string>();
  const seenIdentity = new Set<string>();
  const invalid = new Set<string>();
  const countByView: Record<CaptureViewV2, number> = { front: 0, shooting_side: 0 };
  input.attempts.forEach((attempt) => {
    const { id, sequence } = attempt;
    const identity = `${sequence.view}:${sequence.takeIndex}`;
    if (
      typeof id !== "string"
      || id.length === 0
      || seenIds.has(id)
      || seenIdentity.has(identity)
      || sequence.version !== 2
      || (sequence.view !== "front" && sequence.view !== "shooting_side")
      || sequence.shootingHand !== input.shootingHand
      || !Number.isInteger(sequence.takeIndex)
      || sequence.takeIndex < 0
      || sequence.takeIndex >= required
      || sequence.quality.passed !== true
      || sequence.quality.reasons.length !== 0
    ) {
      invalid.add(id);
    }
    seenIds.add(id);
    seenIdentity.add(identity);
    if (sequence.view === "front" || sequence.view === "shooting_side") {
      countByView[sequence.view] += 1;
    }
  });
  if (
    input.attempts.length !== required * 2
    || countByView.front !== required
    || countByView.shooting_side !== required
  ) {
    input.attempts.forEach((attempt) => invalid.add(attempt.id));
  }
  return [...invalid];
}

function normalizedAnchorPositions(attempt: NormalizedViewAttemptV2): readonly number[] {
  const first = attempt.phaseAnchors[0].timestampMs;
  const duration = attempt.phaseAnchors[attempt.phaseAnchors.length - 1].timestampMs - first;
  return Object.freeze(attempt.phaseAnchors.map((anchor) => (anchor.timestampMs - first) / duration));
}

/**
 * Thin application boundary for the representative two-view estimate.
 *
 * Consumes the validated, on-device `LandmarkSequenceV2` results of one front
 * and one shooting-side clip (Basic) or three of each (High), runs the
 * existing phase normalization, cross-view geometry admission, per-view
 * consensus, cross-view alignment gate, two-view direction reconstruction,
 * forward kinematics, uncertainty and admission gates, and returns either the exact persistence envelope the
 * V2 cloud contract accepts or a typed recapture with no partial output.
 *
 * The result remains `representative_phase_fused_4d_estimate_not_actual_3d`;
 * nothing here calibrates, synchronizes, or triangulates the two clips.
 */
export function buildTwoViewRepresentativeProfile(
  input: TwoViewPipelineInputV1,
): TwoViewPipelineResultV1 {
  if (
    (input.mode !== "basic_1_plus_1" && input.mode !== "high_accuracy_3_plus_3")
    || (input.shootingHand !== "left" && input.shootingHand !== "right")
    || !Array.isArray(input.attempts)
  ) {
    return recapture("attempt_set_invalid", []);
  }
  const invalid = invalidAttemptIds(input);
  if (invalid.length > 0) return recapture("attempt_set_invalid", invalid);

  const normalizedAttempts: NormalizedViewAttemptV2[] = [];
  for (const attempt of input.attempts) {
    let phaseAnchors: NormalizedViewAttemptV2["phaseAnchors"];
    try {
      phaseAnchors = detectPhaseAnchors(attempt.sequence);
    } catch (error) {
      return recapture("phase_detection_failed", [attempt.id], {
        detail: error instanceof PhaseDetectionError ? error.reason : "invalid_phase_observation",
      });
    }
    try {
      normalizedAttempts.push({
        id: attempt.id,
        phaseAnchors,
        frames: resampleAttemptToPhaseGrid(attempt.sequence, phaseAnchors),
      });
    } catch {
      return recapture("phase_normalization_failed", [attempt.id]);
    }
  }

  // Two views that are the same projection (a relabelled or mirrored clip, or
  // the same angle filmed twice) must never be fused: the solver would return a
  // confident profile with no depth evidence behind it. Only a positively
  // identified duplicate or mirror blocks; when the gate cannot measure a view
  // the downstream consensus and alignment reasons are more precise.
  const crossViewGeometry = assessNormalizedCrossViewGeometry(normalizedAttempts);
  if (crossViewGeometry.status === "rejected" && crossViewGeometry.reason !== "insufficient_view_evidence") {
    return recapture(crossViewGeometry.reason, normalizedAttempts.map((attempt) => attempt.id), {
      crossViewGeometry,
    });
  }

  const frontAttempts = normalizedAttempts.filter((attempt) => attempt.frames[0]?.view === "front");
  const shootingSideAttempts = normalizedAttempts.filter((attempt) => (
    attempt.frames[0]?.view === "shooting_side"
  ));
  const result = buildRepresentativeSequence({
    mode: input.mode,
    frontAttempts,
    shootingSideAttempts,
    rootMotion: { status: "unavailable" },
  });
  if (result.status !== "complete") {
    return recapture(result.reason, normalizedAttempts.map((attempt) => attempt.id), {
      affectedBones: result.affectedBones,
      crossViewGeometry,
      crossViewAlignment: result.crossViewAlignment,
    });
  }

  let saveInput: SaveShootingProfileInputV2;
  try {
    saveInput = validateShootingProfileWriteV2({
      profile: result.profile,
      shootingHand: input.shootingHand,
      confidence: result.confidence,
      normalizedAttempts,
    });
  } catch (error) {
    return recapture("persistence_contract_violation", normalizedAttempts.map((attempt) => attempt.id), {
      detail: error instanceof Error ? error.message : "unknown",
      crossViewGeometry,
      crossViewAlignment: result.crossViewAlignment,
    });
  }

  return Object.freeze({
    status: "complete" as const,
    saveInput,
    profile: result.profile,
    confidence: result.confidence,
    normalizedAttempts: Object.freeze(normalizedAttempts),
    selectedAttemptsByView: result.selectedAttemptsByView,
    crossViewGeometry,
    crossViewAlignment: result.crossViewAlignment,
    evidenceSummary: result.evidenceSummary,
    normalizedAnchorPositionsByAttempt: Object.freeze(Object.fromEntries(
      normalizedAttempts.map((attempt) => [attempt.id, normalizedAnchorPositions(attempt)]),
    )),
  });
}
