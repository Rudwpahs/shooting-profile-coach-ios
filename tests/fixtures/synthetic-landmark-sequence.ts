import type { Vector3 } from "@/lib/pose-motion";
import type { KinematicBoneIdV1 } from "@/lib/shooting-profile/kinematics";
import type { CaptureViewV2, LandmarkSequenceV2, ShootingHandV2, SourceLandmarkV2 } from "@/lib/shooting-profile/types";

type SyntheticLandmarkSequenceOptions = {
  view: "front" | "shooting_side";
  shootingHand?: "left" | "right";
  takeIndex?: 0 | 1 | 2;
  timeOffsetMs?: number;
  durationScale?: number;
  anchorScheduleShift?: number;
  noiseAmplitude?: number;
};

type SyntheticLandmarkSessionOptions = {
  mode: "basic_1_plus_1" | "high_accuracy_3_plus_3";
  shootingHand?: "left" | "right";
  sideAnchorScheduleShift?: number;
};

const DISPLAY_WIDTH = 1080;
const DISPLAY_HEIGHT = 1920;
const FRAME_RATE = 30;
const TEMPLATE_LENGTHS = Object.freeze({
  pelvis_to_left_hip: 0.34,
  pelvis_to_right_hip: 0.34,
  left_torso: 1.10,
  right_torso: 1.10,
  left_upper_arm: 0.72,
  left_forearm: 0.60,
  right_upper_arm: 0.72,
  right_forearm: 0.60,
  left_thigh: 1.05,
  left_shin: 1.02,
  right_thigh: 1.05,
  right_shin: 1.02,
} satisfies Record<KinematicBoneIdV1, number>);

const SOURCE_SCALE = 0.14;
const ANCHOR_PHASES = [0, 0.25, 0.5, 0.75, 1] as const;

function add(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(vector: Vector3, amount: number): Vector3 {
  return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount };
}

function unit(vector: Vector3): Vector3 {
  const magnitude = Math.hypot(vector.x, vector.y, vector.z);
  return scale(vector, 1 / magnitude);
}

function interpolate(from: number, to: number, amount: number): number {
  return from + (to - from) * Math.max(0, Math.min(1, amount));
}

function interpolateVector(from: Vector3, to: Vector3, amount: number): Vector3 {
  return unit({
    x: interpolate(from.x, to.x, amount),
    y: interpolate(from.y, to.y, amount),
    z: interpolate(from.z, to.z, amount),
  });
}

function intervalProgress(phase: number, start: number, end: number): number {
  return Math.max(0, Math.min(1, (phase - start) / (end - start)));
}

function rootHeightAtPhase(phase: number): number {
  if (phase <= 0.2) return 0;
  if (phase <= 0.25) return interpolate(0, -0.55, intervalProgress(phase, 0.2, 0.25));
  if (phase <= 0.5) return interpolate(-0.55, -0.52, intervalProgress(phase, 0.25, 0.5));
  if (phase <= 0.55) return interpolate(-0.52, 0.55, intervalProgress(phase, 0.5, 0.55));
  return 0.55;
}

function releaseArmProgress(phase: number): number {
  if (phase <= 0.55) return 0;
  if (phase <= 0.7) return 0.18 * intervalProgress(phase, 0.55, 0.7);
  return interpolate(0.18, 1, intervalProgress(phase, 0.7, 0.75));
}

function legExtensionProgress(phase: number): number {
  if (phase <= 0.23) return 1;
  if (phase <= 0.25) return interpolate(1, 0, intervalProgress(phase, 0.23, 0.25));
  if (phase <= 0.55) return 0;
  return intervalProgress(phase, 0.55, 0.6);
}

