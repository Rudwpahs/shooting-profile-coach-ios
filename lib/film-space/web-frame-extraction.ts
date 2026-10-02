import type {
  FilmSpaceFrameCacheV1,
  FilmSpaceFrameSourceResult,
  FilmSpaceFrameV1,
  FilmSpaceSamplingPlan,
  LocalFilmClipRefV1,
} from "@/lib/film-space/types";

/**
 * Platform-neutral core of browser frame extraction. The sampling plan is the
 * only source of the timestamps; this module seeks the browser-local clip to
 * each of them in order, captures one bounded bitmap per timestamp and
 * returns a complete cache or nothing. The DOM (video element, canvas,
 * ImageBitmap) enters only through `ports`, so the contract is testable in
 * plain Node and the native bundle never sees it.
 */

/** A decoded, bounded, browser-local frame. `source` is an ImageBitmap or canvas, never a URL. */
export type WebFilmFrameBitmapV1 = Readonly<{
  width: number;
  height: number;
  source: unknown;
  close(): void;
}>;

export type WebVideoHandleV1 = Readonly<{
  durationMs: number;
  width: number;
  height: number;
  /** Seeks to a source-video time and resolves with the time the decoder actually presented. */
  seekTo(timestampMs: number, signal?: AbortSignal): Promise<number>;
  dispose(): void;
}>;

export type WebFrameExtractionPorts = Readonly<{
  openVideo(uri: string, signal?: AbortSignal): Promise<WebVideoHandleV1>;
  captureFrame(handle: WebVideoHandleV1, targetLongEdgePx: number): Promise<WebFilmFrameBitmapV1>;
}>;

export type WebFrameExtractionOptions = Readonly<{
  openTimeoutMs?: number;
  seekTimeoutMs?: number;
}>;

export type WebFilmFrameCacheV1 = FilmSpaceFrameCacheV1<WebFilmFrameBitmapV1>;
export type WebFilmFrameSourceResult = FilmSpaceFrameSourceResult<WebFilmFrameBitmapV1>;

const DEFAULT_OPEN_TIMEOUT_MS = 12_000;
const DEFAULT_SEEK_TIMEOUT_MS = 4_000;

/** Only an object URL the browser created for a local File is a valid Film source on web. */
export function isWebLocalFilmUri(uri: unknown): uri is string {
  return typeof uri === "string" && /^blob:.+/i.test(uri);
}

function positiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function cancelled(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError("film-space web step timed out")), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function closeAll(frames: readonly WebFilmFrameBitmapV1[]): void {
  for (const frame of frames) {
    try {
      frame.close();
    } catch {
      // A bitmap that refuses to close is already gone; keep releasing the rest.
    }
  }
}

export async function extractWebFilmFrames(
  clip: LocalFilmClipRefV1,
  plan: FilmSpaceSamplingPlan,
  ports: WebFrameExtractionPorts,
  signal?: AbortSignal,
  options: WebFrameExtractionOptions = {},
): Promise<WebFilmFrameSourceResult> {
  if (cancelled(signal)) return { status: "cancelled" };
  if (!isWebLocalFilmUri(clip.uri)) return { status: "unavailable", reason: "source_unavailable" };

  const openTimeoutMs = options.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS;
  const seekTimeoutMs = options.seekTimeoutMs ?? DEFAULT_SEEK_TIMEOUT_MS;

  let handle: WebVideoHandleV1;
  try {
    handle = await withTimeout(ports.openVideo(clip.uri, signal), openTimeoutMs);
  } catch {
    return { status: "unavailable", reason: "source_unavailable" };
  }

  const frames: FilmSpaceFrameV1<WebFilmFrameBitmapV1>[] = [];
  const bitmaps: WebFilmFrameBitmapV1[] = [];
  const fail = (reason: "frame_generation_failed"): WebFilmFrameSourceResult => {
    closeAll(bitmaps);
    return { status: "unavailable", reason };
  };
  const cancel = (): WebFilmFrameSourceResult => {
    closeAll(bitmaps);
    return { status: "cancelled" };
  };

  try {
    for (const requestedTimestampMs of plan.timestampsMs) {
      if (cancelled(signal)) return cancel();

      let actualTimestampMs: number;
      try {
        actualTimestampMs = await withTimeout(handle.seekTo(requestedTimestampMs, signal), seekTimeoutMs);
      } catch {
        return cancelled(signal) ? cancel() : fail("frame_generation_failed");
      }
      if (cancelled(signal)) return cancel();

      let bitmap: WebFilmFrameBitmapV1;
      try {
        bitmap = await withTimeout(ports.captureFrame(handle, plan.targetLongEdgePx), seekTimeoutMs);
      } catch {
        return cancelled(signal) ? cancel() : fail("frame_generation_failed");
      }
      // The bitmap exists from here on: it is released even if its metadata is unusable.
      bitmaps.push(bitmap);
      if (!positiveFinite(bitmap.width) || !positiveFinite(bitmap.height)) return fail("frame_generation_failed");
      if (cancelled(signal)) return cancel();

      frames.push({
        timestampMs: Number.isFinite(actualTimestampMs) ? Math.round(actualTimestampMs) : requestedTimestampMs,
        requestedTimestampMs,
        width: bitmap.width,
        height: bitmap.height,
        imageRef: bitmap,
      });
    }

    if (cancelled(signal)) return cancel();
    return {
      version: "film_space_frame_cache_v1",
      status: "ready",
      sourceSlotId: clip.slotId,
      targetLongEdgePx: plan.targetLongEdgePx,
      frames,
      released: false,
    };
  } catch {
    return fail("frame_generation_failed");
  } finally {
    try {
      handle.dispose();
    } catch {
      // The decoder handle is best-effort; the bitmaps are what must not leak.
    }
  }
}

/** Closes every bitmap exactly once; later calls are no-ops. */
export async function disposeWebFilmFrames(cache: WebFilmFrameCacheV1): Promise<void> {
  if (cache.released) return;
  cache.released = true;
  closeAll(cache.frames.map((frame) => frame.imageRef));
}

/** Approximate RGBA bytes the cache holds, for bounded-memory reporting only. */
export function estimateWebFilmCacheBytes(cache: WebFilmFrameCacheV1): number {
  return cache.frames.reduce((total, frame) => total + frame.width * frame.height * 4, 0);
}
