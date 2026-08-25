import type { Vector3 } from "@/lib/pose-motion";
import type { SourceObservation2DV2 } from "@/lib/shooting-profile/coordinate-space";
import { ENGINEERING_THRESHOLDS_V1 } from "@/lib/shooting-profile/engineering-thresholds";
import type { CaptureViewV2, JointUncertaintyV2 } from "@/lib/shooting-profile/types";

export type DeterministicPerturbationPatternV1 = Readonly<{
  id: string;
  coordinatePattern: 0 | 1 | 2;
  coordinateSign: -1 | 0 | 1;
  frontPhaseDirection: -1 | 0 | 1;
  shootingSidePhaseDirection: -1 | 0 | 1;
}>;

/**
 * Fixed symmetric sensitivity table. Coordinate-only rows isolate landmark
 * sensitivity, phase-only rows isolate local phase sensitivity, and the two
 * paired combined patterns expose their interaction. No row is randomized.
 */
export const DETERMINISTIC_PERTURBATION_SCENARIOS_V1 = Object.freeze([
  Object.freeze({ id: "baseline", coordinatePattern: 0, coordinateSign: 0, frontPhaseDirection: 0, shootingSidePhaseDirection: 0 }),
  Object.freeze({ id: "landmark_a_plus", coordinatePattern: 0, coordinateSign: 1, frontPhaseDirection: 0, shootingSidePhaseDirection: 0 }),
  Object.freeze({ id: "landmark_a_minus", coordinatePattern: 0, coordinateSign: -1, frontPhaseDirection: 0, shootingSidePhaseDirection: 0 }),
  Object.freeze({ id: "phase_opposed_plus", coordinatePattern: 0, coordinateSign: 0, frontPhaseDirection: 1, shootingSidePhaseDirection: -1 }),
  Object.freeze({ id: "phase_opposed_minus", coordinatePattern: 0, coordinateSign: 0, frontPhaseDirection: -1, shootingSidePhaseDirection: 1 }),
  Object.freeze({ id: "combined_b_front_plus", coordinatePattern: 1, coordinateSign: 1, frontPhaseDirection: 1, shootingSidePhaseDirection: 0 }),
  Object.freeze({ id: "combined_b_front_minus", coordinatePattern: 1, coordinateSign: -1, frontPhaseDirection: -1, shootingSidePhaseDirection: 0 }),
  Object.freeze({ id: "combined_c_side_plus", coordinatePattern: 2, coordinateSign: 1, frontPhaseDirection: 0, shootingSidePhaseDirection: 1 }),
  Object.freeze({ id: "combined_c_side_minus", coordinatePattern: 2, coordinateSign: -1, frontPhaseDirection: 0, shootingSidePhaseDirection: -1 }),
] as const satisfies readonly DeterministicPerturbationPatternV1[]);

export type DeterministicUncertaintyScenarioV1 = Readonly<{
  id: string;
  frontAttemptId: string;
  shootingSideAttemptId: string;
  frontPhaseIndexShift: number;
  shootingSidePhaseIndexShift: number;
  pattern: DeterministicPerturbationPatternV1;
}>;

export type DeterministicUncertaintyScenarioPlanInputV1 = Readonly<{
  frontAttemptIds: readonly string[];
  shootingSideAttemptIds: readonly string[];
  phaseIndexRadius: number;
}>;

function stableStringCompare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sortedUniqueAttemptIds(ids: readonly string[], label: string): string[] {
  if (ids.length === 0 || ids.some((id) => id.length === 0) || new Set(ids).size !== ids.length) {
    throw new Error(`${label} attempt IDs must be unique and nonempty`);
  }
  return [...ids].sort(stableStringCompare);
}

export function buildDeterministicUncertaintyScenarioPlan(
  input: DeterministicUncertaintyScenarioPlanInputV1,
): readonly DeterministicUncertaintyScenarioV1[] {
  const config = ENGINEERING_THRESHOLDS_V1.uncertaintyPerturbation;
  if (
    !Number.isInteger(input.phaseIndexRadius)
    || input.phaseIndexRadius < config.minimumPhaseIndexRadius
    || input.phaseIndexRadius > config.maximumPhaseIndexRadius
    || DETERMINISTIC_PERTURBATION_SCENARIOS_V1.length !== config.scenarioPatternCount
  ) {
    throw new Error("invalid deterministic uncertainty scenario configuration");
  }
  const frontAttemptIds = sortedUniqueAttemptIds(input.frontAttemptIds, "front");
  const shootingSideAttemptIds = sortedUniqueAttemptIds(
    input.shootingSideAttemptIds,
    "shooting-side",
  );
  const scenarios = frontAttemptIds.flatMap((frontAttemptId) => (
    shootingSideAttemptIds.flatMap((shootingSideAttemptId) => (
      DETERMINISTIC_PERTURBATION_SCENARIOS_V1.map((pattern) => Object.freeze({
        id: `${frontAttemptId}|${shootingSideAttemptId}|${pattern.id}`,
        frontAttemptId,
        shootingSideAttemptId,
        frontPhaseIndexShift: pattern.frontPhaseDirection * input.phaseIndexRadius,
        shootingSidePhaseIndexShift:
          pattern.shootingSidePhaseDirection * input.phaseIndexRadius,
        pattern,
      }))
    ))
  ));
  return Object.freeze(scenarios);
}