/** Builds a closed template-length skeleton in canonical +y-up coordinates. */
function syntheticPose(phase: number): { root: Vector3; joints: Record<number, Vector3> } {
  const root = { x: 0.03 * phase, y: rootHeightAtPhase(phase), z: -0.025 * phase };
  const hipLine = unit({ x: 0.57, y: 0.52, z: 0.64 });
  const leftHip = add(root, scale(hipLine, -TEMPLATE_LENGTHS.pelvis_to_left_hip));
  const rightHip = add(root, scale(hipLine, TEMPLATE_LENGTHS.pelvis_to_right_hip));

  // This is the same closed-shoulder construction used by synthetic-dual-view:
  // the observed shoulder line is exactly one template shoulder breadth while
  // both torso edges retain their independently fixed template lengths.
  const shoulderDirection = unit({ x: 0.61, y: 0.48, z: 0.63 });
  const hipSeparation = scale(
    hipLine,
    TEMPLATE_LENGTHS.pelvis_to_left_hip + TEMPLATE_LENGTHS.pelvis_to_right_hip,
  );
  const torsoDirectionHalfDifference = scale(
    subtract(shoulderDirection, hipSeparation),
    1 / (TEMPLATE_LENGTHS.left_torso + TEMPLATE_LENGTHS.right_torso),
  );
  const halfDifferenceDirection = unit(torsoDirectionHalfDifference);
  const commonTorsoDirection = unit({
    x: -halfDifferenceDirection.x * halfDifferenceDirection.y,
    y: 1 - halfDifferenceDirection.y * halfDifferenceDirection.y,
    z: -halfDifferenceDirection.z * halfDifferenceDirection.y,
  });
  const commonTorsoMagnitude = Math.sqrt(1 - Math.hypot(
    torsoDirectionHalfDifference.x,
    torsoDirectionHalfDifference.y,
    torsoDirectionHalfDifference.z,
  ) ** 2);
  const leftTorsoDirection = add(
    scale(commonTorsoDirection, commonTorsoMagnitude),
    scale(torsoDirectionHalfDifference, -1),
  );
  const rightTorsoDirection = add(
    scale(commonTorsoDirection, commonTorsoMagnitude),
    torsoDirectionHalfDifference,
  );
  const leftShoulder = add(leftHip, scale(leftTorsoDirection, TEMPLATE_LENGTHS.left_torso));
  const rightShoulder = add(rightHip, scale(rightTorsoDirection, TEMPLATE_LENGTHS.right_torso));

  const armProgress = releaseArmProgress(phase);
  const leftUpperArmDirection = interpolateVector(
    unit({ x: -0.50, y: 0.58, z: 0.64 }),
    unit({ x: -0.20, y: 0.88, z: 0.43 }),
    armProgress,
  );
  const rightUpperArmDirection = interpolateVector(
    unit({ x: 0.50, y: 0.58, z: 0.64 }),
    unit({ x: 0.20, y: 0.88, z: 0.43 }),
    armProgress,
  );
  const leftForearmDirection = interpolateVector(
    unit({ x: -0.50, y: 0.50, z: 0.50 }),
    unit({ x: -0.12, y: 1.20, z: 0.12 }),
    armProgress,
  );
  const rightForearmDirection = interpolateVector(
    unit({ x: 0.50, y: 0.50, z: 0.50 }),
    unit({ x: 0.12, y: 1.20, z: 0.12 }),
    armProgress,
  );
  const leftElbow = add(leftShoulder, scale(leftUpperArmDirection, TEMPLATE_LENGTHS.left_upper_arm));
  const rightElbow = add(rightShoulder, scale(rightUpperArmDirection, TEMPLATE_LENGTHS.right_upper_arm));
  const leftWrist = add(leftElbow, scale(leftForearmDirection, TEMPLATE_LENGTHS.left_forearm));
  const rightWrist = add(rightElbow, scale(rightForearmDirection, TEMPLATE_LENGTHS.right_forearm));

  const legProgress = legExtensionProgress(phase);
  const leftThighDirection = interpolateVector(
    unit({ x: -0.55, y: -0.62, z: -0.56 }),
    unit({ x: -0.20, y: -0.93, z: -0.31 }),
    legProgress,
  );
  const rightThighDirection = interpolateVector(
    unit({ x: 0.55, y: -0.62, z: -0.56 }),
    unit({ x: 0.20, y: -0.93, z: -0.31 }),
    legProgress,
  );
  const leftShinDirection = interpolateVector(
    unit({ x: 0.48, y: -0.63, z: 0.61 }),
    unit({ x: 0.10, y: -0.94, z: 0.32 }),
    legProgress,
  );
  const rightShinDirection = interpolateVector(
    unit({ x: -0.48, y: -0.63, z: 0.61 }),
    unit({ x: -0.10, y: -0.94, z: 0.32 }),
    legProgress,
  );
  const leftKnee = add(leftHip, scale(leftThighDirection, TEMPLATE_LENGTHS.left_thigh));
  const rightKnee = add(rightHip, scale(rightThighDirection, TEMPLATE_LENGTHS.right_thigh));
  const leftAnkle = add(leftKnee, scale(leftShinDirection, TEMPLATE_LENGTHS.left_shin));
  const rightAnkle = add(rightKnee, scale(rightShinDirection, TEMPLATE_LENGTHS.right_shin));

  return {
    root,
    joints: {
      11: leftShoulder, 12: rightShoulder, 13: leftElbow, 14: rightElbow,
      15: leftWrist, 16: rightWrist, 23: leftHip, 24: rightHip,
      25: leftKnee, 26: rightKnee, 27: leftAnkle, 28: rightAnkle,
    },
  };
}

