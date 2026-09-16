import type { AnonymousPoseReference } from "@/lib/anonymous-pose-library";
import { relativeDayLabel } from "@/lib/format/relative-day";
import type { RepresentativePose4DV2, ShootingHandV2 } from "@/lib/shooting-profile/types";

/**
 * UI view model for one Reel. Not a wire contract and never persisted: the
 * route builds it from what Home already holds (the viewer record of my
 * latest representative profile and the anonymous references). Pure data and
 * copy only; anything that projects or draws lives under `components/reels`.
 */
export type ProfileReel = {
  kind: "profile";
  id: string;
  profileId: string;
  profile: RepresentativePose4DV2;
  shootingHand: ShootingHandV2;
  confidence: number;
  createdAt: Date;
};

export type ReferenceReel = {
  kind: "reference";
  id: string;
  reference: AnonymousPoseReference;
};

export type ReelItem = ProfileReel | ReferenceReel;

const REFERENCE_ATTRIBUTION = "CMU optical mocap";

export function profileReelId(profileId: string): string {
  return `profile:${profileId}`;
}

export function referenceReelId(referenceId: string): string {
  return `reference:${referenceId}`;
}

/** The small label: whose motion this is, never a person's name. */
export function reelTitle(item: ReelItem): string {
  return item.kind === "profile" ? "내 슛폼" : item.reference.shortLabel;
}

/** The single line under the label: honest recency for mine, the style title for a reference. */
export function reelLine(item: ReelItem): string {
  return item.kind === "profile" ? relativeDayLabel(item.createdAt) : item.reference.styleTitle;
}

/** The name VoiceOver reads first. */
export function reelAccessibilityName(item: ReelItem): string {
  return item.kind === "profile" ? "내 슛폼 릴" : `${item.reference.shortLabel} 참조 릴, ${REFERENCE_ATTRIBUTION}`;
}

/** The analysis route exists only for a saved profile. */
export function reelAnalysisProfileId(item: ReelItem): string | null {
  return item.kind === "profile" ? item.profileId : null;
}
