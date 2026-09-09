import type { CoachCueAnchorV1 } from "@/lib/coach/contract";
import type { PoseMotion } from "@/lib/pose-motion";
import type { RepresentativePose4DV2, ShootingHandV2 } from "@/lib/shooting-profile/types";
import type { GlyphHand } from "@/lib/skeleton/pose-motion-glyph";

/**
 * UI view model for one Reel.
 *
 * This is not a wire contract. The frozen C2 Coach contract
 * (`lib/coach/contract.ts`, `lib/coach/feed-event.ts`) is mapped into it by
 * `lib/feed/coach-reel-adapter.ts`; the public motion packet will be mapped
 * into `ReelMotion` by its own adapter once it exists. Nothing here is
 * persisted.
 */
export type ReelKind = "user" | "coach" | "reference";

export type ReelMotion =
  | { source: "representative"; profile: RepresentativePose4DV2; shootingHand: ShootingHandV2 }
  | { source: "reference"; motion: PoseMotion; hand: GlyphHand };

type ReelBase = {
  id: string;
  motion: ReelMotion;
};

/** A shooter's own representative loop with one caption line; `meta` is the honest recency next to the name. */
export type UserReel = ReelBase & {
  kind: "user";
  author: string;
  meta?: string;
  caption: string;
};

/**
 * A coaching moment: the dominant skeleton plus one short message. The
 * observation label names the app-measured observation the message is
 * about and the cue anchor says where it lives (joints and phase anchor,
 * or text only); both come from the frozen Coach contract, never from prose.
 */
export type CoachReel = ReelBase & {
  kind: "coach";
  message: string;
  observationLabel: string | null;
  cueAnchor: CoachCueAnchorV1 | null;
};

/** An anonymous reference motion with its attribution. */
export type ReferenceReel = ReelBase & {
  kind: "reference";
  label: string;
  attribution: string;
};

export type ReelItem = UserReel | CoachReel | ReferenceReel;

/** The name VoiceOver reads first. */
export function reelAccessibilityName(item: ReelItem): string {
  if (item.kind === "user") return `${item.author} 릴`;
  if (item.kind === "coach") return "코치 릴";
  return `${item.label} 참조 릴`;
}

/** The single overlay line: caption, message, or reference label. */
export function reelLine(item: ReelItem): string {
  if (item.kind === "user") return item.caption;
  if (item.kind === "coach") return item.message;
  return item.label;
}

/** The small label above the line: who or what this is. */
export function reelLabel(item: ReelItem): string {
  if (item.kind === "user") return item.meta ? `${item.author} · ${item.meta}` : item.author;
  if (item.kind === "coach") return item.observationLabel ? `코치 · ${item.observationLabel}` : "코치";
  return item.attribution;
}
