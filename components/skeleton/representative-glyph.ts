import {
  DISPLAY_BONES,
  projectRepresentativeJoints,
  type RepresentativeViewId,
} from "@/components/shooting-profile/sequence-viewer";
import type { SkeletonConfidence } from "@/components/skeleton/skeleton-glyph";
import { glyphBounds, type GlyphBounds, type SkeletonGlyphData } from "@/lib/skeleton/pose-motion-glyph";
import type {
  RepresentativePose4DV2,
  RepresentativePoseFrameV2,
  ShootingHandV2,
} from "@/lib/shooting-profile/types";

const DERIVED_JOINTS = ["head", "neck", "spine", "pelvis"] as const;

/**
 * Glyph data for one stored frame of a representative profile, projected with
 * the same yaw and pitch the sequence viewer uses. Screen y grows downward.
 */
export function representativeGlyph(
  frame: RepresentativePoseFrameV2,
  view: RepresentativeViewId,
  shootingHand: ShootingHandV2,
): SkeletonGlyphData {
  const projected = projectRepresentativeJoints(frame, view, shootingHand);
  const points = Object.fromEntries(Object.entries(projected).map(([joint, point]) => [joint, { x: point.x, y: -point.y }]));
  const side = shootingHand === "left" ? "left" : "right";
  return {
    points,
    bones: DISPLAY_BONES,
    armJoints: [`${side}Shoulder`, `${side}Elbow`, `${side}Wrist`],
    derivedJoints: DERIVED_JOINTS,
    headJoint: "head",
  };
}

/** Bounds over every stored frame so a loop keeps one anchor and scale. */
export function representativeSequenceBounds(
  profile: RepresentativePose4DV2,
  view: RepresentativeViewId,
  shootingHand: ShootingHandV2,
): GlyphBounds {
  return glyphBounds(profile.frames.map((frame) => representativeGlyph(frame, view, shootingHand).points));
}

/** Index of the release-proxy anchor frame, the still every thumbnail shows. */
export function representativeReleaseFrameIndex(profile: RepresentativePose4DV2): number {
  const last = profile.frames.length - 1;
  const anchor = profile.phaseAnchors.find((candidate) => candidate.id === "releaseProxy");
  const phase = anchor ? anchor.phase : 0.75;
  return Math.max(0, Math.min(last, Math.round(phase * last)));
}

/**
 * Confidence shown as form, never as a number: a failed quality gate draws
 * dashed, High mode is the accent band, Basic is the plain band.
 */
export function representativeConfidence(profile: RepresentativePose4DV2): SkeletonConfidence {
  if (!profile.quality.passed) return "recapture";
  return profile.mode === "high_accuracy_3_plus_3" ? "high" : "basic";
}
