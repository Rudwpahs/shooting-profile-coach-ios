import { z } from "zod";

import { PERSISTED_JOINT_NAMES_V2, type RepresentativePose4DV2 } from "@/lib/shooting-profile/types";

const finiteNumber = z.number().finite();

const vector3Schema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  z: finiteNumber,
}).strict();

const persistedJointNameSchema = z.enum(PERSISTED_JOINT_NAMES_V2);

const jointUncertaintySchema = z.object({
  model: z.literal("heuristic_v1"),
  covariance: z.tuple([finiteNumber, finiteNumber, finiteNumber, finiteNumber, finiteNumber, finiteNumber]),
  directionalConeDegrees: finiteNumber,
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
  passed: z.boolean(),
  reasons: z.array(z.string()),
}).strict();

export const representativePose4DSchema = z.object({
  schemaVersion: z.literal(2),
  boundary: z.literal("representative_phase_fused_4d_estimate_not_actual_3d"),
  mode: z.enum(["basic_1_plus_1", "high_accuracy_3_plus_3"]),
  timeBasis: z.literal("normalized_shot_phase"),
  units: z.literal("template_shoulder_breadths"),
  frames: z.array(representativeFrameSchema).length(101),
  phaseAnchors: z.array(phaseAnchorSchema).min(1),
  quality: reconstructionQualitySchema,
}).strict().superRefine((profile, context) => {
  for (let index = 1; index < profile.frames.length; index += 1) {
    if (profile.frames[index].phase <= profile.frames[index - 1].phase) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["frames", index, "phase"],
        message: "Frame phases must be strictly increasing",
      });
    }
  }
  for (let index = 1; index < profile.phaseAnchors.length; index += 1) {
    if (profile.phaseAnchors[index].phase <= profile.phaseAnchors[index - 1].phase) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phaseAnchors", index, "phase"],
        message: "Phase anchors must be strictly increasing",
      });
    }
  }
});

export function parseRepresentativePose4D(value: unknown): RepresentativePose4DV2 {
  return representativePose4DSchema.parse(value) as RepresentativePose4DV2;
}
