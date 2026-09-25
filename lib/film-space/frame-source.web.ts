import type {
  FilmSpaceFrameCacheV1,
  FilmSpaceFrameSourceResult,
  FilmSpaceSamplingPlan,
  LocalFilmClipRefV1,
} from "@/lib/film-space/types";

export async function extractFilmSpaceFrames(
  _clip: LocalFilmClipRefV1,
  _plan: FilmSpaceSamplingPlan,
  _signal?: AbortSignal,
): Promise<FilmSpaceFrameSourceResult> {
  return {
    status: "unsupported_platform",
    message: "Film Space 영상 프레임 추출은 현재 iPhone 기기에서 지원됩니다.",
  };
}

export async function disposeFilmSpaceFrames(
  cache: FilmSpaceFrameCacheV1,
): Promise<void> {
  cache.released = true;
}