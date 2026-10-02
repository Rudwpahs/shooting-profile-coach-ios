import type {
  FilmSpaceFrameV1,
  FilmSpaceLocalFrameV1,
} from "@/lib/film-space/types";

export type FilmSpaceGLTextureSourceV1 = Readonly<{
  localUri: string;
  width: number;
  height: number;
  requestedTimestampMs: number;
}>;

const MAX_TEXTURE_SLICES = 96;

function localFileUri(value: unknown): string | null {
  if (typeof value === "string") {
    return /^file:\/\//i.test(value) ? value : null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const candidate = typeof record.localUri === "string"
    ? record.localUri
    : typeof record.uri === "string"
      ? record.uri
      : null;
  return candidate && /^file:\/\//i.test(candidate) ? candidate : null;
}

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function validFrameCount(length: number): boolean {
  return length >= 1 && length <= MAX_TEXTURE_SLICES;
}

export function resolveFilmSpaceGLTextureSources(
  frames: readonly FilmSpaceFrameV1<unknown>[],
): readonly FilmSpaceGLTextureSourceV1[] | null {
  if (!validFrameCount(frames.length)) return null;

  const sources: FilmSpaceGLTextureSourceV1[] = [];
  for (const frame of frames) {
    const localUri = localFileUri(frame.imageRef);
    if (
      !localUri
      || !positiveFinite(frame.width)
      || !positiveFinite(frame.height)
      || !Number.isFinite(frame.requestedTimestampMs)
    ) {
      return null;
    }
    sources.push(Object.freeze({
      localUri,
      width: frame.width,
      height: frame.height,
      requestedTimestampMs: frame.requestedTimestampMs,
    }));
  }
  return Object.freeze(sources);
}

export function resolveFilmSpaceLocalFrameGLTextureSources(
  frames: readonly FilmSpaceLocalFrameV1[],
): readonly FilmSpaceGLTextureSourceV1[] | null {
  if (!validFrameCount(frames.length)) return null;

  const sources: FilmSpaceGLTextureSourceV1[] = [];
  for (const frame of frames) {
    const localUri = localFileUri(frame.localUri);
    if (
      !localUri
      || !positiveFinite(frame.width)
      || !positiveFinite(frame.height)
      || !Number.isFinite(frame.requestedTimestampMs)
    ) {
      return null;
    }
    sources.push(Object.freeze({
      localUri,
      width: frame.width,
      height: frame.height,
      requestedTimestampMs: frame.requestedTimestampMs,
    }));
  }
  return Object.freeze(sources);
}
