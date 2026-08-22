import type { SourceObservation2DV2 } from "@/lib/shooting-profile/coordinate-space";
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

const PHASE_IDS = ["ready", "deepestDip", "rise", "releaseProxy", "followThrough"] as const;
const PHASE_VALUES = [0, 0.25, 0.5, 0.75, 1] as const;

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite`);
  }
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

function trackedPoints(
  frame: LandmarkSequenceV2["frames"][number],
  frameIndex: number,
  shootingHand: ShootingHandV2,
): [MotionPoint, MotionPoint, MotionPoint, MotionPoint, MotionPoint] {
  const side = shootingHand === "right"
    ? { elbow: 14, wrist: 16, knee: 26, ankle: 28 }
    : { elbow: 13, wrist: 15, knee: 25, ankle: 27 };
  const wrist = requireLandmark(frame.sourceLandmarks, side.wrist, frameIndex);
  const elbow = requireLandmark(frame.sourceLandmarks, side.elbow, frameIndex);
  const leftHip = requireLandmark(frame.sourceLandmarks, 23, frameIndex);
  const rightHip = requireLandmark(frame.sourceLandmarks, 24, frameIndex);
  const knee = requireLandmark(frame.sourceLandmarks, side.knee, frameIndex);
  const ankle = requireLandmark(frame.sourceLandmarks, side.ankle, frameIndex);
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

export function detectPhaseAnchors(sequence: LandmarkSequenceV2): ShotPhaseAnchorV2[] {
  if (sequence.frames.length < 5) {
    throw new Error("at least five detected frames are required to detect shot phases");
  }
  validateTimestamps(sequence.frames.map((frame) => frame.timestampMs), "frame timestamps");
  const points = sequence.frames.map((frame, index) => trackedPoints(frame, index, sequence.shootingHand));

  let deepestDipIndex = 1;
  let deepestDipValue = Number.NEGATIVE_INFINITY;
  for (let index = 1; index <= sequence.frames.length - 4; index += 1) {
    const [, , pelvis, knee, ankle] = points[index];
    const dipValue = pelvis.y * 0.6 + knee.y * 0.25 + ankle.y * 0.15;
    if (dipValue > deepestDipValue) {
      deepestDipValue = dipValue;
      deepestDipIndex = index;
    }
  }

  let releaseIndex = deepestDipIndex + 2;
  let releaseMotion = Number.NEGATIVE_INFINITY;
  for (let index = deepestDipIndex + 2; index <= sequence.frames.length - 2; index += 1) {
    const weights = [4, 2, 1.5, 1, 1] as const;
    const score = points[index].reduce(
      (sum, point, pointIndex) => sum + distance(points[index - 1][pointIndex], point) * weights[pointIndex],
      0,
    );
    if (score > releaseMotion) {
      releaseMotion = score;
      releaseIndex = index;
    }
  }

  let riseIndex = deepestDipIndex + 1;
  let riseMotion = Number.NEGATIVE_INFINITY;
  for (let index = deepestDipIndex + 1; index < releaseIndex; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const upwardMotion = (previous[2].y - current[2].y) * 0.6
      + (previous[3].y - current[3].y) * 0.25
      + (previous[4].y - current[4].y) * 0.15;
    if (upwardMotion > riseMotion) {
      riseMotion = upwardMotion;
      riseIndex = index;
    }
  }

  const indices = [0, deepestDipIndex, riseIndex, releaseIndex, sequence.frames.length - 1] as const;
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

export function resampleAttemptToPhaseGrid(
  sequence: LandmarkSequenceV2,
  anchors: readonly ShotPhaseAnchorV2[],
  sampleCount = PRODUCTION_PHASE_SAMPLE_COUNT,
): PhaseSampleFrameV2[] {
  if (!Number.isInteger(sampleCount) || sampleCount < 2) {
    throw new Error("sampleCount must be an integer of at least two");
  }
  validateAnchors(anchors);
  validateSourceFrames(sequence);
  const firstTimestamp = sequence.frames[0].timestampMs;
  const lastTimestamp = sequence.frames[sequence.frames.length - 1].timestampMs;
  if (anchors[0].timestampMs < firstTimestamp || anchors[anchors.length - 1].timestampMs > lastTimestamp) {
    throw new Error("phase anchors must lie within the supplied attempt");
  }

  let sourceIndex = 0;
  return Array.from({ length: sampleCount }, (_, index) => {
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
        interpolateLandmark(landmark, to.sourceLandmarks[landmarkIndex], amount)
      )),
    };
  });
}
