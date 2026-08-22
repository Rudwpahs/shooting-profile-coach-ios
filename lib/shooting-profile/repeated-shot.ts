import {
  PRODUCTION_PHASE_SAMPLE_COUNT,
  type PhaseSampleFrameV2,
  type ShotPhaseAnchorV2,
} from "@/lib/shooting-profile/phase-normalization";
import type { CaptureViewV2, ShootingHandV2 } from "@/lib/shooting-profile/types";

const PHASE_GRID_TOLERANCE = 1e-12;
const SCORE_TIE_TOLERANCE = 1e-12;
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
  maximumRetainedAngularSpreadRadians: number;
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
  evaluationPhaseIndices: Object.freeze(Array.from(
    { length: PRODUCTION_PHASE_SAMPLE_COUNT },
    (_, index) => index,
  )),
  maxAngularDistanceRadians: 8 * Math.PI / 180,
  maxNormalizedPhaseAnchorDelta: 0.08,
  minimumLandmarkVisibility: 0.5,
  minimumProjectedBoneLength: 1e-6,
  maximumRetainedAngularSpreadRadians: 12 * Math.PI / 180,
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

export type AggregatedProjectedBoneV1 = {
  direction: Readonly<{ x: number; y: number }>;
  projectedLength: number;
  availability: number;
  angularMadRadians: number;
  retainedSpreadRadians: number;
  medoidAttemptId: string;
  supportAttemptIds: readonly string[];
};

export type AggregatedPhaseSampleFrameV1 = {
  phase: number;
  view: CaptureViewV2;
  shootingHand: ShootingHandV2;
  bones: Readonly<Record<string, AggregatedProjectedBoneV1>>;
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
    consensusDispersionRadians: number;
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

function compareScores(a: number, b: number): number {
  const difference = a - b;
  return Math.abs(difference) <= SCORE_TIE_TOLERANCE ? 0 : difference;
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
  if (
    config.evaluationPhaseIndices.length !== PRODUCTION_PHASE_SAMPLE_COUNT
    || new Set(config.evaluationPhaseIndices).size !== PRODUCTION_PHASE_SAMPLE_COUNT
    || config.evaluationPhaseIndices.some((index, position) => index !== position)
  ) {
    throw new Error("consensus V1 must evaluate all 101 ordered phase samples");
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
    config.maximumRetainedAngularSpreadRadians,
  ].forEach((value, index) => requireFinite(value, `consensus limit ${index}`));
  if (
    config.maxAngularDistanceRadians <= 0
    || config.maxAngularDistanceRadians > Math.PI
    || config.maxNormalizedPhaseAnchorDelta < 0
    || config.minimumLandmarkVisibility < 0
    || config.minimumLandmarkVisibility > 1
    || config.minimumProjectedBoneLength <= 0
    || config.maximumRetainedAngularSpreadRadians <= 0
    || config.maximumRetainedAngularSpreadRadians > Math.PI
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
): {
  direction: { x: number; y: number };
  length: number;
  availability: number;
  confidenceWeight: number;
} {
  const frame = attempt.frames[frameIndex];
  const proximal = frame.sourceLandmarks[bone.proximalLandmarkIndex];
  const distal = frame.sourceLandmarks[bone.distalLandmarkIndex];
  const x = distal.x - proximal.x;
  const y = distal.y - proximal.y;
  const magnitude = Math.hypot(x, y);
  const proximalVisibility = proximal.visibility ?? 0;
  const distalVisibility = distal.visibility ?? 0;
  return {
    direction: { x: x / magnitude, y: y / magnitude },
    length: magnitude,
    availability: Math.min(proximalVisibility, distalVisibility),
    confidenceWeight: proximalVisibility * distalVisibility,
  };
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
        projectedBone(a, frameIndex, bone).direction,
        projectedBone(b, frameIndex, bone).direction,
      );
      if (distance > config.maxAngularDistanceRadians) {
        return { passes: false, robustScore: Number.POSITIVE_INFINITY };
      }
      distances.push(distance);
    }
  }
  return { passes: true, robustScore: median(distances) };
}

