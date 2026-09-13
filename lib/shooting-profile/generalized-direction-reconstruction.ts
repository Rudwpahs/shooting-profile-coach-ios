import type { Vector3 } from "@/lib/pose-motion";
import type {
  DirectionReconstructionResult,
  DirectionSign,
} from "@/lib/shooting-profile/direction-reconstruction";

const EPSILON = 1e-12;
const MIN_CONDITIONING = 0.1;

export type YawProjectionObservationV1 = {
  /** Shooter-centric camera yaw in degrees. */
  yawDegrees: number;
  /** atan2(image-horizontal, image-vertical) for the observed bone. */
  angleRadians: number;
  verticalSign?: DirectionSign;
  projectionLength?: number;
};

export type GeneralizedDirectionReconstructionInputV1 = {
  first: YawProjectionObservationV1;
  second: YawProjectionObservationV1;
  verticalSign: DirectionSign;
};

function isSign(value: unknown): value is DirectionSign {
  return value === -1 || value === 1;
}

function reject(
  reason: Extract<DirectionReconstructionResult, { status: "rejected" }> ["reason"],
): DirectionReconstructionResult {
  return { status: "rejected", reason };
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(vector: Vector3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function scale(vector: Vector3, amount: number): Vector3 {
  return {
    x: vector.x * amount,
    y: vector.y * amount,
    z: vector.z * amount,
  };
}

function verticalSignFromAngle(angleRadians: number): DirectionSign | undefined {
  const vertical = Math.cos(angleRadians);
  if (Math.abs(vertical) <= EPSILON) return undefined;
  return vertical < 0 ? -1 : 1;
}

/**
 * Exact cosine/sine at quadrant yaws.
 *
 * `Math.cos(Math.PI / 2)` is 6.1e-17 rather than 0, which would leave a
 * last-bit residue in every legacy front/side reconstruction and silently move
 * existing profiles. The quadrants are exact in the geometry, so they are
 * exact here too.
 */
function yawTrigonometry(yawDegrees: number): { cosine: number; sine: number } {
  const wrapped = ((yawDegrees % 360) + 360) % 360;
  if (wrapped === 0) return { cosine: 1, sine: 0 };
  if (wrapped === 90) return { cosine: 0, sine: 1 };
  if (wrapped === 180) return { cosine: -1, sine: 0 };
  if (wrapped === 270) return { cosine: 0, sine: -1 };
  const yawRadians = yawDegrees * Math.PI / 180;
  return { cosine: Math.cos(yawRadians), sine: Math.sin(yawRadians) };
}

function projectionConstraint(
  observation: YawProjectionObservationV1,
): Vector3 {
  const { cosine: yawCosine, sine: yawSine } = yawTrigonometry(observation.yawDegrees);
  const cosine = Math.cos(observation.angleRadians);
  return {
    x: yawCosine * cosine,
    y: -Math.sin(observation.angleRadians),
    z: yawSine * cosine,
  };
}

/**
 * How much of a reconstructed direction survives in one view's image plane.
 * A bone parallel to a view's camera axis leaves no usable projection there,
 * which is the yaw-general form of the legacy collapsed-projection guards.
 */
function inPlaneProjectionLength(direction: Vector3, yawDegrees: number): number {
  const { cosine, sine } = yawTrigonometry(yawDegrees);
  return Math.hypot(cosine * direction.x + sine * direction.z, direction.y);
}

function validateObservation(
  observation: YawProjectionObservationV1,
): boolean {
  return Number.isFinite(observation.yawDegrees)
    && Number.isFinite(observation.angleRadians)
    && (observation.projectionLength === undefined
      || Number.isFinite(observation.projectionLength));
}

export function reconstructBoneDirectionFromYawViews(
  input: GeneralizedDirectionReconstructionInputV1,
): DirectionReconstructionResult {
  if (!validateObservation(input.first) || !validateObservation(input.second)) {
    return reject("non_finite_input");
  }
  if (!isSign(input.verticalSign)
    || (input.first.verticalSign !== undefined && !isSign(input.first.verticalSign))
    || (input.second.verticalSign !== undefined && !isSign(input.second.verticalSign))) {
    return reject("invalid_vertical_sign");
  }
  if ((input.first.projectionLength ?? 1) <= EPSILON) {
    return reject("collapsed_front_projection");
  }
  if ((input.second.projectionLength ?? 1) <= EPSILON) {
    return reject("collapsed_side_projection");
  }

  const firstHorizontal = Math.abs(Math.cos(input.first.angleRadians)) <= EPSILON;
  const secondHorizontal = Math.abs(Math.cos(input.second.angleRadians)) <= EPSILON;
  if (firstHorizontal && secondHorizontal) {
    return reject("both_views_horizontal");
  }

  const inferredFirstSign = verticalSignFromAngle(input.first.angleRadians);
  const inferredSecondSign = verticalSignFromAngle(input.second.angleRadians);
  if (
    (input.first.verticalSign !== undefined
      && inferredFirstSign !== undefined
      && input.first.verticalSign !== inferredFirstSign)
    || (input.second.verticalSign !== undefined
      && inferredSecondSign !== undefined
      && input.second.verticalSign !== inferredSecondSign)
  ) {
    return reject("vertical_sign_disagreement");
  }

  const firstVerticalSign = input.first.verticalSign ?? inferredFirstSign;
  const secondVerticalSign = input.second.verticalSign ?? inferredSecondSign;
  if (
    (firstVerticalSign !== undefined && firstVerticalSign !== input.verticalSign)
    || (secondVerticalSign !== undefined && secondVerticalSign !== input.verticalSign)
    || (firstVerticalSign !== undefined
      && secondVerticalSign !== undefined
      && firstVerticalSign !== secondVerticalSign)
  ) {
    return reject("vertical_sign_disagreement");
  }

  const firstConstraint = projectionConstraint(input.first);
  const secondConstraint = projectionConstraint(input.second);
  const raw = cross(firstConstraint, secondConstraint);
  const rawLength = length(raw);
  const conditioning = rawLength / Math.max(
    EPSILON,
    length(firstConstraint) * length(secondConstraint),
  );
  if (!Number.isFinite(conditioning) || conditioning < MIN_CONDITIONING) {
    return reject("ill_conditioned_projection_constraints");
  }

  const normalized = scale(raw, 1 / rawLength);
  if (inPlaneProjectionLength(normalized, input.first.yawDegrees) <= EPSILON) {
    return reject("collapsed_front_projection");
  }
  if (inPlaneProjectionLength(normalized, input.second.yawDegrees) <= EPSILON) {
    return reject("collapsed_side_projection");
  }
  const direction = Math.sign(normalized.y) === input.verticalSign
    ? normalized
    : scale(normalized, -1);
  if (
    !Number.isFinite(direction.x)
    || !Number.isFinite(direction.y)
    || !Number.isFinite(direction.z)
  ) {
    return reject("non_finite_input");
  }

  return { status: "accepted", direction, conditioning };
}
