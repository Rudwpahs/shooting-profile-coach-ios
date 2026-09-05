import {
  detectPhaseAnchors,
  resampleAttemptToPhaseGrid,
  type PhaseSampleFrameV2,
} from "@/lib/shooting-profile/phase-normalization";
import type { LandmarkSequenceV2 } from "@/lib/shooting-profile/types";

/**
 * View-admission gate for separately recorded front and shooting-side clips.
 *
 * Two genuinely perpendicular views of the same shooter project the body onto
 * different planes, so their phase-normalized, translation- and scale-free
 * landmark tracks stay far apart. Re-filming the same angle twice, relabelling
 * one clip as the other view, or mirroring a clip collapses that distance to
 * roughly zero. This gate refuses those inputs before any 3D direction is
 * reconstructed from them.
 *
 * The limit is a provisional engineering default, not a validated biomechanical
 * threshold. It is deliberately far below the distance a real front/side pair
 * produces and far above the distance a duplicate produces.
 */
export const CROSS_VIEW_GEOMETRY_V1 = Object.freeze({
  version: "cross_view_geometry_admission_v1" as const,
  validationStatus: "provisional_unvalidated_engineering_gate" as const,
  /**
   * Mean absolute per-coordinate distance, in pelvis-centred body-scale units,
   * below which two views are treated as the same projection.
   */
  minimumNormalizedViewDistance: 0.04,
});

export type CrossViewGeometryReasonV1 =
  | "insufficient_view_evidence"
  | "duplicate_view_projection"
  | "mirrored_view_projection";

export type CrossViewGeometryResultV1 =
  | Readonly<{
    status: "accepted";
    version: typeof CROSS_VIEW_GEOMETRY_V1.version;
    minimumNormalizedViewDistance: number;
    comparedPairCount: number;
  }>
  | Readonly<{
    status: "rejected";
    version: typeof CROSS_VIEW_GEOMETRY_V1.version;
    reason: CrossViewGeometryReasonV1;
    minimumNormalizedViewDistance?: number;
    comparedPairCount: number;
  }>;

export type CrossViewGeometryAttemptV1 = Readonly<{
  id: string;
  sequence: LandmarkSequenceV2;
}>;

/** An attempt already resampled onto the 101-phase grid by the pipeline. */
export type NormalizedCrossViewGeometryAttemptV1 = Readonly<{
  id: string;
  frames: readonly PhaseSampleFrameV2[];
}>;

/** The twelve landmarks the reconstruction itself depends on. */
const REQUIRED_LANDMARK_INDICES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const;
const LEFT_HIP_INDEX = 23;
const RIGHT_HIP_INDEX = 24;
const EPSILON = 1e-12;

type Track = readonly (readonly number[])[];

/**
 * Phase-normalized landmark track with translation and scale removed: for every
 * phase sample, each required landmark is expressed relative to the pelvis
 * centre and divided by one root-mean-square body radius for the whole take.
 * Even x indices hold the horizontal component, so mirroring is a sign flip.
 */
function normalizedTrackFromFrames(frames: readonly PhaseSampleFrameV2[]): Track | undefined {
  if (frames.length === 0) return undefined;
  const centred = frames.map((frame) => {
    const leftHip = frame.sourceLandmarks[LEFT_HIP_INDEX];
    const rightHip = frame.sourceLandmarks[RIGHT_HIP_INDEX];
    if (!leftHip || !rightHip) return undefined;
    const centreX = (leftHip.x + rightHip.x) / 2;
    const centreY = (leftHip.y + rightHip.y) / 2;
    const row: number[] = [];
    for (const index of REQUIRED_LANDMARK_INDICES) {
      const point = frame.sourceLandmarks[index];
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
      row.push(point.x - centreX, point.y - centreY);
    }
    return row;
  });
  if (centred.some((row) => row === undefined)) return undefined;
  const rows = centred as number[][];
  const squaredSum = rows.reduce(
    (sum, row) => sum + row.reduce((rowSum, value) => rowSum + value * value, 0),
    0,
  );
  const sampleCount = rows.length * REQUIRED_LANDMARK_INDICES.length;
  const scale = Math.sqrt(squaredSum / Math.max(1, sampleCount));
  if (!Number.isFinite(scale) || scale <= EPSILON) return undefined;
  return rows.map((row) => row.map((value) => value / scale));
}

function normalizedTrackFromSequence(sequence: LandmarkSequenceV2): Track | undefined {
  try {
    return normalizedTrackFromFrames(resampleAttemptToPhaseGrid(sequence, detectPhaseAnchors(sequence)));
  } catch {
    return undefined;
  }
}

