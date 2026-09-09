import { COACH_CONFIDENCE, type CoachConfidenceV1, type CoachJointV1 } from "@/lib/coach/contract";
import type { CaptureProtocolV2, RepresentativePose4DV2, RepresentativePoseFrameV2 } from "@/lib/shooting-profile/types";

/**
 * Uncertainty -> measurement confidence.
 *
 * A representative profile stores, per joint and phase, a heuristic
 * directional cone in degrees. A measurement is only as good as its weakest
 * joint, so the widest cone among the joints it uses picks the band, and the
 * capture protocol and the quality gate can only lower it: a Basic 1+1
 * profile never reports more than medium, and a failed gate never more than
 * low. The thresholds are published here so a reader can see what a band
 * meant, and nothing is ever inferred upward.
 */
export const COACH_CONFIDENCE_CONE_THRESHOLDS_DEG = Object.freeze({
  very_high: 6,
  high: 10,
  medium: 16,
  low: 25,
});

export const COACH_CONFIDENCE_CAPS: Readonly<Record<CaptureProtocolV2 | "quality_failed", CoachConfidenceV1>> = Object.freeze({
  basic_1_plus_1: "medium",
  high_accuracy_3_plus_3: "very_high",
  quality_failed: "low",
});

const RANK: Readonly<Record<CoachConfidenceV1, number>> = Object.fromEntries(COACH_CONFIDENCE.map((band, index) => [band, index])) as Record<CoachConfidenceV1, number>;

export function confidenceFromCone(coneDegrees: number): CoachConfidenceV1 {
  if (!Number.isFinite(coneDegrees) || coneDegrees < 0) return "very_low";
  if (coneDegrees <= COACH_CONFIDENCE_CONE_THRESHOLDS_DEG.very_high) return "very_high";
  if (coneDegrees <= COACH_CONFIDENCE_CONE_THRESHOLDS_DEG.high) return "high";
  if (coneDegrees <= COACH_CONFIDENCE_CONE_THRESHOLDS_DEG.medium) return "medium";
  if (coneDegrees <= COACH_CONFIDENCE_CONE_THRESHOLDS_DEG.low) return "low";
  return "very_low";
}

/** The lower of two bands; a cap can never raise confidence. */
export function capConfidence(band: CoachConfidenceV1, cap: CoachConfidenceV1): CoachConfidenceV1 {
  return RANK[band] <= RANK[cap] ? band : cap;
}

export type MeasurementConfidenceInput = {
  coneDegrees: number;
  mode: CaptureProtocolV2;
  qualityPassed: boolean;
};

export function measurementConfidence({ coneDegrees, mode, qualityPassed }: MeasurementConfidenceInput): CoachConfidenceV1 {
  let band = capConfidence(confidenceFromCone(coneDegrees), COACH_CONFIDENCE_CAPS[mode]);
  if (!qualityPassed) band = capConfidence(band, COACH_CONFIDENCE_CAPS.quality_failed);
  return band;
}

/** The widest cone among the joints a measurement uses; the measurement is only as sure as its weakest joint. */
export function jointConeDegrees(frame: RepresentativePoseFrameV2, joints: readonly CoachJointV1[]): number {
  if (joints.length === 0) throw new Error("a measurement names at least one joint");
  return Math.max(...joints.map((joint) => {
    const cone = frame.uncertainty[joint]?.directionalConeDegrees;
    if (typeof cone !== "number" || !Number.isFinite(cone)) throw new Error(`${joint} has no directional cone`);
    return cone;
  }));
}

export function observationConfidence(profile: RepresentativePose4DV2, frame: RepresentativePoseFrameV2, joints: readonly CoachJointV1[]): CoachConfidenceV1 {
  return measurementConfidence({ coneDegrees: jointConeDegrees(frame, joints), mode: profile.mode, qualityPassed: profile.quality.passed });
}
