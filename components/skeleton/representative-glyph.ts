import {
  DISPLAY_BONES,
  getRepresentativeViewPresets,
  projectRepresentativeJoints,
  projectRepresentativeJointsAtYaw,
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

type Projected = Readonly<Record<string, { x: number; y: number }>>;

/** Screen y grows downward; the projection's y grows upward. */
function toGlyph(projected: Projected, shootingHand: ShootingHandV2): SkeletonGlyphData {
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

/**
 * Glyph data for one stored frame of a representative profile, projected with
 * the same yaw and pitch the sequence viewer uses. Screen y grows downward.
 */
export function representativeGlyph(
  frame: RepresentativePoseFrameV2,
  view: RepresentativeViewId,
  shootingHand: ShootingHandV2,
): SkeletonGlyphData {
  return toGlyph(projectRepresentativeJoints(frame, view, shootingHand), shootingHand);
}

/** The same glyph at any yaw in degrees, for a held rotate between the presets. */
export function representativeGlyphAtYaw(
  frame: RepresentativePoseFrameV2,
  yawDegrees: number,
  shootingHand: ShootingHandV2,
): SkeletonGlyphData {
  return toGlyph(projectRepresentativeJointsAtYaw(frame, yawDegrees, shootingHand), shootingHand);
}

/** The yaw a named view stands for, so a rotate can start from it. */
export function representativeViewYaw(view: RepresentativeViewId, shootingHand: ShootingHandV2): number {
  const preset = getRepresentativeViewPresets(shootingHand).find((item) => item.id === view);
  if (!preset) throw new Error("representative view preset is unavailable");
  return preset.yaw;
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
