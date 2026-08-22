import type { SourceObservation2DV2 } from "@/lib/shooting-profile/coordinate-space";
import { ENGINEERING_THRESHOLDS_V1 } from "@/lib/shooting-profile/engineering-thresholds";
import type {
  CaptureViewV2,
  LandmarkSequenceV2,
  ShootingHandV2,
  SourceLandmarkV2,
} from "@/lib/shooting-profile/types";

export const PRODUCTION_PHASE_SAMPLE_COUNT = 101;

export type ShotPhaseIdV2 = "ready" | "deepestDip" | "rise" | "releaseProxy" | "followThrough";

export type ShotPhaseAnchorV2 = {
  id: ShotPhaseIdV2;
  timestampMs: number;
  phase: number;
};

export type PhaseSampleFrameV2 = {
  phase: number;
  sourceTimestampMs: number;
  view: CaptureViewV2;
  shootingHand: ShootingHandV2;
  takeIndex: 0 | 1 | 2;
  sourceLandmarks: SourceObservation2DV2[];
};

type MotionPoint = { x: number; y: number };

export type PhaseDetectionErrorReasonV1 =
  | "invalid_source_dimensions"
  | "insufficient_detected_frames"
  | "invalid_phase_observation"
  | "degenerate_body_scale"
  | "insufficient_total_motion"
  | "missing_dip"
  | "missing_rise"
  | "missing_release_proxy"
  | "missing_follow_through"
  | "critical_phase_gap";

export class PhaseDetectionError extends Error {
  readonly reason: PhaseDetectionErrorReasonV1;

  constructor(reason: PhaseDetectionErrorReasonV1) {
    super(`phase_detection:${reason}`);
    this.name = "PhaseDetectionError";
    this.reason = reason;
  }
}