function chooseAttemptMedoid(
  attempts: readonly NormalizedViewAttemptV2[],
  config: RepeatedShotConsensusConfigV1,
): NormalizedViewAttemptV2 {
  const ranked = attempts.map((candidate) => {
    let score = 0;
    for (const other of attempts) {
      if (other === candidate) continue;
      for (const frameIndex of config.evaluationPhaseIndices) {
        for (const bone of config.requiredBones) {
          const candidateBone = projectedBone(candidate, frameIndex, bone);
          const otherBone = projectedBone(other, frameIndex, bone);
          score += otherBone.confidenceWeight * angleBetweenProjectedBones(
            candidateBone.direction,
            otherBone.direction,
          );
        }
      }
    }
    return { attempt: candidate, score };
  });
  ranked.sort((a, b) => (
    compareScores(a.score, b.score) === 0
      ? stableStringCompare(a.attempt.id, b.attempt.id)
      : compareScores(a.score, b.score)
  ));
  return ranked[0].attempt;
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
    const scoreComparison = compareScores(a.robustScore, b.robustScore);
    if (scoreComparison !== 0) return scoreComparison;
    const firstComparison = stableStringCompare(a.first.id, b.first.id);
    return firstComparison || stableStringCompare(a.second.id, b.second.id);
  });
  const selectedPair = candidates[0];
  if (!selectedPair) {
    return { status: "recapture_required", reason: "no_complete_agreeing_subset" };
  }

  const chosen = [selectedPair.first, selectedPair.second];
  const third = validated.attempts.find((attempt) => !chosen.includes(attempt));
  if (third && chosen.every((attempt) => measurePair(attempt, third, config).passes)) chosen.push(third);
  const medoid = chooseAttemptMedoid(chosen, config);
  const attemptIds = Object.freeze(chosen.map((attempt) => attempt.id).sort(stableStringCompare));
  return Object.freeze({
    status: "accepted" as const,
    evidence: "multi_take_consensus" as const,
    attemptIds,
    medoidAttemptId: medoid.id,
    robustScore: selectedPair.robustScore,
  });
}

function aggregateProjectedBone(
  chosen: readonly NormalizedViewAttemptV2[],
  frameIndex: number,
  bone: RequiredProjectedBoneV1,
): AggregatedProjectedBoneV1 {
  const observations = chosen.map((attempt) => ({
    attemptId: attempt.id,
    ...projectedBone(attempt, frameIndex, bone),
  }));
  const ranked = observations.map((candidate) => ({
    observation: candidate,
    score: observations.reduce((sum, other) => (
      sum + other.confidenceWeight * angleBetweenProjectedBones(
        candidate.direction,
        other.direction,
      )
    ), 0),
  })).sort((a, b) => (
    compareScores(a.score, b.score) === 0
      ? stableStringCompare(a.observation.attemptId, b.observation.attemptId)
      : compareScores(a.score, b.score)
  ));
  const medoid = ranked[0].observation;
  const distances = observations.map((observation) => (
    angleBetweenProjectedBones(medoid.direction, observation.direction)
  ));
  let maximumPairwiseSeparationRadians = 0;
  for (let firstIndex = 0; firstIndex < observations.length - 1; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < observations.length; secondIndex += 1) {
      maximumPairwiseSeparationRadians = Math.max(
        maximumPairwiseSeparationRadians,
        angleBetweenProjectedBones(
          observations[firstIndex].direction,
          observations[secondIndex].direction,
        ),
      );
    }
  }
  const totalWeight = observations.reduce((sum, observation) => sum + observation.confidenceWeight, 0);
  const weighted = (value: (observation: (typeof observations)[number]) => number): number => (
    observations.reduce((sum, observation) => (
      sum + value(observation) * observation.confidenceWeight
    ), 0) / totalWeight
  );
  return Object.freeze({
    direction: Object.freeze({ ...medoid.direction }),
    projectedLength: weighted((observation) => observation.length),
    availability: weighted((observation) => observation.availability),
    angularMadRadians: median(distances),
    retainedSpreadRadians: maximumPairwiseSeparationRadians,
    medoidAttemptId: medoid.attemptId,
    supportAttemptIds: Object.freeze(observations.map((observation) => observation.attemptId)),
  });
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
  const allSpreads: number[] = [];
  const mutableFrames: AggregatedPhaseSampleFrameV1[] = [];
  for (let frameIndex = 0; frameIndex < PRODUCTION_PHASE_SAMPLE_COUNT; frameIndex += 1) {
    const frame = chosen[0].frames[frameIndex];
    const bones = Object.fromEntries(config.requiredBones.map((bone) => {
      const evidence = aggregateProjectedBone(chosen, frameIndex, bone);
      allSpreads.push(evidence.retainedSpreadRadians);
      return [bone.id, evidence];
    })) as Record<string, AggregatedProjectedBoneV1>;
    mutableFrames.push(Object.freeze({
      phase: frame.phase,
      view: firstFrame.view,
      shootingHand: firstFrame.shootingHand,
      bones: Object.freeze(bones),
    }));
  }
  if (allSpreads.some((spread) => spread > config.maximumRetainedAngularSpreadRadians)) {
    return { status: "recapture_required", reason: "no_complete_agreeing_subset" };
  }
  const frames = Object.freeze(mutableFrames);
  return Object.freeze({
    ...selection,
    view: firstFrame.view,
    shootingHand: firstFrame.shootingHand,
    consensusDispersionRadians: allSpreads.reduce((sum, spread) => sum + spread, 0) / allSpreads.length,
    frames,
  });
}
