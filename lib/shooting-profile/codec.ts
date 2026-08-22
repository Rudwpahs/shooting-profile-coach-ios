import { z } from "zod";

import { PERSISTED_JOINT_NAMES_V2, type RepresentativePose4DV2 } from "@/lib/shooting-profile/types";

const finiteNumber = z.number().finite();
const PHASE_GRID_TOLERANCE = 1e-12;
const COVARIANCE_PSD_TOLERANCE = 1e-12;
const CANONICAL_PHASE_ANCHORS = Object.freeze([
  Object.freeze({ id: "ready", phase: 0 }),
  Object.freeze({ id: "deepestDip", phase: 0.25 }),
  Object.freeze({ id: "rise", phase: 0.5 }),
  Object.freeze({ id: "releaseProxy", phase: 0.75 }),
  Object.freeze({ id: "followThrough", phase: 1 }),
] as const);

type PackedCovariance3 = readonly [number, number, number, number, number, number];

function normalizedCorrelation(covariance: number, leftVariance: number, rightVariance: number): number {
  if (leftVariance === 0 || rightVariance === 0) {
    return covariance === 0 ? 0 : Number.POSITIVE_INFINITY;
  }
  return covariance / Math.sqrt(leftVariance) / Math.sqrt(rightVariance);
}

function isPositiveSemidefiniteCovariance([xx, xy, xz, yy, yz, zz]: PackedCovariance3): boolean {
  if (xx < 0 || yy < 0 || zz < 0) return false;

  const xyCorrelation = normalizedCorrelation(xy, xx, yy);
  const xzCorrelation = normalizedCorrelation(xz, xx, zz);
  const yzCorrelation = normalizedCorrelation(yz, yy, zz);
  if (
    Math.abs(xyCorrelation) > 1 + COVARIANCE_PSD_TOLERANCE
    || Math.abs(xzCorrelation) > 1 + COVARIANCE_PSD_TOLERANCE
    || Math.abs(yzCorrelation) > 1 + COVARIANCE_PSD_TOLERANCE
  ) {
    return false;
  }

  const normalizedDeterminant = (
    1
    + 2 * xyCorrelation * xzCorrelation * yzCorrelation
    - xyCorrelation ** 2
    - xzCorrelation ** 2
    - yzCorrelation ** 2
  );
  return normalizedDeterminant >= -COVARIANCE_PSD_TOLERANCE;
}

function hasEveryFrameSlot(frames: readonly unknown[]): boolean {
  for (let index = 0; index < frames.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(frames, index)) return false;
  }
  return true;
}

const vector3Schema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  z: finiteNumber,
}).strict();

const persistedJointNameSchema = z.enum(PERSISTED_JOINT_NAMES_V2);

const jointUncertaintySchema = z.object({
  model: z.literal("heuristic_v1"),
  covariance: z.tuple([
    finiteNumber,
    finiteNumber,
    finiteNumber,
    finiteNumber,
    finiteNumber,
    finiteNumber,
  ]).refine(isPositiveSemidefiniteCovariance, "Covariance must be positive semidefinite"),
  directionalConeDegrees: finiteNumber.min(0).max(180),
}).strict();

const representativeFrameSchema = z.object({
  phase: finiteNumber.min(0).max(1),
  root: vector3Schema.optional(),
  joints: z.record(persistedJointNameSchema, vector3Schema),
  uncertainty: z.record(persistedJointNameSchema, jointUncertaintySchema),
}).strict();

const phaseAnchorSchema = z.object({
  id: z.string().min(1),
  phase: finiteNumber.min(0).max(1),
}).strict();

const reconstructionQualitySchema = z.object({
  passed: z.literal(true),
  reasons: z.array(z.string()).length(0),
}).strict();

export const representativePose4DSchema = z.object({
  schemaVersion: z.literal(2),
  boundary: z.literal("representative_phase_fused_4d_estimate_not_actual_3d"),
  mode: z.enum(["basic_1_plus_1", "high_accuracy_3_plus_3"]),
  timeBasis: z.literal("normalized_shot_phase"),
  units: z.literal("template_shoulder_breadths"),
  frames: z.array(representativeFrameSchema).length(101),
  phaseAnchors: z.array(phaseAnchorSchema).length(CANONICAL_PHASE_ANCHORS.length),
  quality: reconstructionQualitySchema,
}).strict().superRefine((profile, context) => {
  for (let index = 0; index < profile.frames.length; index += 1) {
    if (Math.abs(profile.frames[index].phase - index / 100) > PHASE_GRID_TOLERANCE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["frames", index, "phase"],
        message: "Frame phases must use the canonical 101-sample grid",
      });
    }
  }
  for (let index = 0; index < profile.phaseAnchors.length; index += 1) {
    const anchor = profile.phaseAnchors[index];
    const canonical = CANONICAL_PHASE_ANCHORS[index];
    if (anchor.id !== canonical.id || anchor.phase !== canonical.phase) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phaseAnchors", index],
        message: "Phase anchors must be canonical and ordered",
      });
    }
  }
});

export function parseRepresentativePose4D(value: unknown): RepresentativePose4DV2 {
  if (
    typeof value === "object"
    && value !== null
    && "frames" in value
    && Array.isArray(value.frames)
    && !hasEveryFrameSlot(value.frames)
  ) {
    throw new Error("Representative profile frames must not be sparse");
  }
  return representativePose4DSchema.parse(value) as RepresentativePose4DV2;
}
