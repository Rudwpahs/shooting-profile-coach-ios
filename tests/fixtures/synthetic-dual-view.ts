import type { NormalizedViewAttemptV2 } from "@/lib/shooting-profile/repeated-shot";
import type { CaptureProtocolV2, CaptureViewV2, ShootingHandV2 } from "@/lib/shooting-profile/types";

type Vector3 = { x: number; y: number; z: number };

export type SyntheticDualViewSessionOptions = {
  mode: CaptureProtocolV2;
  corruptTake?: boolean;
  noAgreeingSubset?: boolean;
  shootingHand?: ShootingHandV2;
  directionSpikeAtPhaseIndex?: number;
};

export type SyntheticDualViewSession = {
  mode: CaptureProtocolV2;
  frontAttempts: readonly NormalizedViewAttemptV2[];
  shootingSideAttempts: readonly NormalizedViewAttemptV2[];
  rootMotion?: { status: "unavailable" };
};

export const SYNTHETIC_TEMPLATE_LENGTHS = Object.freeze({
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
});

const ANCHOR_IDS = ["ready", "deepestDip", "rise", "releaseProxy", "followThrough"] as const;
const ANCHOR_PHASES = [0, 0.25, 0.5, 0.75, 1] as const;

function add(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(vector: Vector3, amount: number): Vector3 {
  return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount };
}

function unit(vector: Vector3): Vector3 {
  const magnitude = Math.hypot(vector.x, vector.y, vector.z);
  return scale(vector, 1 / magnitude);
}

