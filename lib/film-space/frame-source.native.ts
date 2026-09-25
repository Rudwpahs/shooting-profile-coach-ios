import { createVideoPlayer, type VideoThumbnail } from "expo-video";

import type {
  FilmSpaceFrameCacheV1,
  FilmSpaceFrameSourceResult,
  FilmSpaceFrameV1,
  FilmSpaceSamplingPlan,
  LocalFilmClipRefV1,
} from "@/lib/film-space/types";

const GENERATION_BATCH_SIZE = 16;

type Releasable = { release?: () => void };

function releaseImageRef(ref: unknown): void {
  const releasable = ref as Releasable | null;
  if (typeof releasable?.release === "function") releasable.release();
}

function cancelled(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

export async function disposeFilmSpaceFrames(
  cache: FilmSpaceFrameCacheV1<VideoThumbnail>,
): Promise<void> {
  if (cache.released) return;
  cache.released = true;
  cache.frames.forEach((frame) => releaseImageRef(frame.imageRef));
}

export async function extractFilmSpaceFrames(
  clip: LocalFilmClipRefV1,
  plan: FilmSpaceSamplingPlan,
  signal?: AbortSignal,
): Promise<FilmSpaceFrameSourceResult<VideoThumbnail>> {
  if (cancelled(signal)) return { status: "cancelled" };
  if (!clip.uri || /^https?:/i.test(clip.uri)) {
    return { status: "unavailable", reason: "source_unavailable" };
  }

  const player = createVideoPlayer({ uri: clip.uri, useCaching: false });
  const frames: FilmSpaceFrameV1<VideoThumbnail>[] = [];
  try {
    for (let start = 0; start < plan.timestampsMs.length; start += GENERATION_BATCH_SIZE) {
      if (cancelled(signal)) {
        frames.forEach((frame) => releaseImageRef(frame.imageRef));
        return { status: "cancelled" };
      }
      const batchTimestampsMs = plan.timestampsMs.slice(start, start + GENERATION_BATCH_SIZE);
      const thumbnails = await player.generateThumbnailsAsync(
        batchTimestampsMs.map((timestampMs) => timestampMs / 1000),
        {
          maxHeight: plan.targetLongEdgePx,
          maxWidth: plan.targetLongEdgePx,
        },
      );
      if (cancelled(signal)) {
        thumbnails.forEach(releaseImageRef);
        frames.forEach((frame) => releaseImageRef(frame.imageRef));
        return { status: "cancelled" };
      }
      if (thumbnails.length !== batchTimestampsMs.length) {
        thumbnails.forEach(releaseImageRef);
        frames.forEach((frame) => releaseImageRef(frame.imageRef));
        return { status: "unavailable", reason: "frame_generation_failed" };
      }
      thumbnails.forEach((thumbnail, index) => {
        const requestedTimestampMs = batchTimestampsMs[index];
        const actualTimeSeconds = Number.isFinite(thumbnail.actualTime)
          ? thumbnail.actualTime
          : thumbnail.requestedTime;
        frames.push({
          timestampMs: Math.round(actualTimeSeconds * 1000),
          requestedTimestampMs,
          width: thumbnail.width,
          height: thumbnail.height,
          imageRef: thumbnail,
        });
      });
    }

    return {
      version: "film_space_frame_cache_v1",
      status: "ready",
      sourceSlotId: clip.slotId,
      targetLongEdgePx: plan.targetLongEdgePx,
      frames,
      released: false,
    };
  } catch {
    frames.forEach((frame) => releaseImageRef(frame.imageRef));
    return { status: "unavailable", reason: "source_unavailable" };
  } finally {
    player.release();
  }
}