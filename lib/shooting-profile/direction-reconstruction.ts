import type { Vector3 } from "@/lib/pose-motion";

const EPSILON = 1e-12;
const MIN_CONDITIONING = 0.1;

export type DirectionSign = -1 | 1;

export type DirectionReconstructionInput = {
  alpha: number;
  beta: number;
  verticalSign: DirectionSign;
  sideAxisSign: DirectionSign;
  frontVerticalSign?: DirectionSign;
  sideVerticalSign?: DirectionSign;
  frontProjectionLength?: number;
  sideProjectionLength?: number;
};

export type DirectionRejectionReason =
  | "non_finite_input"
  | "invalid_vertical_sign"
  | "invalid_side_axis_sign"
  | "vertical_sign_disagreement"
  | "collapsed_front_projection"
  | "collapsed_side_projection"
  | "both_views_horizontal"
  | "ill_conditioned_projection_constraints";

export type DirectionReconstructionResult =
  | { status: "accepted"; direction: Vector3; conditioning: number }
  | { status: "rejected"; reason: DirectionRejectionReason };

function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
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

function isSign(value: unknown): value is DirectionSign {
  return value === -1 || value === 1;
}

function reject(reason: DirectionRejectionReason): DirectionReconstructionResult {
  return { status: "rejected", reason };
}

function verticalSignFromAngle(angle: number): DirectionSign | undefined {
  const vertical = Math.cos(angle);
  if (Math.abs(vertical) <= EPSILON) return undefined;
  return vertical < 0 ? -1 : 1;
}

function hasFiniteCoordinates(vector: Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

export function reconstructBoneDirection(
  input: DirectionReconstructionInput,
): DirectionReconstructionResult {
  const projectionLengths = [input.frontProjectionLength, input.sideProjectionLength]
    .filter((value): value is number => value !== undefined);
  if (
    !Number.isFinite(input.alpha)
    || !Number.isFinite(input.beta)
    || projectionLengths.some((value) => !Number.isFinite(value))
  ) {
    return reject("non_finite_input");
  }
  if (!isSign(input.verticalSign) || (
    input.frontVerticalSign !== undefined && !isSign(input.frontVerticalSign)
  ) || (
    input.sideVerticalSign !== undefined && !isSign(input.sideVerticalSign)
  )) {
    return reject("invalid_vertical_sign");
  }
  if (!isSign(input.sideAxisSign)) {
    return reject("invalid_side_axis_sign");
  }
  if ((input.frontProjectionLength ?? 1) <= EPSILON) {
    return reject("collapsed_front_projection");
  }
  if ((input.sideProjectionLength ?? 1) <= EPSILON) {
    return reject("collapsed_side_projection");
  }

  const frontHorizontal = Math.abs(Math.cos(input.alpha)) <= EPSILON;
  const sideHorizontal = Math.abs(Math.cos(input.beta)) <= EPSILON;
  if (frontHorizontal && sideHorizontal) {
    return reject("both_views_horizontal");
  }

  const inferredFrontSign = verticalSignFromAngle(input.alpha);
  const inferredSideSign = verticalSignFromAngle(input.beta);
  if (
    (input.frontVerticalSign !== undefined
      && inferredFrontSign !== undefined
      && input.frontVerticalSign !== inferredFrontSign)
    || (input.sideVerticalSign !== undefined
      && inferredSideSign !== undefined
      && input.sideVerticalSign !== inferredSideSign)
  ) {
    return reject("vertical_sign_disagreement");
  }
  const frontVerticalSign = input.frontVerticalSign ?? inferredFrontSign;
  const sideVerticalSign = input.sideVerticalSign ?? inferredSideSign;
  if (
    (frontVerticalSign !== undefined && frontVerticalSign !== input.verticalSign)
    || (sideVerticalSign !== undefined && sideVerticalSign !== input.verticalSign)
    || (frontVerticalSign !== undefined
      && sideVerticalSign !== undefined
      && frontVerticalSign !== sideVerticalSign)
  ) {
    return reject("vertical_sign_disagreement");
  }

  const alpha = input.alpha;
  const beta = input.beta * input.sideAxisSign;
  const frontConstraint: Vector3 = { x: Math.cos(alpha), y: -Math.sin(alpha), z: 0 };
  const sideConstraint: Vector3 = { x: 0, y: -Math.sin(beta), z: Math.cos(beta) };
  const raw = cross(frontConstraint, sideConstraint);
  const rawLength = length(raw);
  const conditioning = rawLength / Math.max(
    EPSILON,
    length(frontConstraint) * length(sideConstraint),
  );
  if (!Number.isFinite(conditioning) || conditioning < MIN_CONDITIONING) {
    return reject("ill_conditioned_projection_constraints");
  }

  const normalized = scale(raw, 1 / rawLength);
  if (Math.hypot(normalized.x, normalized.y) <= EPSILON) {
    return reject("collapsed_front_projection");
  }
  if (Math.hypot(normalized.y, normalized.z) <= EPSILON) {
    return reject("collapsed_side_projection");
  }
  const direction = Math.sign(normalized.y) === input.verticalSign
    ? normalized
    : scale(normalized, -1);
  return { status: "accepted", direction, conditioning };
}

export function angleBetweenDirections(a: Vector3, b: Vector3): number {
  if (!hasFiniteCoordinates(a) || !hasFiniteCoordinates(b)) {
    throw new Error("directions must contain finite coordinates");
  }
  const aScale = Math.max(Math.abs(a.x), Math.abs(a.y), Math.abs(a.z));
  const bScale = Math.max(Math.abs(b.x), Math.abs(b.y), Math.abs(b.z));
  if (aScale === 0 || bScale === 0) {
    throw new Error("directions must be nonzero");
  }
  const scaledA = { x: a.x / aScale, y: a.y / aScale, z: a.z / aScale };
  const scaledB = { x: b.x / bScale, y: b.y / bScale, z: b.z / bScale };
  const normalizedA = scale(scaledA, 1 / length(scaledA));
  const normalizedB = scale(scaledB, 1 / length(scaledB));
  const crossLength = length(cross(normalizedA, normalizedB));
  const clampedDot = Math.max(-1, Math.min(1, dot(normalizedA, normalizedB)));
  return Math.atan2(crossLength, clampedDot);
}
