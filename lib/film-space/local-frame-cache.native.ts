import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { createVideoPlayer, type VideoPlayer, type VideoThumbnail } from "expo-video";

import {
  createFilmSpaceLocalFrameCache,
  releaseFilmSpaceLocalFrameCache,
  type FilmSpaceLocalFrameCachePorts,
} from "@/lib/film-space/local-frame-cache";
import type {
  FilmSpaceLocalFrameCacheResult,
  FilmSpaceLocalFrameCacheV1,
  FilmSpaceSamplingPlan,
  LocalFilmClipRefV1,
} from "@/lib/film-space/types";

/** JPEG keeps the per-frame files small; the sampling plan already bounds the pixel budget. */
const FRAME_JPEG_COMPRESSION = 0.86;

/**
 * Native ports: expo-video decodes the sampled source-video times (and reports
 * the time it actually hit), expo-image-manipulator writes each in-memory
 * thumbnail to a file in the app's cache directory, and expo-file-system
 * deletes those files again. Everything stays on the device.
 */
const ports: FilmSpaceLocalFrameCachePorts<VideoThumbnail, VideoPlayer> = {
  open: (clip) => createVideoPlayer({ uri: clip.uri, useCaching: false }),
  close: (player) => player.release(),
  generate: async (player, timestampsMs, maxLongEdgePx) => {
    const thumbnails = await player.generateThumbnailsAsync(
      timestampsMs.map((timestampMs) => timestampMs / 1000),
      { maxWidth: maxLongEdgePx, maxHeight: maxLongEdgePx },
    );
    return thumbnails.map((thumbnail) => ({
      ref: thumbnail,
      actualTimestampMs: Number.isFinite(thumbnail.actualTime) ? thumbnail.actualTime * 1000 : null,
      width: thumbnail.width,
      height: thumbnail.height,
    }));
  },
  persist: async (thumbnail) => {
    const context = ImageManipulator.manipulate(thumbnail);
    try {
      const image = await context.renderAsync();
      try {
        const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: FRAME_JPEG_COMPRESSION });
        return { localUri: saved.uri, width: saved.width, height: saved.height };
      } finally {
        image.release();
      }
    } finally {
      context.release();
    }
  },
  releaseRef: (thumbnail) => thumbnail.release(),
  remove: async (localUri) => {
    const file = new File(localUri);
    if (file.exists) file.delete();
  },
};

export function extractFilmSpaceLocalFrames(
  clip: LocalFilmClipRefV1,
  plan: FilmSpaceSamplingPlan,
  signal?: AbortSignal,
): Promise<FilmSpaceLocalFrameCacheResult> {
  return createFilmSpaceLocalFrameCache(clip, plan, ports, signal);
}

export function disposeFilmSpaceLocalFrames(cache: FilmSpaceLocalFrameCacheV1): Promise<void> {
  return releaseFilmSpaceLocalFrameCache(cache, ports);
}
