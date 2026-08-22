/**
 * Unvalidated engineering defaults inspired by average adult male proportions.
 * These deterministic ratios are reconstruction defaults, not anatomical truth
 * or clinically validated biomechanical thresholds. Publish a new version to
 * change them after validation rather than mutating V1.
 */
export const ENGINEERING_THRESHOLDS_V1 = Object.freeze({
  version: "representative_engineering_thresholds_v1" as const,
  validationStatus: "unvalidated_engineering_defaults_not_anatomical_truth" as const,
  basicConfidenceCap: 0.65,
  smoothingWindowRadius: 2,
  minimumSmoothingResultantStrength: 0.35,
  minimumVerticalSignReliability: 0.15,
  templateBoneLengthTolerance: 1e-5,
  minimumProjectedBoneLength: 1e-6,
  maximumAcceptedDirectionalConeDegrees: 25,
  confidenceWeights: Object.freeze({
    dispersion: 0.40,
    conditioningPenalty: 0.35,
    availabilityPenalty: 0.25,
  }),
  uncertainty: Object.freeze({
    minimumDirectionalConeDegrees: 3,
    maximumDirectionalConeDegrees: 45,
    dispersionConeDegrees: 14,
    conditioningConeDegrees: 22,
    availabilityConeDegrees: 16,
    minimumVariance: 0.001,
    maximumVariance: 0.08,
    dispersionVariance: 0.018,
    conditioningVariance: 0.028,
    availabilityVariance: 0.022,
  }),
  templateBoneLengths: Object.freeze({
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
  }),
});