function subtract(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function syntheticPose(phase: number): { root: Vector3; joints: Record<number, Vector3> } {
  const root = {
    x: 0.055 * phase,
    y: 0.075 * Math.sin(Math.PI * phase),
    z: -0.04 * phase,
  };
  const hipLine = unit({ x: 0.92, y: 0.18, z: 0.34 });
  const leftHip = add(root, scale(hipLine, -SYNTHETIC_TEMPLATE_LENGTHS.pelvis_to_left_hip));
  const rightHip = add(root, scale(hipLine, SYNTHETIC_TEMPLATE_LENGTHS.pelvis_to_right_hip));
  const leftShoulder = add(leftHip, scale(unit({ x: -0.16, y: 0.96, z: -0.23 }), SYNTHETIC_TEMPLATE_LENGTHS.left_torso));
  const rightShoulder = add(rightHip, scale(unit({ x: 0.15, y: 0.93, z: 0.31 }), SYNTHETIC_TEMPLATE_LENGTHS.right_torso));
  const lift = 0.14 * Math.sin(Math.PI * phase);
  const leftElbow = add(leftShoulder, scale(unit({ x: -0.55, y: 0.63 + lift, z: 0.45 }), SYNTHETIC_TEMPLATE_LENGTHS.left_upper_arm));
  const leftWrist = add(leftElbow, scale(unit({ x: -0.28, y: 0.82 + lift, z: 0.49 }), SYNTHETIC_TEMPLATE_LENGTHS.left_forearm));
  const rightElbow = add(rightShoulder, scale(unit({ x: 0.42, y: 0.57 + lift, z: 0.58 }), SYNTHETIC_TEMPLATE_LENGTHS.right_upper_arm));
  const rightWrist = add(rightElbow, scale(unit({ x: 0.18, y: 0.80 + lift, z: 0.56 }), SYNTHETIC_TEMPLATE_LENGTHS.right_forearm));
  const leftKnee = add(leftHip, scale(unit({ x: -0.11, y: -0.98, z: -0.15 }), SYNTHETIC_TEMPLATE_LENGTHS.left_thigh));
  const leftAnkle = add(leftKnee, scale(unit({ x: 0.05, y: -0.99, z: 0.10 }), SYNTHETIC_TEMPLATE_LENGTHS.left_shin));
  const rightKnee = add(rightHip, scale(unit({ x: 0.12, y: -0.98, z: 0.14 }), SYNTHETIC_TEMPLATE_LENGTHS.right_thigh));
  const rightAnkle = add(rightKnee, scale(unit({ x: -0.04, y: -0.99, z: -0.11 }), SYNTHETIC_TEMPLATE_LENGTHS.right_shin));

  return {
    root,
    joints: {
      11: leftShoulder,
      12: rightShoulder,
      13: leftElbow,
      14: rightElbow,
      15: leftWrist,
      16: rightWrist,
      23: leftHip,
      24: rightHip,
      25: leftKnee,
      26: rightKnee,
      27: leftAnkle,
      28: rightAnkle,
    },
  };
}

export function syntheticTruthDirectionsAtPhase(phase: number): Record<keyof typeof SYNTHETIC_TEMPLATE_LENGTHS, Vector3> {
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

function project(point: Vector3, view: CaptureViewV2): { x: number; y: number } {
  const horizontal = view === "front" ? point.x : point.z;
  return {
    x: 0.5 + horizontal * 0.12,
    y: 0.72 - point.y * 0.12,
  };
}

function rotateAbout(
  point: { x: number; y: number },
  center: { x: number; y: number },
  radians: number,
): { x: number; y: number } {
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x: center.x + x * Math.cos(radians) - y * Math.sin(radians),
    y: center.y + x * Math.sin(radians) + y * Math.cos(radians),
  };
}

function deterministicObservationNoise(
  view: CaptureViewV2,
  takeIndex: number,
  frameIndex: number,
  landmarkIndex: number,
): { x: number; y: number } {
  const viewSeed = view === "front" ? 17 : 43;
  const seed = viewSeed + takeIndex * 131 + frameIndex * 7 + landmarkIndex * 19;
  return {
    x: Math.sin(seed * 0.73) * 0.00002,
    y: Math.cos(seed * 0.61) * 0.00002,
  };
}

function syntheticAttempt(
  id: string,
  view: CaptureViewV2,
  shootingHand: ShootingHandV2,
  takeIndex: 0 | 1 | 2,
  rotationRadians: number,
  directionSpikeAtPhaseIndex?: number,
): NormalizedViewAttemptV2 {
  const durationMs = 900 + takeIndex * 170 + (view === "shooting_side" ? 230 : 0);
  const offsetMs = 100 + takeIndex * 1_700 + (view === "shooting_side" ? 12_000 : 0);
  return {
    id,
    phaseAnchors: ANCHOR_IDS.map((anchorId, index) => ({
      id: anchorId,
      phase: ANCHOR_PHASES[index],
      timestampMs: offsetMs + ANCHOR_PHASES[index] * durationMs,
    })),
    frames: Array.from({ length: 101 }, (_, frameIndex) => {
      const phase = frameIndex / 100;
      const pose = syntheticPose(phase).joints;
      const pelvisCenter = scale(add(pose[23], pose[24]), 0.5);
      const projectedCenter = project(pelvisCenter, view);
      const frameRotation = rotationRadians
        + (frameIndex === directionSpikeAtPhaseIndex ? 0.60 : 0);
      return {
        phase,
        sourceTimestampMs: offsetMs + phase * durationMs,
        view,
        shootingHand,
        takeIndex,
        sourceLandmarks: Array.from({ length: 29 }, (_, landmarkIndex) => {
          const sourcePoint = pose[landmarkIndex] ?? pelvisCenter;
          const rotated = rotateAbout(project(sourcePoint, view), projectedCenter, frameRotation);
          const noise = deterministicObservationNoise(view, takeIndex, frameIndex, landmarkIndex);
          return {
            x: rotated.x + noise.x,
            y: rotated.y + noise.y,
            visibility: 0.96,
          };
        }),
      };
    }),
  };
}

function takeRotations(
  options: SyntheticDualViewSessionOptions,
  count: number,
  view: CaptureViewV2,
): number[] {
  if (count === 1) return [0];
  if (options.noAgreeingSubset) return view === "front" ? [0, 0.30, 0.60] : [-0.60, -0.30, 0];
  if (options.corruptTake) {
    return view === "front" ? [0, 0.015, 0.35] : [-0.35, 0, 0.015];
  }
  return view === "front" ? [0, 0.015, 0.030] : [0.005, 0.020, 0.035];
}

export function syntheticDualViewSession(
  options: SyntheticDualViewSessionOptions,
): SyntheticDualViewSession {
  const shootingHand = options.shootingHand ?? "right";
  const count = options.mode === "basic_1_plus_1" ? 1 : 3;
  const makeAttempts = (view: CaptureViewV2) => takeRotations(options, count, view).map((rotation, takeIndex) => (
    syntheticAttempt(
      `${view}-${takeIndex}`,
      view,
      shootingHand,
      takeIndex as 0 | 1 | 2,
      rotation,
      options.directionSpikeAtPhaseIndex,
    )
  ));
  return {
    mode: options.mode,
    frontAttempts: makeAttempts("front"),
    shootingSideAttempts: makeAttempts("shooting_side"),
  };
}
