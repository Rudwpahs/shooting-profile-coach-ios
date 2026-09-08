import type { PoseMotion } from "@/lib/pose-motion";
import type { RepresentativePose4DV2, ShootingHandV2 } from "@/lib/shooting-profile/types";
import type { GlyphHand } from "@/lib/skeleton/pose-motion-glyph";

/**
 * UI view model for one Reel.
 *
 * This is not a wire contract. The public motion packet, the coach feed event
 * and the provider shapes belong to the system/AI lane; until they are frozen
 * the harness fills this model from typed fixtures, and afterwards a single
 * adapter maps the frozen shapes into it. Nothing here is persisted.
 */
export type ReelKind = "user" | "coach" | "reference";

export type ReelMotion =
  | { source: "representative"; profile: RepresentativePose4DV2; shootingHand: ShootingHandV2 }
  | { source: "reference"; motion: PoseMotion; hand: GlyphHand };

type ReelBase = {
  id: string;
  motion: ReelMotion;
};

/** A shooter's own representative loop with one caption line. */
export type UserReel = ReelBase & {
  kind: "user";
  author: string;
  caption: string;
};

/**
 * A coaching moment: the dominant skeleton plus one short message. The
 * observation label names the app-measured phase or joint the message is
 * about; `null` means the message is text only and anchors nothing.
 */
export type CoachReel = ReelBase & {
  kind: "coach";
  message: string;
  observationLabel: string | null;
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
  if (item.kind === "user") return item.author;
  if (item.kind === "coach") return item.observationLabel ? `코치 · ${item.observationLabel}` : "코치";
  return item.attribution;
}
