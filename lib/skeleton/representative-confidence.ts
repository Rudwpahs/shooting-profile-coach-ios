import type { RepresentativePose4DV2 } from "@/lib/shooting-profile/types";

/**
 * How much a representative skeleton may be trusted, shown as form rather
 * than as a number: a failed quality gate draws dashed (`recapture`), High
 * mode is the accent band, Basic is the plain band. Pure, so feed logic can
 * use it without a renderer.
 */
export type SkeletonConfidence = "high" | "basic" | "recapture";

export function representativeConfidence(profile: Pick<RepresentativePose4DV2, "quality" | "mode">): SkeletonConfidence {
  if (!profile.quality.passed) return "recapture";
  return profile.mode === "high_accuracy_3_plus_3" ? "high" : "basic";
}
