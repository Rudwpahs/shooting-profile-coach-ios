import type {
  PersistedJointNameV2,
  RepresentativePose4DV2,
} from "@/lib/shooting-profile/types";

const PERSISTED_JOINTS = [
  "leftShoulder", "leftElbow", "leftWrist",
  "rightShoulder", "rightElbow", "rightWrist",
  "leftHip", "leftKnee", "leftAnkle",
  "rightHip", "rightKnee", "rightAnkle",
] as const satisfies readonly PersistedJointNameV2[];

export function syntheticRepresentativeProfile(): RepresentativePose4DV2 {
  return {
    schemaVersion: 2,
    boundary: "representative_phase_fused_4d_estimate_not_actual_3d",
    mode: "high_accuracy_3_plus_3",
    timeBasis: "normalized_shot_phase",
    units: "template_shoulder_breadths",
    frames: Array.from({ length: 101 }, (_, index) => ({
      phase: index / 100,
      joints: Object.fromEntries(PERSISTED_JOINTS.map((joint, jointIndex) => [joint, {
        x: (jointIndex % 2 === 0 ? -1 : 1) * (0.25 + index / 1000),
        y: 0.2 + jointIndex * 0.11 + index / 500,
        z: (jointIndex - 5) * 0.04,
      }])) as RepresentativePose4DV2["frames"][number]["joints"],
      uncertainty: Object.fromEntries(PERSISTED_JOINTS.map((joint) => [joint, {
        model: "heuristic_v1" as const,
        covariance: [0.01, 0, 0, 0.01, 0, 0.01] as [number, number, number, number, number, number],
        directionalConeDegrees: 9,
      }])) as RepresentativePose4DV2["frames"][number]["uncertainty"],
    })),
    phaseAnchors: [
      { id: "ready", phase: 0 },
      { id: "deepestDip", phase: 0.25 },
      { id: "rise", phase: 0.5 },
      { id: "releaseProxy", phase: 0.75 },
      { id: "followThrough", phase: 1 },
    ],
    quality: { passed: true, reasons: [] },
  };
}
