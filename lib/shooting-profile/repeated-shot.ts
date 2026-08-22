import type { SourceObservation2DV2 } from "@/lib/shooting-profile/coordinate-space";
import {
  PRODUCTION_PHASE_SAMPLE_COUNT,
  type PhaseSampleFrameV2,
  type ShotPhaseAnchorV2,
} from "@/lib/shooting-profile/phase-normalization";
import type { CaptureViewV2, ShootingHandV2 } from "@/lib/shooting-profile/types";

const PHASE_GRID_TOLERANCE = 1e-12;
const CANONICAL_ANCHOR_IDS = ["ready", "deepestDip", "rise", "releaseProxy", "followThrough"] as const;
const CANONICAL_ANCHOR_PHASES = [0, 0.25, 0.5, 0.75, 1] as const;

export type RequiredProjectedBoneV1 = {
  id: string;
  proximalLandmarkIndex: number;
  distalLandmarkIndex: number;
};

export type RepeatedShotConsensusConfigV1 = {
  version: "repeated_shot_consensus_v1";
  requiredBones: readonly RequiredProjectedBoneV1[];
  evaluationPhaseIndices: readonly number[];
  maxAngularDistanceRadians: number;
  maxNormalizedPhaseAnchorDelta: number;
  minimumLandmarkVisibility: number;
  minimumProjectedBoneLength: number;
};

const REQUIRED_BONES_V1 = Object.freeze([
  { id: "shoulder_line", proximalLandmarkIndex: 11, distalLandmarkIndex: 12 },
  { id: "left_upper_arm", proximalLandmarkIndex: 11, distalLandmarkIndex: 13 },
  { id: "left_forearm", proximalLandmarkIndex: 13, distalLandmarkIndex: 15 },
  { id: "right_upper_arm", proximalLandmarkIndex: 12, distalLandmarkIndex: 14 },
  { id: "right_forearm", proximalLandmarkIndex: 14, distalLandmarkIndex: 16 },
  { id: "hip_line", proximalLandmarkIndex: 23, distalLandmarkIndex: 24 },
  { id: "left_torso", proximalLandmarkIndex: 23, distalLandmarkIndex: 11 },
  { id: "right_torso", proximalLandmarkIndex: 24, distalLandmarkIndex: 12 },
  { id: "left_thigh", proximalLandmarkIndex: 23, distalLandmarkIndex: 25 },
  { id: "left_shin", proximalLandmarkIndex: 25, distalLandmarkIndex: 27 },
  { id: "right_thigh", proximalLandmarkIndex: 24, distalLandmarkIndex: 26 },
  { id: "right_shin", proximalLandmarkIndex: 26, distalLandmarkIndex: 28 },
] satisfies readonly RequiredProjectedBoneV1[]);

/**
 * Versioned complete-view consensus limits. Passing pairs are ranked by the
 * median angular distance across every required bone/evaluation phase; anchor
 * timing and availability are complete-pair gates rather than score terms.
 */
export const CONSENSUS_V1: RepeatedShotConsensusConfigV1 = Object.freeze({
  version: "repeated_shot_consensus_v1",
  requiredBones: REQUIRED_BONES_V1,
  evaluationPhaseIndices: Object.freeze([0, 25, 50, 75, 100]),
  maxAngularDistanceRadians: 8 * Math.PI / 180,
  maxNormalizedPhaseAnchorDelta: 0.08,
  minimumLandmarkVisibility: 0.5,
  minimumProjectedBoneLength: 1e-6,
});

export type NormalizedViewAttemptV2 = {
  id: string;
  phaseAnchors: readonly ShotPhaseAnchorV2[];
  frames: readonly PhaseSampleFrameV2[];
};

export type AttemptEvidenceV1 = "single_take" | "multi_take_consensus";

export type AgreeingAttemptSelection =
  | {
    status: "accepted";
    evidence: AttemptEvidenceV1;
    attemptIds: readonly string[];
    medoidAttemptId: string;
    robustScore: number;
  }
  | { status: "recapture_required"; reason: "no_complete_agreeing_subset" };

