import { ANONYMOUS_POSE_REFERENCES, type AnonymousPoseReference } from "@/lib/anonymous-pose-library";
import { referenceReelId, type ReelItem } from "@/lib/reels/reel-model";
import { poseMotionGlyph, type GlyphView, type SkeletonGlyphData } from "@/lib/skeleton/pose-motion-glyph";

/**
 * What the Explore screen can browse: the anonymous optical mocap reference
 * only. Other people's skeletons appear here only after a public opt-in
 * contract exists, famous-player footage never does, and nothing synthetic
 * stands in for either.
 */

export type ExploreMotionKind = "anonymous_reference";

export type ExploreMotionStillV1 = Readonly<{
  /** Shot phase label (준비 · 딥 · 상승 · 릴리스 · 팔로우스루). */
  label: string;
  glyph(view: GlyphView): SkeletonGlyphData;
}>;

export type ExploreMotionStillsV1 = Readonly<{ stills: readonly ExploreMotionStillV1[] }>;

export type ExploreMotionV1 = Readonly<{
  id: string;
  shortLabel: string;
  /** One line naming the source honestly, shown under the mosaic. */
  caption: string;
  kind: ExploreMotionKind;
  /** The real route a tap opens. */
  href: string;
  /** The five phase stills, loaded on demand so a long list stays light. */
  load(): Promise<ExploreMotionStillsV1>;
  /** The full-screen reel for the one-per-screen feed, built on demand. */
  reel(): Promise<ReelItem>;
}>;

export function referenceExploreMotion(reference: AnonymousPoseReference): ExploreMotionV1 {
  const stills: ExploreMotionStillsV1 = Object.freeze({
    stills: reference.motion.frames.map((frame) => Object.freeze({
      label: frame.label,
      glyph: (view: GlyphView) => poseMotionGlyph(reference.motion, { view, progress: frame.progress }),
    })),
  });
  const reel: ReelItem = Object.freeze({ kind: "reference" as const, id: referenceReelId(reference.id), reference });
  return Object.freeze({
    id: `reference:${reference.id}`,
    shortLabel: reference.shortLabel,
    caption: `${reference.shortLabel} · CMU optical mocap`,
    kind: "anonymous_reference",
    href: "/library",
    load: async () => stills,
    reel: async () => reel,
  });
}

let cached: readonly ExploreMotionV1[] | null = null;

export function exploreMotions(): readonly ExploreMotionV1[] {
  if (cached) return cached;
  cached = Object.freeze(ANONYMOUS_POSE_REFERENCES.map(referenceExploreMotion));
  return cached;
}