function meanAbsoluteDistance(left: Track, right: Track, mirrorHorizontal: boolean): number {
  let sum = 0;
  let count = 0;
  for (let frameIndex = 0; frameIndex < left.length; frameIndex += 1) {
    const leftRow = left[frameIndex];
    const rightRow = right[frameIndex];
    for (let index = 0; index < leftRow.length; index += 1) {
      const rightValue = mirrorHorizontal && index % 2 === 0 ? -rightRow[index] : rightRow[index];
      sum += Math.abs(leftRow[index] - rightValue);
      count += 1;
    }
  }
  return count === 0 ? Number.POSITIVE_INFINITY : sum / count;
}

function rejected(
  reason: CrossViewGeometryReasonV1,
  comparedPairCount: number,
  minimumNormalizedViewDistance?: number,
): CrossViewGeometryResultV1 {
  return Object.freeze({
    status: "rejected" as const,
    version: CROSS_VIEW_GEOMETRY_V1.version,
    reason,
    ...(minimumNormalizedViewDistance === undefined ? {} : { minimumNormalizedViewDistance }),
    comparedPairCount,
  });
}

/**
 * Compares every front track against every shooting-side track. Same-view
 * takes are deliberately not compared: repeated shots from one angle are
 * supposed to look alike, and the repeated-shot consensus already governs them.
 */
function assessTracks(
  frontTracks: readonly (Track | undefined)[],
  sideTracks: readonly (Track | undefined)[],
): CrossViewGeometryResultV1 {
  if (frontTracks.length === 0 || sideTracks.length === 0) {
    return rejected("insufficient_view_evidence", 0);
  }
  if (frontTracks.some((track) => track === undefined) || sideTracks.some((track) => track === undefined)) {
    return rejected("insufficient_view_evidence", 0);
  }

  let minimumDistance = Number.POSITIVE_INFINITY;
  let mirroredIsCloser = false;
  let comparedPairCount = 0;
  for (const frontTrack of frontTracks as Track[]) {
    for (const sideTrack of sideTracks as Track[]) {
      if (frontTrack.length !== sideTrack.length) return rejected("insufficient_view_evidence", comparedPairCount);
      const identity = meanAbsoluteDistance(frontTrack, sideTrack, false);
      const mirrored = meanAbsoluteDistance(frontTrack, sideTrack, true);
      const pairDistance = Math.min(identity, mirrored);
      if (pairDistance < minimumDistance) {
        minimumDistance = pairDistance;
        mirroredIsCloser = mirrored < identity;
      }
      comparedPairCount += 1;
    }
  }
  if (!Number.isFinite(minimumDistance)) {
    return rejected("insufficient_view_evidence", comparedPairCount);
  }
  if (minimumDistance < CROSS_VIEW_GEOMETRY_V1.minimumNormalizedViewDistance) {
    return rejected(
      mirroredIsCloser ? "mirrored_view_projection" : "duplicate_view_projection",
      comparedPairCount,
      minimumDistance,
    );
  }
  return Object.freeze({
    status: "accepted" as const,
    version: CROSS_VIEW_GEOMETRY_V1.version,
    minimumNormalizedViewDistance: minimumDistance,
    comparedPairCount,
  });
}

/**
 * Gate for attempts the pipeline has already phase-normalized. The view is the
 * one every resampled frame carries, so no second phase detection runs.
 */
export function assessNormalizedCrossViewGeometry(
  attempts: readonly NormalizedCrossViewGeometryAttemptV1[],
): CrossViewGeometryResultV1 {
  const front = attempts.filter((attempt) => attempt.frames[0]?.view === "front");
  const side = attempts.filter((attempt) => attempt.frames[0]?.view === "shooting_side");
  return assessTracks(
    front.map((attempt) => normalizedTrackFromFrames(attempt.frames)),
    side.map((attempt) => normalizedTrackFromFrames(attempt.frames)),
  );
}

/** Gate for raw clips: normalizes each one first, then applies the same comparison. */
export function assessCrossViewGeometry(
  attempts: readonly CrossViewGeometryAttemptV1[],
): CrossViewGeometryResultV1 {
  const front = attempts.filter((attempt) => attempt.sequence.view === "front");
  const side = attempts.filter((attempt) => attempt.sequence.view === "shooting_side");
  return assessTracks(
    front.map((attempt) => normalizedTrackFromSequence(attempt.sequence)),
    side.map((attempt) => normalizedTrackFromSequence(attempt.sequence)),
  );
}
