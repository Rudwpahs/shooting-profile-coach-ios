import {
  projectRepresentativeJoints,
  type RepresentativeDisplayJointName,
  type RepresentativeViewId,
} from "@/components/shooting-profile/sequence-viewer";
import type {
  PersistedJointNameV2,
  RepresentativePose4DV2,
  ShootingHandV2,
} from "@/lib/shooting-profile/types";

export type PhaseSpacePoint = Readonly<{ x: number; y: number; z: number }>;
export type PhaseSpaceCamera = Readonly<{
  yawDegrees: number;
  pitchDegrees: number;
  zoom: number;
}>;

export type PhaseSpaceAnchorId =
  | "ready"
  | "deepestDip"
  | "rise"
  | "releaseProxy"
  | "followThrough";

export type PhaseSpaceAnchor = Readonly<{
  id: PhaseSpaceAnchorId;
  phase: number;
  frameIndex: number;
}>;

export type PhaseSpaceFrame = Readonly<{
  phase: number;
  joints: Readonly<Record<RepresentativeDisplayJointName, PhaseSpacePoint>>;
}>;

export type PhaseSpaceGeometry = Readonly<{
  frameCount: 101;
  axis: Readonly<{
    kind: "normalized_shot_phase";
    label: "SHOT PHASE";
  }>;
  trajectories: Readonly<Record<PersistedJointNameV2, readonly PhaseSpacePoint[]>>;
  frames: readonly PhaseSpaceFrame[];
  ghostFrameIndices: readonly number[];
  anchors: readonly PhaseSpaceAnchor[];
}>;

const FRAME_COUNT = 101;
const LAST_FRAME_INDEX = FRAME_COUNT - 1;
const REQUIRED_ANCHORS: readonly PhaseSpaceAnchorId[] = [
  "ready",
  "deepestDip",
  "rise",
  "releaseProxy",
  "followThrough",
];

function assertFinite(values: readonly number[], message: string): void {
  if (!values.every(Number.isFinite)) throw new Error(message);
}

export function selectGhostFrameIndices(frameCount: number, ghostCount = 11): number[] {
  if (frameCount !== FRAME_COUNT) {
    throw new Error("phase space requires exactly 101 stored frames");
  }
  if (!Number.isFinite(ghostCount)) throw new Error("ghost count must be finite");
  const count = Math.max(2, Math.min(13, Math.round(ghostCount)));
  return Array.from(
    { length: count },
    (_, index) => Math.round((index * LAST_FRAME_INDEX) / (count - 1)),
  );
}

function anchorFrameIndex(phase: number): number {
  if (!Number.isFinite(phase)) throw new Error("phase anchor must be finite");
  return Math.max(0, Math.min(LAST_FRAME_INDEX, Math.round(phase * LAST_FRAME_INDEX)));
}

export function buildPhaseSpaceGeometry(
  profile: RepresentativePose4DV2,
  sourceView: RepresentativeViewId,
  shootingHand: ShootingHandV2,
  ghostCount = 11,
): PhaseSpaceGeometry {
  if (!profile || profile.timeBasis !== "normalized_shot_phase" || profile.frames.length !== FRAME_COUNT) {
    throw new Error("phase space requires exactly 101 normalized shot phases");
  }
  if (profile.boundary !== "representative_phase_fused_4d_estimate_not_actual_3d") {
    throw new Error("phase space requires the representative evidence boundary");
  }

  const frames = profile.frames.map((frame, frameIndex): PhaseSpaceFrame => {
    if (!frame || !Number.isFinite(frame.phase)) {
      throw new Error("phase space requires finite stored phases");
    }
    const projected = projectRepresentativeJoints(frame, sourceView, shootingHand);
    const joints = Object.fromEntries(
      Object.entries(projected).map(([joint, point]) => {
        assertFinite([point.x, point.y, frame.phase], `${joint} phase-space point must be finite`);
        return [joint, { x: point.x, y: point.y, z: frame.phase } satisfies PhaseSpacePoint];
      }),
    ) as Record<RepresentativeDisplayJointName, PhaseSpacePoint>;

    if (frameIndex === 0 && frame.phase !== 0) {
      throw new Error("phase space first stored phase must be 0");
    }
    if (frameIndex === LAST_FRAME_INDEX && frame.phase !== 1) {
      throw new Error("phase space last stored phase must be 1");
    }
    return { phase: frame.phase, joints };
  });

  const trajectory = (joint: PersistedJointNameV2): readonly PhaseSpacePoint[] => (
    frames.map((frame) => frame.joints[joint])
  );
  const trajectories: Record<PersistedJointNameV2, readonly PhaseSpacePoint[]> = {
    leftShoulder: trajectory("leftShoulder"),
    leftElbow: trajectory("leftElbow"),
    leftWrist: trajectory("leftWrist"),
    rightShoulder: trajectory("rightShoulder"),
    rightElbow: trajectory("rightElbow"),
    rightWrist: trajectory("rightWrist"),
    leftHip: trajectory("leftHip"),
    leftKnee: trajectory("leftKnee"),
    leftAnkle: trajectory("leftAnkle"),
    rightHip: trajectory("rightHip"),
    rightKnee: trajectory("rightKnee"),
    rightAnkle: trajectory("rightAnkle"),
  };

  const anchorsById = new Map(profile.phaseAnchors.map((anchor) => [anchor.id, anchor]));
  const anchors = REQUIRED_ANCHORS.map((id) => {
    const anchor = anchorsById.get(id);
    if (!anchor) throw new Error(`phase space is missing ${id} anchor`);
    return { id, phase: anchor.phase, frameIndex: anchorFrameIndex(anchor.phase) };
  });

  return {
    frameCount: FRAME_COUNT,
    axis: { kind: "normalized_shot_phase", label: "SHOT PHASE" },
    trajectories,
    frames,
    ghostFrameIndices: selectGhostFrameIndices(FRAME_COUNT, ghostCount),
    anchors,
  };
}

export function projectPhaseSpacePoint(
  point: PhaseSpacePoint,
  camera: PhaseSpaceCamera,
  width: number,
  height: number,
): { x: number; y: number; depth: number } {
  assertFinite(
    [point.x, point.y, point.z, camera.yawDegrees, camera.pitchDegrees, camera.zoom, width, height],
    "phase-space projection inputs must be finite",
  );
  if (width <= 0 || height <= 0) throw new Error("phase-space viewport must be positive");

  const zoom = Math.max(0.75, Math.min(1.8, camera.zoom));
  const yaw = camera.yawDegrees * Math.PI / 180;
  const pitch = camera.pitchDegrees * Math.PI / 180;

  const centeredZ = (point.z - 0.5) * 1.8;
  const yawX = point.x * Math.cos(yaw) - centeredZ * Math.sin(yaw);
  const yawZ = point.x * Math.sin(yaw) + centeredZ * Math.cos(yaw);
  const pitchY = point.y * Math.cos(pitch) - yawZ * Math.sin(pitch);
  const pitchZ = point.y * Math.sin(pitch) + yawZ * Math.cos(pitch);
  const perspective = 1 / Math.max(0.55, 1 + pitchZ * 0.22);
  const scale = Math.min(width, height) * 0.34 * zoom * perspective;

  const projected = {
    x: width / 2 + yawX * scale,
    y: height * 0.7 - pitchY * scale,
    depth: pitchZ,
  };
  assertFinite(Object.values(projected), "phase-space projection must be finite");
  return projected;
}