export type AggregatedPhaseSampleFrameV1 = {
  phase: number;
  view: CaptureViewV2;
  shootingHand: ShootingHandV2;
  sourceLandmarks: readonly SourceObservation2DV2[];
};

export type AggregatedViewAttemptsResult =
  | {
    status: "accepted";
    evidence: AttemptEvidenceV1;
    attemptIds: readonly string[];
    medoidAttemptId: string;
    robustScore: number;
    view: CaptureViewV2;
    shootingHand: ShootingHandV2;
    frames: readonly AggregatedPhaseSampleFrameV1[];
  }
  | { status: "recapture_required"; reason: "no_complete_agreeing_subset" };

type ValidatedAttemptSet = {
  attempts: NormalizedViewAttemptV2[];
  view: CaptureViewV2;
  shootingHand: ShootingHandV2;
};

type PairMetrics = { passes: boolean; robustScore: number };

function stableStringCompare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite`);
  }
}

function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("cannot take the median of an empty set");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function validateConfig(config: RepeatedShotConsensusConfigV1): void {
  if (config.version !== "repeated_shot_consensus_v1") {
    throw new Error("unsupported repeated-shot consensus version");
  }
  if (config.requiredBones.length === 0) {
    throw new Error("at least one required bone is required");
  }
  const boneIds = new Set<string>();
  config.requiredBones.forEach((bone) => {
    if (!bone.id || boneIds.has(bone.id)) throw new Error("required bone IDs must be unique and nonempty");
    boneIds.add(bone.id);
    if (
      !Number.isInteger(bone.proximalLandmarkIndex)
      || bone.proximalLandmarkIndex < 0
      || !Number.isInteger(bone.distalLandmarkIndex)
      || bone.distalLandmarkIndex < 0
      || bone.proximalLandmarkIndex === bone.distalLandmarkIndex
    ) {
      throw new Error("required bone landmark indices must be distinct nonnegative integers");
    }
  });
  if (config.evaluationPhaseIndices.length === 0 || new Set(config.evaluationPhaseIndices).size !== config.evaluationPhaseIndices.length) {
    throw new Error("evaluation phase indices must be unique and nonempty");
  }
  config.evaluationPhaseIndices.forEach((index) => {
    if (!Number.isInteger(index) || index < 0 || index >= PRODUCTION_PHASE_SAMPLE_COUNT) {
      throw new Error("evaluation phase indices must address the 101-sample production grid");
    }
  });
  [
    config.maxAngularDistanceRadians,
    config.maxNormalizedPhaseAnchorDelta,
    config.minimumLandmarkVisibility,
    config.minimumProjectedBoneLength,
  ].forEach((value, index) => requireFinite(value, `consensus limit ${index}`));
  if (
    config.maxAngularDistanceRadians <= 0
    || config.maxAngularDistanceRadians > Math.PI
    || config.maxNormalizedPhaseAnchorDelta < 0
    || config.minimumLandmarkVisibility < 0
    || config.minimumLandmarkVisibility > 1
    || config.minimumProjectedBoneLength <= 0
  ) {
    throw new Error("repeated-shot consensus limits are outside their valid ranges");
  }
}

function validateAnchors(anchors: readonly ShotPhaseAnchorV2[], attemptId: string): void {
  if (anchors.length !== CANONICAL_ANCHOR_IDS.length) {
    throw new Error(`attempt ${attemptId} must contain all five phase anchors`);
  }
  anchors.forEach((anchor, index) => {
    requireFinite(anchor.timestampMs, `attempt ${attemptId} anchor ${index} timestampMs`);
    requireFinite(anchor.phase, `attempt ${attemptId} anchor ${index} phase`);
    if (
      anchor.id !== CANONICAL_ANCHOR_IDS[index]
      || Math.abs(anchor.phase - CANONICAL_ANCHOR_PHASES[index]) > PHASE_GRID_TOLERANCE
    ) {
      throw new Error(`attempt ${attemptId} phase anchors must be canonical and ordered`);
    }
    if (index > 0 && anchor.timestampMs <= anchors[index - 1].timestampMs) {
      throw new Error(`attempt ${attemptId} phase anchor timestamps must be strictly ordered`);
    }
  });
}

function validateAttempt(
  attempt: NormalizedViewAttemptV2,
  config: RepeatedShotConsensusConfigV1,
  expectedLandmarkCount?: number,
): number {
  if (!attempt.id) throw new Error("attempt IDs must be nonempty");
  if (attempt.frames.length !== PRODUCTION_PHASE_SAMPLE_COUNT) {
    throw new Error("each attempt must contain exactly 101 phase samples");
  }
  validateAnchors(attempt.phaseAnchors, attempt.id);
  const firstFrame = attempt.frames[0];
  const landmarkCount = firstFrame.sourceLandmarks.length;
  if (landmarkCount === 0 || (expectedLandmarkCount !== undefined && landmarkCount !== expectedLandmarkCount)) {
    throw new Error("all attempts must use one consistent nonempty landmark layout");
  }
  attempt.frames.forEach((frame, frameIndex) => {
    requireFinite(frame.phase, `attempt ${attempt.id} frame ${frameIndex} phase`);
    requireFinite(frame.sourceTimestampMs, `attempt ${attempt.id} frame ${frameIndex} sourceTimestampMs`);
    if (Math.abs(frame.phase - frameIndex / 100) > PHASE_GRID_TOLERANCE) {
      throw new Error(`attempt ${attempt.id} must use the ordered 101-sample phase grid`);
    }
    if (frame.view !== "front" && frame.view !== "shooting_side") {
      throw new Error(`attempt ${attempt.id} frame view must be front or shooting_side`);
    }
    if (frame.shootingHand !== "left" && frame.shootingHand !== "right") {
      throw new Error(`attempt ${attempt.id} frame shooting hand must be left or right`);
    }
    if (frame.takeIndex !== 0 && frame.takeIndex !== 1 && frame.takeIndex !== 2) {
      throw new Error(`attempt ${attempt.id} frame take index must be 0, 1, or 2`);
    }
    if (
      frame.view !== firstFrame.view
      || frame.shootingHand !== firstFrame.shootingHand
      || frame.takeIndex !== firstFrame.takeIndex
    ) {
      throw new Error(`attempt ${attempt.id} frame view, hand, and take identity must be consistent`);
    }
    if (frame.sourceLandmarks.length !== landmarkCount) {
      throw new Error(`attempt ${attempt.id} landmark count must remain consistent`);
    }
    frame.sourceLandmarks.forEach((point, landmarkIndex) => {
      if (!point) throw new Error(`attempt ${attempt.id} is missing landmark ${landmarkIndex}`);
      if (
        point.visibility !== undefined
        && (!Number.isFinite(point.visibility) || point.visibility < 0 || point.visibility > 1)
      ) {
        throw new Error(`attempt ${attempt.id} landmark ${landmarkIndex} visibility must be finite in [0, 1]`);
      }
    });
    config.requiredBones.forEach((bone) => {
      const proximal = frame.sourceLandmarks[bone.proximalLandmarkIndex];
      const distal = frame.sourceLandmarks[bone.distalLandmarkIndex];
      if (!proximal || !distal) {
        throw new Error(`attempt ${attempt.id} is missing required bone ${bone.id}`);
      }
    });
  });
  return landmarkCount;
}

function attemptMeetsDataLimits(
  attempt: NormalizedViewAttemptV2,
  config: RepeatedShotConsensusConfigV1,
): boolean {
  return attempt.frames.every((frame) => {
    if (frame.sourceLandmarks.some((point) => (
      !Number.isFinite(point.x)
      || !Number.isFinite(point.y)
      || (point.visibility !== undefined && !Number.isFinite(point.visibility))
    ))) {
      return false;
    }
    return config.requiredBones.every((bone) => {
      const proximal = frame.sourceLandmarks[bone.proximalLandmarkIndex];
      const distal = frame.sourceLandmarks[bone.distalLandmarkIndex];
      return proximal.visibility !== undefined
        && distal.visibility !== undefined
        && proximal.visibility >= config.minimumLandmarkVisibility
        && distal.visibility >= config.minimumLandmarkVisibility
        && Math.hypot(distal.x - proximal.x, distal.y - proximal.y) >= config.minimumProjectedBoneLength;
    });
  });
}

function validateAttemptSet(
  attempts: readonly NormalizedViewAttemptV2[],
  config: RepeatedShotConsensusConfigV1,
): ValidatedAttemptSet {
  validateConfig(config);
  if (attempts.length !== 1 && attempts.length !== 3) {
    throw new Error("repeated-shot consensus requires exactly one or three attempts");
  }
  const sorted = [...attempts].sort((a, b) => stableStringCompare(a.id, b.id));
  if (new Set(sorted.map((attempt) => attempt.id)).size !== sorted.length) {
    throw new Error("attempt IDs must be unique");
  }
  let landmarkCount: number | undefined;
  sorted.forEach((attempt) => {
    landmarkCount = validateAttempt(attempt, config, landmarkCount);
  });
  if (sorted.length === 1 && sorted[0].frames[0].takeIndex !== 0) {
    throw new Error("Basic consensus requires take index 0");
  }
  if (sorted.length === 3) {
    const takeIndices = new Set(sorted.map((attempt) => attempt.frames[0].takeIndex));
    if (takeIndices.size !== 3 || !takeIndices.has(0) || !takeIndices.has(1) || !takeIndices.has(2)) {
      throw new Error("High-accuracy consensus requires distinct take indices 0, 1, 2");
    }
  }
  const view = sorted[0].frames[0].view;
  const shootingHand = sorted[0].frames[0].shootingHand;
  sorted.forEach((attempt) => {
    if (attempt.frames[0].view !== view) {
      throw new Error("all repeated-shot attempts must use the same view");
    }
    if (attempt.frames[0].shootingHand !== shootingHand) {
      throw new Error("all repeated-shot attempts must use the same shooting hand");
    }
  });
  return { attempts: sorted, view, shootingHand };
}

function normalizedAnchorPositions(attempt: NormalizedViewAttemptV2): number[] {
  const first = attempt.phaseAnchors[0].timestampMs;
  const duration = attempt.phaseAnchors[attempt.phaseAnchors.length - 1].timestampMs - first;
  return attempt.phaseAnchors.map((anchor) => (anchor.timestampMs - first) / duration);
}

function projectedBone(
  attempt: NormalizedViewAttemptV2,
  frameIndex: number,
  bone: RequiredProjectedBoneV1,
): { x: number; y: number } {
  const frame = attempt.frames[frameIndex];
  const proximal = frame.sourceLandmarks[bone.proximalLandmarkIndex];
  const distal = frame.sourceLandmarks[bone.distalLandmarkIndex];
  const x = distal.x - proximal.x;
  const y = distal.y - proximal.y;
  const magnitude = Math.hypot(x, y);
  return { x: x / magnitude, y: y / magnitude };
}

function angleBetweenProjectedBones(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const crossMagnitude = Math.abs(a.x * b.y - a.y * b.x);
  const clampedDot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
  return Math.atan2(crossMagnitude, clampedDot);
}

function measurePair(
  a: NormalizedViewAttemptV2,
  b: NormalizedViewAttemptV2,
  config: RepeatedShotConsensusConfigV1,
): PairMetrics {
  if (!attemptMeetsDataLimits(a, config) || !attemptMeetsDataLimits(b, config)) {
    return { passes: false, robustScore: Number.POSITIVE_INFINITY };
  }
  const anchorA = normalizedAnchorPositions(a);
  const anchorB = normalizedAnchorPositions(b);
  if (anchorA.some((position, index) => (
    Math.abs(position - anchorB[index]) > config.maxNormalizedPhaseAnchorDelta
  ))) {
    return { passes: false, robustScore: Number.POSITIVE_INFINITY };
  }
  const distances: number[] = [];
  for (const frameIndex of config.evaluationPhaseIndices) {
    for (const bone of config.requiredBones) {
      const distance = angleBetweenProjectedBones(
        projectedBone(a, frameIndex, bone),
        projectedBone(b, frameIndex, bone),
      );
      if (distance > config.maxAngularDistanceRadians) {
        return { passes: false, robustScore: Number.POSITIVE_INFINITY };
      }
      distances.push(distance);
    }
  }
  return { passes: true, robustScore: median(distances) };
}

export function selectAgreeingAttemptSubset(
  attempts: readonly NormalizedViewAttemptV2[],
  config: RepeatedShotConsensusConfigV1 = CONSENSUS_V1,
): AgreeingAttemptSelection {
  const validated = validateAttemptSet(attempts, config);
  if (validated.attempts.length === 1) {
    const attemptId = validated.attempts[0].id;
    if (!attemptMeetsDataLimits(validated.attempts[0], config)) {
      return { status: "recapture_required", reason: "no_complete_agreeing_subset" };
    }
    return Object.freeze({
      status: "accepted" as const,
      evidence: "single_take" as const,
      attemptIds: Object.freeze([attemptId]),
      medoidAttemptId: attemptId,
      robustScore: 0,
    });
  }

  const candidates: Array<{
    first: NormalizedViewAttemptV2;
    second: NormalizedViewAttemptV2;
    robustScore: number;
  }> = [];
  for (let firstIndex = 0; firstIndex < validated.attempts.length - 1; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < validated.attempts.length; secondIndex += 1) {
      const first = validated.attempts[firstIndex];
      const second = validated.attempts[secondIndex];
      const metrics = measurePair(first, second, config);
      if (metrics.passes) candidates.push({ first, second, robustScore: metrics.robustScore });
    }
  }
  candidates.sort((a, b) => {
    if (a.robustScore !== b.robustScore) return a.robustScore - b.robustScore;
    const firstComparison = stableStringCompare(a.first.id, b.first.id);
    return firstComparison || stableStringCompare(a.second.id, b.second.id);
  });
  const selectedPair = candidates[0];
  if (!selectedPair) {
    return { status: "recapture_required", reason: "no_complete_agreeing_subset" };
  }

  const medoid = selectedPair.first;
  const chosen = [selectedPair.first, selectedPair.second];
  const third = validated.attempts.find((attempt) => !chosen.includes(attempt));
  if (third && measurePair(medoid, third, config).passes) chosen.push(third);
  const attemptIds = Object.freeze(chosen.map((attempt) => attempt.id).sort(stableStringCompare));
  return Object.freeze({
    status: "accepted" as const,
    evidence: "multi_take_consensus" as const,
    attemptIds,
    medoidAttemptId: medoid.id,
    robustScore: selectedPair.robustScore,
  });
}

function aggregateLandmark(points: readonly SourceObservation2DV2[]): SourceObservation2DV2 {
  const visibilities = points
    .map((point) => point.visibility)
    .filter((visibility): visibility is number => visibility !== undefined);
  const aggregated: SourceObservation2DV2 = {
    x: median(points.map((point) => point.x)),
    y: median(points.map((point) => point.y)),
  };
  if (visibilities.length > 0) aggregated.visibility = median(visibilities);
  return aggregated;
}

export function aggregateViewAttempts(
  attempts: readonly NormalizedViewAttemptV2[],
  config: RepeatedShotConsensusConfigV1 = CONSENSUS_V1,
): AggregatedViewAttemptsResult {
  const selection = selectAgreeingAttemptSubset(attempts, config);
  if (selection.status === "recapture_required") return selection;

  const chosenIds = new Set(selection.attemptIds);
  const chosen = [...attempts]
    .filter((attempt) => chosenIds.has(attempt.id))
    .sort((a, b) => stableStringCompare(a.id, b.id));
  const firstFrame = chosen[0].frames[0];
  const frames = Object.freeze(Array.from({ length: PRODUCTION_PHASE_SAMPLE_COUNT }, (_, frameIndex) => {
    const frame = chosen[0].frames[frameIndex];
    const sourceLandmarks = Object.freeze(frame.sourceLandmarks.map((_, landmarkIndex) => (
      aggregateLandmark(chosen.map((attempt) => attempt.frames[frameIndex].sourceLandmarks[landmarkIndex]))
    )));
    return Object.freeze({
      phase: frame.phase,
      view: firstFrame.view,
      shootingHand: firstFrame.shootingHand,
      sourceLandmarks,
    });
  }));
  return Object.freeze({
    ...selection,
    view: firstFrame.view,
    shootingHand: firstFrame.shootingHand,
    frames,
  });
}
