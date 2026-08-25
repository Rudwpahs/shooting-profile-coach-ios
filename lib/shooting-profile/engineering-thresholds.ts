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
  /** Radius on the 101-sample grid for visibility-weighted 2D pre-angle smoothing. */
  preAngleSmoothingWindowRadius: 2,
  smoothingWindowRadius: 2,
  minimumSmoothingResultantStrength: 0.35,
  minimumVerticalSignReliability: 0.15,
  templateBoneLengthTolerance: 1e-5,
  minimumProjectedBoneLength: 1e-6,
  maximumAcceptedDirectionalConeDegrees: 25,
  /** Shot-admission defaults in centered upright-source-height units/body scales. */
  minimumPhaseObservationVisibility: 0.5,
  minimumPhaseBodyScaleSourceHeightUnits: 0.12,
  minimumPhaseTotalTrackedMotionBodyScales: 0.30,
  maximumPhaseReadyBaselineExcursionBodyScales: 0.03,
  minimumPhaseDipExcursionBodyScales: 0.12,
  minimumPhasePostDipRiseBodyScales: 0.10,
  minimumPhaseShootingWristRiseBodyScales: 0.25,
  minimumPhaseShootingWristExtensionBodyScales: 0.04,
  minimumPhaseReleaseProxyVelocityBodyScalesPerSecond: 1.0,
  maximumCriticalPhaseDetectedFrameGapMs: 300,
  minimumPhaseFollowThroughElapsedMs: 120,
  maximumFollowThroughWristDropBodyScales: 0.15,
  maximumPhaseFollowThroughExtensionLossBodyScales: 0.03,
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
  /**
   * Deterministic sensitivity probes in upright source-height observation
   * units. These are engineering defaults, not calibrated coverage levels.
   */
  uncertaintyPerturbation: Object.freeze({
    version: "deterministic_landmark_phase_perturbation_v1" as const,
    landmarkOffsetSourceHeightUnits: 0.00025,
    maximumLandmarkOffsetSourceHeightUnits: 0.00075,
    visibilityAmplification: 2,
    minimumPhaseIndexRadius: 1,
    maximumPhaseIndexRadius: 3,
    anchorDispersionPhaseIndexGain: 100,
    scenarioPatternCount: 9,
    minimumAcceptedScenarioCount: 7,
    minimumAcceptedScenarioFraction: 0.75,
    maximumLandmarkOffsetFractionOfProjectedBone: 0.30,
    isotropicSampleCovarianceFloorVariance: 0.000001,
    coordinateRoughnessVarianceGain: 25,
    anchorDispersionVarianceGain: 0.02,
    maximumConfidenceSensitivityPenalty: 0.05,
  }),
  shoulderClosure: Object.freeze({
    version: "template_shoulder_closure_v1" as const,
    /** Exactly one persisted template-shoulder-breadth unit. */
    templateShoulderBreadth: 1,
    maximumAngularResidualRadians: 15 * Math.PI / 180,
    maximumNormalizedLengthResidual: 0.12,
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