export function syntheticLandmarkTruthDirectionsAtPhase(
  phase: number,
): Record<KinematicBoneIdV1, Vector3> {
  const pose = syntheticPose(phase);
  const joints = pose.joints;
  return {
    pelvis_to_left_hip: unit(subtract(joints[23], pose.root)),
    pelvis_to_right_hip: unit(subtract(joints[24], pose.root)),
    left_torso: unit(subtract(joints[11], joints[23])),
    right_torso: unit(subtract(joints[12], joints[24])),
    left_upper_arm: unit(subtract(joints[13], joints[11])),
    left_forearm: unit(subtract(joints[15], joints[13])),
    right_upper_arm: unit(subtract(joints[14], joints[12])),
    right_forearm: unit(subtract(joints[16], joints[14])),
    left_thigh: unit(subtract(joints[25], joints[23])),
    left_shin: unit(subtract(joints[27], joints[25])),
    right_thigh: unit(subtract(joints[26], joints[24])),
    right_shin: unit(subtract(joints[28], joints[26])),
  };
}

function motionPhaseAtTimelinePosition(position: number, anchorScheduleShift: number): number {
  const timelineAnchors = [0, 0.25 + anchorScheduleShift, 0.5 + anchorScheduleShift, 0.75 + anchorScheduleShift, 1];
  for (let index = 1; index < timelineAnchors.length; index += 1) {
    if (position <= timelineAnchors[index]) {
      return interpolate(
        ANCHOR_PHASES[index - 1],
        ANCHOR_PHASES[index],
        (position - timelineAnchors[index - 1]) / (timelineAnchors[index] - timelineAnchors[index - 1]),
      );
    }
  }
  return 1;
}

function deterministicObservationNoise(
  view: CaptureViewV2,
  takeIndex: number,
  frameIndex: number,
  landmarkIndex: number,
  amplitude: number,
): { x: number; y: number } {
  const viewSeed = view === "front" ? 17 : 43;
  const seed = viewSeed + takeIndex * 131 + frameIndex * 7 + landmarkIndex * 19;
  return { x: Math.sin(seed * 0.73) * amplitude, y: Math.cos(seed * 0.61) * amplitude };
}

function project(point: Vector3, view: CaptureViewV2, shootingHand: ShootingHandV2): { x: number; y: number } {
  const horizontal = view === "front"
    ? point.x
    : shootingHand === "right" ? point.z : -point.z;
  return {
    x: 0.5 + horizontal * SOURCE_SCALE * (DISPLAY_HEIGHT / DISPLAY_WIDTH),
    y: 0.6 - point.y * SOURCE_SCALE,
  };
}

function landmarksForPose(
  pose: ReturnType<typeof syntheticPose>,
  view: CaptureViewV2,
  shootingHand: ShootingHandV2,
  takeIndex: number,
  frameIndex: number,
  noiseAmplitude: number,
): SourceLandmarkV2[] {
  const shoulders = scale(add(pose.joints[11], pose.joints[12]), 0.5);
  const leftAnkle = pose.joints[27];
  const rightAnkle = pose.joints[28];
  const landmarksByIndex: Record<number, Vector3> = {
    ...pose.joints,
    0: add(shoulders, { x: 0, y: 0.62, z: 0 }),
    1: add(shoulders, { x: -0.05, y: 0.58, z: 0.02 }),
    2: add(shoulders, { x: 0.05, y: 0.58, z: 0.02 }),
    3: add(shoulders, { x: -0.10, y: 0.55, z: 0.02 }),
    4: add(shoulders, { x: 0.10, y: 0.55, z: 0.02 }),
    5: add(shoulders, { x: -0.13, y: 0.48, z: 0.01 }),
    6: add(shoulders, { x: 0.13, y: 0.48, z: 0.01 }),
    7: add(shoulders, { x: -0.18, y: 0.43, z: 0 }),
    8: add(shoulders, { x: 0.18, y: 0.43, z: 0 }),
    9: add(shoulders, { x: -0.03, y: 0.43, z: 0.09 }),
    10: add(shoulders, { x: 0.03, y: 0.43, z: 0.09 }),
    17: add(pose.joints[15], { x: -0.035, y: 0.02, z: 0.015 }),
    18: add(pose.joints[15], { x: 0.035, y: 0.02, z: -0.015 }),
    19: add(pose.joints[15], { x: 0, y: 0.045, z: 0 }),
    20: add(pose.joints[16], { x: -0.035, y: 0.02, z: 0.015 }),
    21: add(pose.joints[16], { x: 0.035, y: 0.02, z: -0.015 }),
    22: add(pose.joints[16], { x: 0, y: 0.045, z: 0 }),
    29: add(leftAnkle, { x: -0.06, y: -0.04, z: 0.08 }),
    30: add(rightAnkle, { x: 0.06, y: -0.04, z: 0.08 }),
    31: add(leftAnkle, { x: -0.02, y: -0.06, z: 0.18 }),
    32: add(rightAnkle, { x: 0.02, y: -0.06, z: 0.18 }),
  };
  return Array.from({ length: 33 }, (_, landmarkIndex) => {
    const sourcePoint = landmarksByIndex[landmarkIndex] ?? pose.root;
    const projection = project(sourcePoint, view, shootingHand);
    const noise = deterministicObservationNoise(view, takeIndex, frameIndex, landmarkIndex, noiseAmplitude);
    return { x: projection.x + noise.x, y: projection.y + noise.y, z: landmarkIndex * 0.0001, visibility: 0.95 };
  });
}

