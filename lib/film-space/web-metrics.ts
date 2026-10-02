/**
 * Anonymous Film Space timing for the browser: counts and milliseconds only.
 * Nothing that could identify a clip (no address, no name, no location of
 * the file) is ever part of a metric.
 */

export type FilmSpaceWebMetricsV1 = Readonly<{
  version: "film_space_web_metrics_v1";
  sourceSlotId: string;
  sliceCount: number;
  durationMs: number;
  targetLongEdgePx: number;
  extractionMs: number;
  approxCacheBytes: number;
  textureReadyMs: number | null;
  firstVisibleMs: number | null;
  renderer: "webgl" | "canvas2d";
}>;

type Listener = (metrics: FilmSpaceWebMetricsV1) => void;

const listeners = new Set<Listener>();
let latest: FilmSpaceWebMetricsV1 | null = null;

export function publishFilmSpaceWebMetrics(metrics: FilmSpaceWebMetricsV1): void {
  latest = metrics;
  for (const listener of listeners) {
    try {
      listener(metrics);
    } catch {
      // A failing listener must never affect the viewer.
    }
  }
}

export function subscribeFilmSpaceWebMetrics(listener: Listener): () => void {
  listeners.add(listener);
  if (latest) listener(latest);
  return () => { listeners.delete(listener); };
}

export function latestFilmSpaceWebMetrics(): FilmSpaceWebMetricsV1 | null {
  return latest;
}
