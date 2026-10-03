import { representativeGlyph } from "@/components/skeleton/representative-glyph";
import type { ExploreMotionStillsV1, ExploreMotionV1 } from "@/lib/explore-source";
import { PREVIEW_SHOT_ARCHETYPES, buildPreviewShotRecord, previewShotCreatedAt, type PreviewShotArchetypeV1 } from "@/lib/preview/preview-shot-library";
import { SHOT_PHASES } from "@/lib/pose-motion";
import { profileReelId, type ReelItem } from "@/lib/reels/reel-model";

const SYNTHETIC_NOTE = "미리보기 합성 예시";

/** Lets the list paint before a record is built through the pipeline. */
function afterYield<T>(build: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(build());
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }, 0);
  });
}

function reelFor(entry: PreviewShotArchetypeV1, shortLabel: string): ReelItem {
  const record = buildPreviewShotRecord(entry);
  return Object.freeze({
    kind: "profile" as const,
    id: profileReelId(entry.id),
    profileId: entry.id,
    profile: record.profile,
    shootingHand: record.shootingHand,
    confidence: record.confidence,
    createdAt: previewShotCreatedAt(entry),
    title: shortLabel,
    line: `${entry.label} · ${SYNTHETIC_NOTE}`,
  });
}

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
  return Object.freeze(PREVIEW_SHOT_ARCHETYPES.map((entry, index) => {
    const shortLabel = `SHOT ${String(index + 1).padStart(2, "0")}`;
    return Object.freeze({
      id: `preview:${entry.id}`,
      shortLabel,
      caption: `${shortLabel} · ${entry.label} · ${SYNTHETIC_NOTE}`,
      kind: "synthetic_preview" as const,
      href: `/private-analysis/${entry.id}`,
      load: () => afterYield(() => stillsFor(entry)),
      reel: () => afterYield(() => reelFor(entry, shortLabel)),
    });
  }));
}
