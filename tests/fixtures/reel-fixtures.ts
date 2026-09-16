import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import type { ProfileReel, ReferenceReel } from "@/lib/reels/reel-model";
import { buildTwoViewRepresentativeProfile } from "@/lib/shooting-profile/two-view-pipeline";
import type { RepresentativePose4DV2 } from "@/lib/shooting-profile/types";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

/**
 * Reel fixtures for tests: one representative profile reconstructed from the
 * synthetic landmark session (no person, no recording) and the anonymous
 * references the product already ships. Built once per test file.
 */
let cached: { profile: RepresentativePose4DV2; confidence: number } | null = null;

export function syntheticRepresentative(): { profile: RepresentativePose4DV2; confidence: number } {
  if (cached) return cached;
  const session = syntheticLandmarkSession({ mode: "basic_1_plus_1", shootingHand: "right" });
  const attempts = [...session.front, ...session.shootingSide].map((sequence) => ({ id: `${sequence.view}-${sequence.takeIndex}`, sequence }));
  const result = buildTwoViewRepresentativeProfile({ mode: "basic_1_plus_1", shootingHand: "right", attempts });
  if (result.status !== "complete") throw new Error("synthetic session must reconstruct");
  cached = { profile: result.profile, confidence: result.confidence };
  return cached;
}

export function syntheticProfileReel(profileId = "demo-profile-1", createdAt = new Date(2026, 8, 16, 9, 0, 0)): ProfileReel {
  const { profile, confidence } = syntheticRepresentative();
  return { kind: "profile", id: `profile:${profileId}`, profileId, profile, shootingHand: "right", confidence, createdAt };
}

export function anonymousReferenceReel(index = 0): ReferenceReel {
  const reference = ANONYMOUS_POSE_REFERENCES[index];
  return { kind: "reference", id: `reference:${reference.id}`, reference };
}