const PHASE_IDS = ["ready", "deepestDip", "rise", "releaseProxy", "followThrough"] as const;
const PHASE_VALUES = [0, 0.25, 0.5, 0.75, 1] as const;

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite`);
  }
}

function validateSourceDimensions(sequence: LandmarkSequenceV2): { width: number; height: number } {
  const width = sequence.metadata.displayWidth;
  const height = sequence.metadata.displayHeight;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new PhaseDetectionError("invalid_source_dimensions");
  }
  return { width, height };
}

/**
 * Converts restored upright-source normalized coordinates to centered,
 * isotropic source-height units. One x/y unit is one source-image height:
 * x_iso = (x - 0.5) * (width / height), y_iso = y - 0.5.
 */
function uprightSourceNormalizedToIsotropic(
  point: SourceObservation2DV2,
  width: number,
  height: number,
): SourceObservation2DV2 {
  const converted: SourceObservation2DV2 = {
    x: (point.x - 0.5) * (width / height),
    y: point.y - 0.5,
  };
  if (point.visibility !== undefined) converted.visibility = point.visibility;
  return converted;
}

function validateTimestamps(timestamps: readonly number[], name: string): void {
  timestamps.forEach((timestamp, index) => requireFinite(timestamp, `${name}[${index}]`));
  for (let index = 1; index < timestamps.length; index += 1) {
    if (timestamps[index] <= timestamps[index - 1]) {
      throw new Error(`${name} must be strictly increasing without duplicates`);
    }
  }
}

function validateAnchors(anchors: readonly ShotPhaseAnchorV2[]): void {
  if (anchors.length !== PHASE_IDS.length) {
    throw new Error("all five canonical phase anchors are required");
  }
  const ids = new Set<ShotPhaseIdV2>();
  anchors.forEach((anchor, index) => {
    requireFinite(anchor.timestampMs, `anchors[${index}].timestampMs`);
    requireFinite(anchor.phase, `anchors[${index}].phase`);
    if (anchor.id !== PHASE_IDS[index] || anchor.phase < 0 || anchor.phase > 1 || ids.has(anchor.id)) {
      throw new Error("phase anchors must use canonical ordered ids and phases within [0, 1]");
    }
    ids.add(anchor.id);
    if (index > 0 && (
      anchor.timestampMs <= anchors[index - 1].timestampMs
      || anchor.phase <= anchors[index - 1].phase
    )) {
      throw new Error("phase anchors must be strictly ordered by timestamp and phase");
    }
  });
  if (anchors[0].phase !== 0 || anchors.at(-1)?.phase !== 1) {
    throw new Error("phase anchors must cover phase bounds 0 and 1");
  }
}

function requireLandmark(
  landmarks: readonly SourceLandmarkV2[],
  index: number,
  frameIndex: number,
): SourceLandmarkV2 {
  const landmark = landmarks[index];
  if (!landmark) {
    throw new Error(`frame ${frameIndex} is missing critical joint ${index}`);
  }
  requireFinite(landmark.x, `frames[${frameIndex}].sourceLandmarks[${index}].x`);
  requireFinite(landmark.y, `frames[${frameIndex}].sourceLandmarks[${index}].y`);
  requireFinite(landmark.z, `frames[${frameIndex}].sourceLandmarks[${index}].z`);
  if (landmark.visibility !== undefined) {
    requireFinite(landmark.visibility, `frames[${frameIndex}].sourceLandmarks[${index}].visibility`);
  }
  return landmark;
}

function requireVisibleLandmark(
  landmarks: readonly SourceLandmarkV2[],
  index: number,
  frameIndex: number,
): SourceLandmarkV2 {
  const landmark = requireLandmark(landmarks, index, frameIndex);
  if (
    landmark.visibility === undefined
    || landmark.visibility < ENGINEERING_THRESHOLDS_V1.minimumPhaseObservationVisibility
    || landmark.visibility > 1
  ) {
    throw new PhaseDetectionError("invalid_phase_observation");
  }
  return landmark;
}

function trackedPoints(
  frame: LandmarkSequenceV2["frames"][number],
  frameIndex: number,
  shootingHand: ShootingHandV2,
  width: number,
  height: number,
): [MotionPoint, MotionPoint, MotionPoint, MotionPoint, MotionPoint] {
  const side = shootingHand === "right"
    ? { elbow: 14, wrist: 16, knee: 26, ankle: 28 }
    : { elbow: 13, wrist: 15, knee: 25, ankle: 27 };
  const wrist = uprightSourceNormalizedToIsotropic(
    requireVisibleLandmark(frame.sourceLandmarks, side.wrist, frameIndex), width, height,
  );
  const elbow = uprightSourceNormalizedToIsotropic(
    requireVisibleLandmark(frame.sourceLandmarks, side.elbow, frameIndex), width, height,
  );
  const leftHip = uprightSourceNormalizedToIsotropic(
    requireVisibleLandmark(frame.sourceLandmarks, 23, frameIndex), width, height,
  );
  const rightHip = uprightSourceNormalizedToIsotropic(
    requireVisibleLandmark(frame.sourceLandmarks, 24, frameIndex), width, height,
  );
  const knee = uprightSourceNormalizedToIsotropic(
    requireVisibleLandmark(frame.sourceLandmarks, side.knee, frameIndex), width, height,
  );
  const ankle = uprightSourceNormalizedToIsotropic(
    requireVisibleLandmark(frame.sourceLandmarks, side.ankle, frameIndex), width, height,
  );
  return [
    wrist,
    elbow,
    { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 },
    knee,
    ankle,
  ];
}

function distance(from: MotionPoint, to: MotionPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function median(values: readonly number[]): number {
  if (values.length === 0) throw new PhaseDetectionError("invalid_phase_observation");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function trackedMotionRange(points: readonly [MotionPoint, MotionPoint, MotionPoint, MotionPoint, MotionPoint][]): number {
  let total = 0;
  for (let pointIndex = 0; pointIndex < 5; pointIndex += 1) {
    const xs = points.map((frame) => frame[pointIndex].x);
    const ys = points.map((frame) => frame[pointIndex].y);
    total += Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  }
  return total;
}

function bodyDownSignal(
  points: readonly [MotionPoint, MotionPoint, MotionPoint, MotionPoint, MotionPoint][],
  frameIndex: number,
): number {
  const [, , pelvis, knee, ankle] = points[frameIndex];
  return pelvis.y * 0.6 + knee.y * 0.25 + ankle.y * 0.15;
}

export function detectPhaseAnchors(sequence: LandmarkSequenceV2): ShotPhaseAnchorV2[] {
  if (sequence.frames.length < 5) {
    throw new PhaseDetectionError("insufficient_detected_frames");
  }
  const { width, height } = validateSourceDimensions(sequence);
  try {
    validateTimestamps(sequence.frames.map((frame) => frame.timestampMs), "frame timestamps");
  } catch {
    throw new PhaseDetectionError("invalid_phase_observation");
  }
  let points: Array<[MotionPoint, MotionPoint, MotionPoint, MotionPoint, MotionPoint]>;
  try {
    points = sequence.frames.map((frame, index) => (
      trackedPoints(frame, index, sequence.shootingHand, width, height)
    ));
  } catch (error) {
    if (error instanceof PhaseDetectionError) throw error;
    throw new PhaseDetectionError("invalid_phase_observation");
  }

  const bodyScale = median(points.map(([, , pelvis, knee, ankle]) => (
    distance(pelvis, knee) + distance(knee, ankle)
  )));
  if (!Number.isFinite(bodyScale)
    || bodyScale < ENGINEERING_THRESHOLDS_V1.minimumPhaseBodyScaleSourceHeightUnits) {
    throw new PhaseDetectionError("degenerate_body_scale");
  }
  if (trackedMotionRange(points) / bodyScale
    < ENGINEERING_THRESHOLDS_V1.minimumPhaseTotalTrackedMotionBodyScales) {
    throw new PhaseDetectionError("insufficient_total_motion");
  }

  let deepestDipIndex = 1;
  let deepestDipValue = Number.NEGATIVE_INFINITY;
  for (let index = 1; index <= sequence.frames.length - 4; index += 1) {
    const dipValue = bodyDownSignal(points, index);
    if (dipValue > deepestDipValue) {
      deepestDipValue = dipValue;
      deepestDipIndex = index;
    }
  }

  const preDipBaseline = Math.min(...points.slice(0, deepestDipIndex).map((_, index) => (
    bodyDownSignal(points, index)
  )));
  const readyBaselineTolerance = bodyScale
    * ENGINEERING_THRESHOLDS_V1.maximumPhaseReadyBaselineExcursionBodyScales;
  let readyIndex: number | undefined;
  for (let index = deepestDipIndex - 1; index >= 0; index -= 1) {
    if (bodyDownSignal(points, index) <= preDipBaseline + readyBaselineTolerance) {
      readyIndex = index;
      break;
    }
  }
  if (readyIndex === undefined
    || (deepestDipValue - bodyDownSignal(points, readyIndex)) / bodyScale
    < ENGINEERING_THRESHOLDS_V1.minimumPhaseDipExcursionBodyScales) {
    throw new PhaseDetectionError("missing_dip");
  }

  let riseIndex: number | undefined;
  for (let index = deepestDipIndex + 1; index < sequence.frames.length; index += 1) {
    if ((deepestDipValue - bodyDownSignal(points, index)) / bodyScale
      >= ENGINEERING_THRESHOLDS_V1.minimumPhasePostDipRiseBodyScales) {
      riseIndex = index;
      break;
    }
  }
  if (riseIndex === undefined) throw new PhaseDetectionError("missing_rise");

  let releaseIndex: number | undefined;
  let releaseVelocity = Number.NEGATIVE_INFINITY;
  const extensionAtDip = distance(points[deepestDipIndex][1], points[deepestDipIndex][0]);
  for (let index = riseIndex + 1; index < sequence.frames.length; index += 1) {
    const deltaTimeSeconds = (
      sequence.frames[index].timestampMs - sequence.frames[index - 1].timestampMs
    ) / 1_000;
    const weights = [0.55, 0.25, 0.10, 0.06, 0.04] as const;
    const weightedDisplacement = points[index].reduce(
      (sum, point, pointIndex) => (
        sum + distance(points[index - 1][pointIndex], point) * weights[pointIndex]
      ),
      0,
    );
    const velocity = weightedDisplacement / bodyScale / deltaTimeSeconds;
    const candidateWristRise = points[deepestDipIndex][0].y - points[index][0].y;
    const candidateExtension = distance(points[index][1], points[index][0]);
    if (candidateWristRise / bodyScale
      < ENGINEERING_THRESHOLDS_V1.minimumPhaseShootingWristRiseBodyScales
      || (candidateExtension - extensionAtDip) / bodyScale
        < ENGINEERING_THRESHOLDS_V1.minimumPhaseShootingWristExtensionBodyScales) {
      continue;
    }
    if (velocity > releaseVelocity) {
      releaseVelocity = velocity;
      releaseIndex = index;
    }
  }
  if (releaseIndex === undefined
    || releaseVelocity < ENGINEERING_THRESHOLDS_V1.minimumPhaseReleaseProxyVelocityBodyScalesPerSecond) {
    throw new PhaseDetectionError("missing_release_proxy");
  }

  const wristRise = points[deepestDipIndex][0].y - points[releaseIndex][0].y;
  const extensionAtRelease = distance(points[releaseIndex][1], points[releaseIndex][0]);
  if (wristRise / bodyScale < ENGINEERING_THRESHOLDS_V1.minimumPhaseShootingWristRiseBodyScales
    || (extensionAtRelease - extensionAtDip) / bodyScale
      < ENGINEERING_THRESHOLDS_V1.minimumPhaseShootingWristExtensionBodyScales) {
    throw new PhaseDetectionError("missing_release_proxy");
  }

  const extensionAtReleaseForFollow = distance(points[releaseIndex][1], points[releaseIndex][0]);
  let followThroughIndex: number | undefined;
  for (let index = releaseIndex + 1; index < sequence.frames.length; index += 1) {
    const elapsedMs = sequence.frames[index].timestampMs - sequence.frames[releaseIndex].timestampMs;
    const wristDropBodyScales = (points[index][0].y - points[releaseIndex][0].y) / bodyScale;
    const extensionLossBodyScales = (
      extensionAtReleaseForFollow - distance(points[index][1], points[index][0])
    ) / bodyScale;
    if (elapsedMs >= ENGINEERING_THRESHOLDS_V1.minimumPhaseFollowThroughElapsedMs
      && wristDropBodyScales <= ENGINEERING_THRESHOLDS_V1.maximumFollowThroughWristDropBodyScales
      && extensionLossBodyScales
        <= ENGINEERING_THRESHOLDS_V1.maximumPhaseFollowThroughExtensionLossBodyScales) {
      followThroughIndex = index;
      break;
    }
  }
  if (followThroughIndex === undefined) throw new PhaseDetectionError("missing_follow_through");

  for (let index = readyIndex + 1; index <= followThroughIndex; index += 1) {
    if (sequence.frames[index].timestampMs - sequence.frames[index - 1].timestampMs
      > ENGINEERING_THRESHOLDS_V1.maximumCriticalPhaseDetectedFrameGapMs) {
      throw new PhaseDetectionError("critical_phase_gap");
    }
  }

  const indices = [readyIndex, deepestDipIndex, riseIndex, releaseIndex, followThroughIndex] as const;
  return indices.map((frameIndex, index) => ({
    id: PHASE_IDS[index],
    timestampMs: sequence.frames[frameIndex].timestampMs,
    phase: PHASE_VALUES[index],
  }));
}

export function phaseAtTimestamp(timestampMs: number, anchors: readonly ShotPhaseAnchorV2[]): number {
  requireFinite(timestampMs, "timestampMs");
  validateAnchors(anchors);
  if (timestampMs <= anchors[0].timestampMs) return anchors[0].phase;
  if (timestampMs >= anchors[anchors.length - 1].timestampMs) return anchors[anchors.length - 1].phase;

  for (let index = 1; index < anchors.length; index += 1) {
    const end = anchors[index];
    if (timestampMs <= end.timestampMs) {
      const start = anchors[index - 1];
      const amount = (timestampMs - start.timestampMs) / (end.timestampMs - start.timestampMs);
      return start.phase + (end.phase - start.phase) * amount;
    }
  }
  return 1;
}

function timestampAtPhase(phase: number, anchors: readonly ShotPhaseAnchorV2[]): number {
  if (phase <= anchors[0].phase) return anchors[0].timestampMs;
  if (phase >= anchors[anchors.length - 1].phase) return anchors[anchors.length - 1].timestampMs;
  for (let index = 1; index < anchors.length; index += 1) {
    const end = anchors[index];
    if (phase <= end.phase) {
      const start = anchors[index - 1];
      const amount = (phase - start.phase) / (end.phase - start.phase);
      return start.timestampMs + (end.timestampMs - start.timestampMs) * amount;
    }
  }
  return anchors[anchors.length - 1].timestampMs;
}

function validateSourceFrames(sequence: LandmarkSequenceV2): void {
  if (sequence.frames.length < 2) {
    throw new Error("at least two source frames are required for interpolation");
  }
  validateTimestamps(sequence.frames.map((frame) => frame.timestampMs), "source timestamps");
  const landmarkCount = sequence.frames[0].sourceLandmarks.length;
  if (landmarkCount === 0) {
    throw new Error("source frames must contain landmarks");
  }
  sequence.frames.forEach((frame, frameIndex) => {
    if (frame.sourceLandmarks.length !== landmarkCount) {
      throw new Error("all source frames must contain the same landmark count");
    }
    frame.sourceLandmarks.forEach((landmark, landmarkIndex) => {
      if (!landmark) {
        throw new Error(`frame ${frameIndex} is missing landmark ${landmarkIndex}`);
      }
      requireFinite(landmark.x, `frames[${frameIndex}].sourceLandmarks[${landmarkIndex}].x`);
      requireFinite(landmark.y, `frames[${frameIndex}].sourceLandmarks[${landmarkIndex}].y`);
      requireFinite(landmark.z, `frames[${frameIndex}].sourceLandmarks[${landmarkIndex}].z`);
      if (landmark.visibility !== undefined) {
        requireFinite(landmark.visibility, `frames[${frameIndex}].sourceLandmarks[${landmarkIndex}].visibility`);
        if (landmark.visibility < 0 || landmark.visibility > 1) {
          throw new Error(`frames[${frameIndex}].sourceLandmarks[${landmarkIndex}].visibility must be in [0, 1]`);
        }
      }
    });
  });
}

function interpolateLandmark(
  from: SourceLandmarkV2,
  to: SourceLandmarkV2,
  amount: number,
): SourceObservation2DV2 {
  const point: SourceObservation2DV2 = {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
  if (from.visibility !== undefined || to.visibility !== undefined) {
    const fromVisibility = from.visibility ?? to.visibility ?? 0;
    const toVisibility = to.visibility ?? from.visibility ?? 0;
    point.visibility = fromVisibility + (toVisibility - fromVisibility) * amount;
  }
  return point;
}

function smoothPhaseFrames2D(
  frames: readonly PhaseSampleFrameV2[],
): PhaseSampleFrameV2[] {
  const radius = ENGINEERING_THRESHOLDS_V1.preAngleSmoothingWindowRadius;
  if (radius <= 0 || frames.length <= 2) return [...frames];
  return frames.map((frame, frameIndex) => {
    // Exact phase-grid endpoints remain the observed/interpolated endpoints.
    if (frameIndex === 0 || frameIndex === frames.length - 1) return frame;
    const start = Math.max(0, frameIndex - radius);
    const end = Math.min(frames.length - 1, frameIndex + radius);
    return {
      ...frame,
      sourceLandmarks: frame.sourceLandmarks.map((point, landmarkIndex) => {
        let totalWeight = 0;
        let x = 0;
        let y = 0;
        for (let index = start; index <= end; index += 1) {
          const candidate = frames[index].sourceLandmarks[landmarkIndex];
          const temporalWeight = radius + 1 - Math.abs(index - frameIndex);
          const visibilityWeight = candidate.visibility ?? 1;
          const weight = temporalWeight * visibilityWeight;
          totalWeight += weight;
          x += candidate.x * weight;
          y += candidate.y * weight;
        }
        const smoothed = totalWeight > 0
          ? { x: x / totalWeight, y: y / totalWeight }
          : { x: point.x, y: point.y };
        return point.visibility === undefined
          ? smoothed
          : { ...smoothed, visibility: point.visibility };
      }),
    };
  });
}

export function resampleAttemptToPhaseGrid(
  sequence: LandmarkSequenceV2,
  anchors: readonly ShotPhaseAnchorV2[],
  sampleCount = PRODUCTION_PHASE_SAMPLE_COUNT,
): PhaseSampleFrameV2[] {
  if (!Number.isInteger(sampleCount) || sampleCount < 2) {
    throw new Error("sampleCount must be an integer of at least two");
  }
  const { width, height } = validateSourceDimensions(sequence);
  validateAnchors(anchors);
  validateSourceFrames(sequence);
  const firstTimestamp = sequence.frames[0].timestampMs;
  const lastTimestamp = sequence.frames[sequence.frames.length - 1].timestampMs;
  if (anchors[0].timestampMs < firstTimestamp || anchors[anchors.length - 1].timestampMs > lastTimestamp) {
    throw new Error("phase anchors must lie within the supplied attempt");
  }

  let sourceIndex = 0;
  const interpolated = Array.from({ length: sampleCount }, (_, index) => {
    const phase = index / (sampleCount - 1);
    const sourceTimestampMs = timestampAtPhase(phase, anchors);
    while (
      sourceIndex + 1 < sequence.frames.length - 1
      && sequence.frames[sourceIndex + 1].timestampMs < sourceTimestampMs
    ) {
      sourceIndex += 1;
    }
    const from = sequence.frames[sourceIndex];
    const to = sequence.frames[Math.min(sourceIndex + 1, sequence.frames.length - 1)];
    const duration = to.timestampMs - from.timestampMs;
    const amount = duration === 0 ? 0 : (sourceTimestampMs - from.timestampMs) / duration;
    return {
      phase,
      sourceTimestampMs,
      view: sequence.view,
      shootingHand: sequence.shootingHand,
      takeIndex: sequence.takeIndex,
      sourceLandmarks: from.sourceLandmarks.map((landmark, landmarkIndex) => (
        uprightSourceNormalizedToIsotropic(
          interpolateLandmark(landmark, to.sourceLandmarks[landmarkIndex], amount),
          width,
          height,
        )
      )),
    };
  });
  return smoothPhaseFrames2D(interpolated);
}
