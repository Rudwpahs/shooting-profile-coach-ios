import type { NormalizedViewAttemptV2 } from "@/lib/shooting-profile/repeated-shot";

const CANONICAL_ANCHOR_COUNT = 5;
const EPSILON = 1e-12;

/**
 * Provisional engineering limits for deciding whether separately recorded
 * front/side shots are similar enough in phase timing to be fused.
 *
 * These are NOT validated biomechanical thresholds. They exist to reject
 * obviously mismatched takes before 3D fusion and must be replaced/versioned
 * after the dedicated FormPath validation study.
 */
export const CROSS_VIEW_PHASE_ALIGNMENT_V1 = Object.freeze({
  version: "cross_view_phase_alignment_v1" as const,
  validationStatus: "provisional_unvalidated_engineering_gate" as const,
  maximumIntermediateAnchorDelta: 0.10,
  maximumPhaseIntervalRmse: 0.08,
});

export type CrossViewPhaseAlignmentReasonV1 =
  | "invalid_attempt_set"
  | "view_mismatch"
  | "shooting_hand_mismatch"
  | "invalid_phase_anchors"
  | "cross_view_phase_mismatch";

export type CrossViewPhaseAlignmentResultV1 =
  | {
    status: "accepted";
    version: typeof CROSS_VIEW_PHASE_ALIGNMENT_V1.version;
    confidence: number;
    maximumIntermediateAnchorDelta: number;
    phaseIntervalRmse: number;
    comparedPairCount: number;
  }
  | {
    status: "rejected";
    version: typeof CROSS_VIEW_PHASE_ALIGNMENT_V1.version;
    reason: CrossViewPhaseAlignmentReasonV1;
    maximumIntermediateAnchorDelta?: number;
    phaseIntervalRmse?: number;
    comparedPairCount: number;
  };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizedAnchorPositions(attempt: NormalizedViewAttemptV2): number[] | undefined {
  if (attempt.phaseAnchors.length !== CANONICAL_ANCHOR_COUNT) return undefined;
  const first = attempt.phaseAnchors[0]?.timestampMs;
  const last = attempt.phaseAnchors.at(-1)?.timestampMs;
  if (!Number.isFinite(first) || !Number.isFinite(last) || last === undefined || first === undefined) {
    return undefined;
  }
  const duration = last - first;
  if (!Number.isFinite(duration) || duration <= 0) return undefined;

  const positions = attempt.phaseAnchors.map((anchor, index) => {
    if (!Number.isFinite(anchor.timestampMs) || !Number.isFinite(anchor.phase)) return Number.NaN;
    if (index > 0 && anchor.timestampMs <= attempt.phaseAnchors[index - 1].timestampMs) {
      return Number.NaN;
    }
    return (anchor.timestampMs - first) / duration;
  });
  if (positions.some((position) => !Number.isFinite(position))) return undefined;
  if (Math.abs(positions[0]) > EPSILON || Math.abs(positions.at(-1)! - 1) > EPSILON) return undefined;
  return positions;
}

function intervalFractions(positions: readonly number[]): number[] {
  return positions.slice(1).map((position, index) => position - positions[index]);
}

function rmse(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY;
  const mse = a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0) / a.length;
  return Math.sqrt(mse);
}

function attemptIdentityIsValid(
  attempt: NormalizedViewAttemptV2,
  expectedView: "front" | "shooting_side",
): boolean {
  if (attempt.frames.length === 0) return false;
  return attempt.frames.every((frame) => frame.view === expectedView);
}

/**
 * Compares the temporal shape of canonical phase anchors across independently
 * recorded front and shooting-side takes. The check intentionally does not
 * compare raw frame timestamps or absolute shot duration; it compares the
 * relative placement of ready/dip/rise/release/follow-through anchors.
 *
 * This is a pre-fusion consistency gate, not proof that two takes represent the
 * same 3D motion. Passing the gate only means their phase timing is not
 * obviously incompatible under the current provisional limits.
 */
