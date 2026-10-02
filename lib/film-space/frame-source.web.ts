import type { FilmSpaceSamplingPlan, LocalFilmClipRefV1 } from "@/lib/film-space/types";
import {
  disposeWebFilmFrames,
  extractWebFilmFrames,
  type WebFilmFrameBitmapV1,
  type WebFilmFrameCacheV1,
  type WebFilmFrameSourceResult,
  type WebFrameExtractionPorts,
  type WebVideoHandleV1,
} from "@/lib/film-space/web-frame-extraction";

/**
 * Browser frame source. A hidden <video> decodes the user's local clip from
 * its object URL; each sampled source time is sought, waited for until a
 * decoded frame is actually presented, and drawn once into a bounded canvas
 * that becomes an ImageBitmap. Nothing is uploaded, stored, or logged.
 */

type VideoFrameCallbackCapable = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const SEEK_EPSILON_S = 0.001;

function browserSupportsFilmFrames(): boolean {
  if (typeof document === "undefined" || typeof document.createElement !== "function") return false;
  try {
    const canvas = document.createElement("canvas");
    return typeof canvas.getContext === "function" && Boolean(canvas.getContext("2d")) && typeof document.createElement("video").play === "function";
  } catch {
    return false;
  }
}

/**
 * After `seeked` the frame at `currentTime` is decoded and drawable. When the
 * browser reports the presented frame through requestVideoFrameCallback we
 * take its exact media time; a hidden, off-screen video may never present one,
 * so a short timer stands in and the element's current time is reported.
 */
const PRESENTED_FRAME_FALLBACK_MS = 40;

function waitForPresentedFrame(video: VideoFrameCallbackCapable, signal?: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("aborted")); return; }
    let settled = false;
    let callbackHandle: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (callbackHandle !== null) video.cancelVideoFrameCallback?.(callbackHandle);
      if (timer !== null) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = (timestampMs: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(timestampMs);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (typeof video.requestVideoFrameCallback === "function") {
      callbackHandle = video.requestVideoFrameCallback((_now, metadata) => finish(metadata.mediaTime * 1000));
    }
    timer = setTimeout(() => finish(video.currentTime * 1000), PRESENTED_FRAME_FALLBACK_MS);
  });
}

const videosByHandle = new WeakMap<WebVideoHandleV1, HTMLVideoElement>();

function openVideo(uri: string, signal?: AbortSignal): Promise<WebVideoHandleV1> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video") as VideoFrameCallbackCapable;
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.style.position = "fixed";
    video.style.left = "-10000px";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.opacity = "0";
    video.setAttribute("aria-hidden", "true");

    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    };

    const onError = () => {
      cleanupListeners();
      dispose();
      reject(new Error("video source unavailable"));
    };
    const onAbort = () => {
      cleanupListeners();
      dispose();
      reject(new Error("aborted"));
    };
    const onLoaded = () => {
      cleanupListeners();
      const durationMs = video.duration * 1000;
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!Number.isFinite(durationMs) || durationMs <= 0 || width <= 0 || height <= 0) {
        dispose();
        reject(new Error("video metadata unusable"));
        return;
      }
      const handle: WebVideoHandleV1 = {
        durationMs,
        width,
        height,
        seekTo: (timestampMs, seekSignal) => new Promise<number>((seekResolve, seekReject) => {
          if (disposed) { seekReject(new Error("disposed")); return; }
          if (seekSignal?.aborted) { seekReject(new Error("aborted")); return; }
          // Seeking exactly to the duration can land past the last decodable frame; stay just inside it.
          const target = Math.max(0, Math.min(timestampMs / 1000, video.duration - SEEK_EPSILON_S));
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            video.removeEventListener("error", onSeekError);
            waitForPresentedFrame(video, seekSignal).then(seekResolve, seekReject);
          };
          const onSeekError = () => {
            video.removeEventListener("seeked", onSeeked);
            video.removeEventListener("error", onSeekError);
            seekReject(new Error("seek failed"));
          };
          video.addEventListener("seeked", onSeeked);
          video.addEventListener("error", onSeekError);
          if (Math.abs(video.currentTime - target) < SEEK_EPSILON_S / 2 && video.readyState >= 2) {
            // Already there (first frame at 0): no `seeked` will fire, so present directly.
            video.removeEventListener("seeked", onSeeked);
            video.removeEventListener("error", onSeekError);
            waitForPresentedFrame(video, seekSignal).then(seekResolve, seekReject);
            return;
          }
          video.currentTime = target;
        }),
        dispose,
      };
      videosByHandle.set(handle, video);
      resolve(handle);
    };
    const cleanupListeners = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    document.body.appendChild(video);
    video.src = uri;
    video.load();
  });
}

function boundedSize(width: number, height: number, targetLongEdgePx: number): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  const scale = Math.min(1, targetLongEdgePx / longEdge);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function captureFrame(handle: WebVideoHandleV1, targetLongEdgePx: number): Promise<WebFilmFrameBitmapV1> {
  const video = videosByHandle.get(handle);
  if (!video) throw new Error("video handle is not attached");
  const size = boundedSize(handle.width, handle.height, targetLongEdgePx);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2d canvas unavailable");
  context.drawImage(video, 0, 0, size.width, size.height);

  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(canvas);
    // The full-size canvas is scratch; only the bounded bitmap stays in memory.
    canvas.width = 0;
    canvas.height = 0;
    let closed = false;
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      close: () => {
        if (closed) return;
        closed = true;
        bitmap.close();
      },
    };
  }
  let closed = false;
  return {
    width: size.width,
    height: size.height,
    source: canvas,
    close: () => {
      if (closed) return;
      closed = true;
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

const DOM_PORTS: WebFrameExtractionPorts = { openVideo, captureFrame };

export async function extractFilmSpaceFrames(
  clip: LocalFilmClipRefV1,
  plan: FilmSpaceSamplingPlan,
  signal?: AbortSignal,
): Promise<WebFilmFrameSourceResult> {
  if (!browserSupportsFilmFrames()) {
    return {
      status: "unsupported_platform",
      message: "이 브라우저는 로컬 영상 프레임 추출을 지원하지 않습니다. Motion과 Phase 보기는 계속 사용할 수 있습니다.",
    };
  }
  return extractWebFilmFrames(clip, plan, DOM_PORTS, signal);
}

export async function disposeFilmSpaceFrames(cache: WebFilmFrameCacheV1): Promise<void> {
  await disposeWebFilmFrames(cache);
}