export function syntheticLandmarkSequence(options: SyntheticLandmarkSequenceOptions): LandmarkSequenceV2 {
  const shootingHand = options.shootingHand ?? "right";
  const takeIndex = options.takeIndex ?? 0;
  const durationScale = options.durationScale ?? 1;
  const durationMs = 2_000 * durationScale;
  const timeOffsetMs = options.timeOffsetMs ?? 0;
  const anchorScheduleShift = options.anchorScheduleShift ?? 0;
  const noiseAmplitude = options.noiseAmplitude ?? 0.000003;
  if (anchorScheduleShift < -0.2 || anchorScheduleShift > 0.2) {
    throw new Error("anchorScheduleShift must keep the canonical schedule ordered");
  }
  const frameCount = Math.round(durationMs / 1_000 * FRAME_RATE) + 1;
  const timestamps = Array.from({ length: frameCount }, (_, frameIndex) => (
    timeOffsetMs + frameIndex * 1_000 / FRAME_RATE
  ));
  const actualDurationMs = timestamps.at(-1)! - timestamps[0];
  const frames = timestamps.map((timestampMs, frameIndex) => {
    const timelinePosition = frameIndex / (frameCount - 1);
    const phase = motionPhaseAtTimelinePosition(timelinePosition, anchorScheduleShift);
    return {
      timestampMs,
      sourceLandmarks: landmarksForPose(
        syntheticPose(phase), options.view, shootingHand, takeIndex, frameIndex, noiseAmplitude,
      ),
      cropRectPx: { x: 0, y: 0, width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT },
      modelToSourcePx: [1, 0, 0, 0, 1, 0],
    };
  });
  const releaseTimelinePosition = 0.75 + anchorScheduleShift;
  const releaseFrameIndex = Math.round(releaseTimelinePosition * (frameCount - 1));
  return {
    version: 2,
    view: options.view,
    shootingHand,
    takeIndex,
    metadata: {
      durationMs: actualDurationMs,
      displayWidth: DISPLAY_WIDTH,
      displayHeight: DISPLAY_HEIGHT,
      nominalFrameRate: FRAME_RATE,
      frameRateMode: "constant",
      locatorAttemptedFrames: frameCount,
      locatorDecodedFrames: frameCount,
      locatorDetectedFrames: frameCount,
      attemptedFrames: frameCount,
      decodedFrames: frameCount,
      detectedFrames: frameCount,
      rejectedFrames: 0,
      releaseProxyTimestampMs: timestamps[releaseFrameIndex],
      attempts: timestamps.map((requestedTimestampMs) => ({
        requestedTimestampMs,
        decodedTimestampMs: requestedTimestampMs,
        detectedTimestampMs: requestedTimestampMs,
      })),
    },
    frames,
    transformConvention: "upright_source_top_left_v1",
    quality: { passed: true, reasons: [] },
  };
}

export function syntheticLandmarkSession(options: SyntheticLandmarkSessionOptions): {
  front: LandmarkSequenceV2[];
  shootingSide: LandmarkSequenceV2[];
} {
  const count = options.mode === "basic_1_plus_1" ? 1 : 3;
  const shootingHand = options.shootingHand ?? "right";
  const takeVariations = [
    { timeOffsetMs: 100, durationScale: 0.96, noiseAmplitude: 0.000002 },
    { timeOffsetMs: 1_850, durationScale: 1, noiseAmplitude: 0.000003 },
    { timeOffsetMs: 3_720, durationScale: 1.04, noiseAmplitude: 0.000004 },
  ] as const;
  const create = (view: CaptureViewV2) => takeVariations.slice(0, count).map((variation, takeIndex) => (
    syntheticLandmarkSequence({
      view,
      shootingHand,
      takeIndex: takeIndex as 0 | 1 | 2,
      timeOffsetMs: variation.timeOffsetMs + (view === "shooting_side" ? 12_000 : 0),
      durationScale: variation.durationScale,
      anchorScheduleShift: view === "shooting_side" ? options.sideAnchorScheduleShift : undefined,
      noiseAmplitude: variation.noiseAmplitude,
    })
  ));
  return { front: create("front"), shootingSide: create("shooting_side") };
}
