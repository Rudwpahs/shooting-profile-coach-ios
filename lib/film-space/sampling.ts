import type { FilmSpaceSamplingPlan } from "@/lib/film-space/types";

const MIN_SLICES = 64;
const MAX_SLICES = 96;
const DEFAULT_SLICES = 80;
const MIN_DURATION_MS = 250;
const MIN_LONG_EDGE_PX = 120;
const MAX_LONG_EDGE_PX = 300;
const DEFAULT_LONG_EDGE_PX = 240;
const MAX_RAW_RGBA_BYTES = 24 * 1024 * 1024;
const RGBA_BYTES_PER_PIXEL = 4;

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`film-space ${label} must be finite`);
  return value;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function createFilmSpaceSamplingPlan(
  durationMs: number,
  options: Readonly<{
    preferredSlices?: number;
    targetLongEdgePx?: number;
    maxRawRgbaBytes?: number;
  }> = {},
): FilmSpaceSamplingPlan {
  const normalizedDurationMs = Math.round(finite(durationMs, "duration"));
  if (normalizedDurationMs < MIN_DURATION_MS) {
    throw new Error(`film-space duration is too short; expected at least ${MIN_DURATION_MS}ms`);
  }

  const requestedSlices = options.preferredSlices === undefined
    ? DEFAULT_SLICES
    : finite(options.preferredSlices, "preferred slice count");
  const sliceCount = clampInteger(requestedSlices, MIN_SLICES, MAX_SLICES);
  const requestedLongEdge = options.targetLongEdgePx === undefined
    ? DEFAULT_LONG_EDGE_PX
    : finite(options.targetLongEdgePx, "target long edge");
  const maxRawRgbaBytes = options.maxRawRgbaBytes === undefined
    ? MAX_RAW_RGBA_BYTES
    : Math.max(1, Math.floor(finite(options.maxRawRgbaBytes, "RGBA budget")));

  const budgetBoundLongEdge = Math.floor(Math.sqrt(
    maxRawRgbaBytes / (sliceCount * RGBA_BYTES_PER_PIXEL),
  ));
  if (budgetBoundLongEdge < MIN_LONG_EDGE_PX) {
    throw new Error("film-space RGBA budget is too small for the minimum bounded sampling plan");
  }
  const targetLongEdgePx = clampInteger(
    Math.min(requestedLongEdge, budgetBoundLongEdge),
    MIN_LONG_EDGE_PX,
    MAX_LONG_EDGE_PX,
  );
  const estimatedRawRgbaBytes = sliceCount
    * targetLongEdgePx
    * targetLongEdgePx
    * RGBA_BYTES_PER_PIXEL;
  if (estimatedRawRgbaBytes > maxRawRgbaBytes) {
    throw new Error("film-space sampling exceeds the configured RGBA budget");
  }

  const timestampsMs = Array.from({ length: sliceCount }, (_, index) => (
    index === sliceCount - 1
      ? normalizedDurationMs
      : Math.round((normalizedDurationMs * index) / (sliceCount - 1))
  ));
  if (new Set(timestampsMs).size !== sliceCount) {
    throw new Error("film-space duration is too short for deterministic unique sampling");
  }

  return Object.freeze({
    version: "film_space_sampling_v1" as const,
    durationMs: normalizedDurationMs,
    sliceCount,
    targetLongEdgePx,
    timestampsMs: Object.freeze(timestampsMs),
    estimatedRawRgbaBytes,
    maxRawRgbaBytes,
  });
}