const LANDMARK_OFFSET_DIRECTIONS_V1 = Object.freeze([
  Object.freeze({ x: 1, y: 0 }),
  Object.freeze({ x: 0, y: 1 }),
  Object.freeze({ x: -1, y: 0 }),
  Object.freeze({ x: 0, y: -1 }),
] as const);

const COORDINATE_PATTERN_TRANSFORMS_V1 = Object.freeze([
  Object.freeze({ xx: 1, xy: 0, yx: 0, yy: 1 }),
  Object.freeze({ xx: 0, xy: -1, yx: 1, yy: 0 }),
  Object.freeze({ xx: Math.SQRT1_2, xy: -Math.SQRT1_2, yx: Math.SQRT1_2, yy: Math.SQRT1_2 }),
] as const);

export type PerturbedSourceObservation2DV1 = Readonly<{
  point: SourceObservation2DV2;
  offsetMagnitude: number;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Applies one coherent offset per landmark; shared bone endpoints reuse it. */
export function perturbSourceObservation2D(
  point: SourceObservation2DV2,
  landmarkIndex: number,
  view: CaptureViewV2,
  pattern: DeterministicPerturbationPatternV1,
): PerturbedSourceObservation2DV1 | undefined {
  const config = ENGINEERING_THRESHOLDS_V1.uncertaintyPerturbation;
  const visibility = point.visibility ?? 0;
  if (
    !Number.isFinite(point.x)
    || !Number.isFinite(point.y)
    || !Number.isFinite(visibility)
    || visibility < 0
    || visibility > 1
    || !Number.isInteger(landmarkIndex)
    || landmarkIndex < 0
  ) {
    return undefined;
  }
  if (pattern.coordinateSign === 0) {
    return Object.freeze({ point: Object.freeze({ ...point }), offsetMagnitude: 0 });
  }
  const visibilityScale = 1 + (1 - visibility) * config.visibilityAmplification;
  const offsetMagnitude = clamp(
    config.landmarkOffsetSourceHeightUnits * visibilityScale,
    0,
    config.maximumLandmarkOffsetSourceHeightUnits,
  );
  const direction = LANDMARK_OFFSET_DIRECTIONS_V1[
    landmarkIndex % LANDMARK_OFFSET_DIRECTIONS_V1.length
  ];
  const transform = COORDINATE_PATTERN_TRANSFORMS_V1[pattern.coordinatePattern];
  const viewSign = view === "front" ? 1 : -1;
  const transformed = {
    x: (transform.xx * direction.x + transform.xy * direction.y) * viewSign,
    y: transform.yx * direction.x + transform.yy * direction.y,
  };
  const signedMagnitude = pattern.coordinateSign * offsetMagnitude;
  const perturbed = {
    ...point,
    x: point.x + transformed.x * signedMagnitude,
    y: point.y + transformed.y * signedMagnitude,
  };
  if (!Number.isFinite(perturbed.x) || !Number.isFinite(perturbed.y)) return undefined;
  return Object.freeze({
    point: Object.freeze(perturbed),
    offsetMagnitude,
  });
}

export type PackedCovarianceV1 = JointUncertaintyV2["covariance"];

/**
 * Two-pass sample covariance plus a nonnegative isotropic engineering floor.
 * A sum of centered outer products and a nonnegative diagonal is PSD by
 * construction; no eigenvalue or determinant repair is performed.
 */
export function sampleCovarianceWithIsotropicFloor(
  samples: readonly Vector3[],
  isotropicFloorVariance: number,
): PackedCovarianceV1 {
  if (
    samples.length < 2
    || !Number.isFinite(isotropicFloorVariance)
    || isotropicFloorVariance < 0
    || samples.some((sample) => (
      !Number.isFinite(sample.x) || !Number.isFinite(sample.y) || !Number.isFinite(sample.z)
    ))
  ) {
    throw new Error("sample covariance requires finite samples and a nonnegative floor");
  }
  const mean = samples.reduce((sum, sample) => ({
    x: sum.x + sample.x / samples.length,
    y: sum.y + sample.y / samples.length,
    z: sum.z + sample.z / samples.length,
  }), { x: 0, y: 0, z: 0 });
  const sums = samples.reduce((sum, sample) => {
    const x = sample.x - mean.x;
    const y = sample.y - mean.y;
    const z = sample.z - mean.z;
    return {
      xx: sum.xx + x * x,
      xy: sum.xy + x * y,
      xz: sum.xz + x * z,
      yy: sum.yy + y * y,
      yz: sum.yz + y * z,
      zz: sum.zz + z * z,
    };
  }, { xx: 0, xy: 0, xz: 0, yy: 0, yz: 0, zz: 0 });
  const denominator = samples.length - 1;
  const covariance: PackedCovarianceV1 = [
    sums.xx / denominator + isotropicFloorVariance,
    sums.xy / denominator,
    sums.xz / denominator,
    sums.yy / denominator + isotropicFloorVariance,
    sums.yz / denominator,
    sums.zz / denominator + isotropicFloorVariance,
  ];
  if (!covariance.every(Number.isFinite)) throw new Error("sample covariance is nonfinite");
  return covariance;
}
