import type {
  FilmSpaceLocalFrameCacheResult,
  FilmSpaceLocalFrameCacheV1,
  FilmSpaceSamplingPlan,
  LocalFilmClipRefV1,
} from "@/lib/film-space/types";

/** Web never decodes or caches local video frames; the Motion and Phase views remain. */
export async function extractFilmSpaceLocalFrames(
  _clip: LocalFilmClipRefV1,
  _plan: FilmSpaceSamplingPlan,
  _signal?: AbortSignal,
): Promise<FilmSpaceLocalFrameCacheResult> {
  return {
    status: "unsupported_platform",
    message: "Film Space 영상 프레임 캐시는 현재 iPhone 기기에서 지원됩니다.",
  };
}

export async function disposeFilmSpaceLocalFrames(cache: FilmSpaceLocalFrameCacheV1): Promise<void> {
  cache.released = true;
}
