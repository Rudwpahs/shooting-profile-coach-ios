import { representativeGlyph } from "@/components/skeleton/representative-glyph";
import type { ExploreMotionStillsV1, ExploreMotionV1 } from "@/lib/explore-source";
import { PREVIEW_SHOT_ARCHETYPES, buildPreviewShotRecord, type PreviewShotArchetypeV1 } from "@/lib/preview/preview-shot-library";
import { SHOT_PHASES } from "@/lib/pose-motion";

/** The five canonical anchors of a stored 101-phase profile, as frame indices. */
const ANCHOR_FRAME_INDICES = [0, 25, 50, 75, 100] as const;

function stillsFor(entry: PreviewShotArchetypeV1): ExploreMotionStillsV1 {
  const record = buildPreviewShotRecord(entry);
  return Object.freeze({
    stills: ANCHOR_FRAME_INDICES.map((frameIndex, position) => Object.freeze({
      label: SHOT_PHASES[position],
      glyph: (view: "front" | "oblique" | "side") => representativeGlyph(record.profile.frames[frameIndex], view, record.shootingHand),
    })),
  });
}

/**
 * The preview shot library as Explore entries. The record behind each entry
 * is built through the real pipeline the first time it is loaded, after a
 * yield so the list can paint; a tap opens the real analysis route.
 */
export function previewExploreMotions(): readonly ExploreMotionV1[] {
  return Object.freeze(PREVIEW_SHOT_ARCHETYPES.map((entry, index) => Object.freeze({
    id: `preview:${entry.id}`,
    shortLabel: `SHOT ${String(index + 1).padStart(2, "0")}`,
    caption: `SHOT ${String(index + 1).padStart(2, "0")} · ${entry.label} · 미리보기 합성 예시`,
    kind: "synthetic_preview" as const,
    href: `/private-analysis/${entry.id}`,
    load: () => new Promise<ExploreMotionStillsV1>((resolve) => {
      setTimeout(() => resolve(stillsFor(entry)), 0);
    }),
  })));
}
