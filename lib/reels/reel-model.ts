import type { AnonymousPoseReference } from "@/lib/anonymous-pose-library";
import type { FilmShotV1 } from "@/lib/film-space/film-shots";
import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";
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
  /** Explore names a profile honestly ("SHOT 12"); absent for my own profile. */
  title?: string;
  /** The one line under that name; absent for my own profile (recency is shown). */
  line?: string;
};

export type ReferenceReel = {
  kind: "reference";
  id: string;
  reference: AnonymousPoseReference;
};

/** My own footage kept on this device without a pose: the media is the film itself. */
export type FilmReel = {
  kind: "film";
  id: string;
  shotId: string;
  title: string;
  createdAt: Date;
  clips: readonly LocalFilmClipRefV1[];
};

export type ReelItem = ProfileReel | ReferenceReel | FilmReel;

const REFERENCE_ATTRIBUTION = "CMU optical mocap";
const FILM_LINE = "내 영상 · 이 기기에만 보관";

export function profileReelId(profileId: string): string {
  return `profile:${profileId}`;
}

export function referenceReelId(referenceId: string): string {
  return `reference:${referenceId}`;
}

export function filmReelId(shotId: string): string {
  return `film:${shotId}`;
}

export function filmShotReel(shot: FilmShotV1): FilmReel {
  return { kind: "film", id: filmReelId(shot.id), shotId: shot.id, title: shot.title, createdAt: new Date(shot.createdAtMs), clips: shot.clips };
}

const MY_PROFILE_TITLE = "내 슛폼";

/** The small label: whose motion this is, never a person's name. */
export function reelTitle(item: ReelItem): string {
  if (item.kind === "profile") return item.title ?? MY_PROFILE_TITLE;
  if (item.kind === "film") return item.title;
  return item.reference.shortLabel;
}

/** The single line under the label: honest recency for mine, the style title for a reference, footage-only for a film shot. */
export function reelLine(item: ReelItem): string {
  if (item.kind === "profile") return item.line ?? relativeDayLabel(item.createdAt);
  if (item.kind === "film") return `${relativeDayLabel(item.createdAt)} · ${FILM_LINE}`;
  return item.reference.styleTitle;
}

/** The name VoiceOver reads first. */
export function reelAccessibilityName(item: ReelItem): string {
  if (item.kind === "profile") return `${item.title ?? MY_PROFILE_TITLE} 릴`;
  if (item.kind === "film") return `${item.title} 영상 릴`;
  return `${item.reference.shortLabel} 참조 릴, ${REFERENCE_ATTRIBUTION}`;
}

/** The analysis route exists only for a saved profile; a film shot has no pose to analyse. */
export function reelAnalysisProfileId(item: ReelItem): string | null {
  return item.kind === "profile" ? item.profileId : null;
}