export function assessCrossViewPhaseAlignment(
  frontAttempts: readonly NormalizedViewAttemptV2[],
  shootingSideAttempts: readonly NormalizedViewAttemptV2[],
): CrossViewPhaseAlignmentResultV1 {
  if (frontAttempts.length === 0 || shootingSideAttempts.length === 0) {
    return {
      status: "rejected",
      version: CROSS_VIEW_PHASE_ALIGNMENT_V1.version,
      reason: "invalid_attempt_set",
      comparedPairCount: 0,
    };
  }
  if (
    frontAttempts.some((attempt) => !attemptIdentityIsValid(attempt, "front"))
    || shootingSideAttempts.some((attempt) => !attemptIdentityIsValid(attempt, "shooting_side"))
  ) {
    return {
      status: "rejected",
      version: CROSS_VIEW_PHASE_ALIGNMENT_V1.version,
      reason: "view_mismatch",
      comparedPairCount: 0,
    };
  }

  const frontHand = frontAttempts[0].frames[0].shootingHand;
  const sideHand = shootingSideAttempts[0].frames[0].shootingHand;
  if (
    frontAttempts.some((attempt) => attempt.frames[0].shootingHand !== frontHand)
    || shootingSideAttempts.some((attempt) => attempt.frames[0].shootingHand !== sideHand)
    || frontHand !== sideHand
  ) {
    return {
      status: "rejected",
      version: CROSS_VIEW_PHASE_ALIGNMENT_V1.version,
      reason: "shooting_hand_mismatch",
      comparedPairCount: 0,
    };
  }

  let maximumIntermediateAnchorDelta = 0;
  let maximumPhaseIntervalRmse = 0;
  let comparedPairCount = 0;

  for (const front of frontAttempts) {
    const frontPositions = normalizedAnchorPositions(front);
    if (!frontPositions) {
      return {
        status: "rejected",
        version: CROSS_VIEW_PHASE_ALIGNMENT_V1.version,
        reason: "invalid_phase_anchors",
        comparedPairCount,
      };
    }
    const frontIntervals = intervalFractions(frontPositions);
    for (const side of shootingSideAttempts) {
      const sidePositions = normalizedAnchorPositions(side);
      if (!sidePositions) {
        return {
          status: "rejected",
          version: CROSS_VIEW_PHASE_ALIGNMENT_V1.version,
          reason: "invalid_phase_anchors",
          comparedPairCount,
        };
      }
      const intermediateDelta = Math.max(
        ...frontPositions.slice(1, -1).map((position, index) => (
          Math.abs(position - sidePositions[index + 1])
        )),
      );
      const intervalRmse = rmse(frontIntervals, intervalFractions(sidePositions));
      maximumIntermediateAnchorDelta = Math.max(maximumIntermediateAnchorDelta, intermediateDelta);
      maximumPhaseIntervalRmse = Math.max(maximumPhaseIntervalRmse, intervalRmse);
      comparedPairCount += 1;
    }
  }

  const passes = maximumIntermediateAnchorDelta
      <= CROSS_VIEW_PHASE_ALIGNMENT_V1.maximumIntermediateAnchorDelta
    && maximumPhaseIntervalRmse <= CROSS_VIEW_PHASE_ALIGNMENT_V1.maximumPhaseIntervalRmse;
  if (!passes) {
    return {
      status: "rejected",
      version: CROSS_VIEW_PHASE_ALIGNMENT_V1.version,
      reason: "cross_view_phase_mismatch",
      maximumIntermediateAnchorDelta,
      phaseIntervalRmse: maximumPhaseIntervalRmse,
      comparedPairCount,
    };
  }

  const normalizedAnchorPenalty = maximumIntermediateAnchorDelta
    / CROSS_VIEW_PHASE_ALIGNMENT_V1.maximumIntermediateAnchorDelta;
  const normalizedIntervalPenalty = maximumPhaseIntervalRmse
    / CROSS_VIEW_PHASE_ALIGNMENT_V1.maximumPhaseIntervalRmse;
  return {
    status: "accepted",
    version: CROSS_VIEW_PHASE_ALIGNMENT_V1.version,
    confidence: clamp(1 - 0.5 * normalizedAnchorPenalty - 0.5 * normalizedIntervalPenalty, 0, 1),
    maximumIntermediateAnchorDelta,
    phaseIntervalRmse: maximumPhaseIntervalRmse,
    comparedPairCount,
  };
}
