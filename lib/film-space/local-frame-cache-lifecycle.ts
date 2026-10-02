import type {
  FilmSpaceLocalFrameCacheResult,
  FilmSpaceLocalFrameCacheV1,
  FilmSpaceSamplingPlan,
  LocalFilmClipRefV1,
} from "@/lib/film-space/types";

export type FilmSpaceLocalFrameCacheLoader = (
  clip: LocalFilmClipRefV1,
  plan: FilmSpaceSamplingPlan,
  signal: AbortSignal,
) => Promise<FilmSpaceLocalFrameCacheResult>;

export type FilmSpaceLocalFrameCacheDisposer = (cache: FilmSpaceLocalFrameCacheV1) => Promise<void>;

export type FilmSpaceLocalFrameCacheController = Readonly<{
  /** The ready cache for the most recent load, or `null`. */
  current(): FilmSpaceLocalFrameCacheV1 | null;
  /**
   * Loads a clip. Any earlier extraction is aborted and any earlier cache is
   * released first (clip switching). A result that arrives after it was
   * superseded, suspended or disposed is released at once and reported as
   * cancelled, so a partial or stale cache never becomes current.
   */
  load(clip: LocalFilmClipRefV1, plan: FilmSpaceSamplingPlan): Promise<FilmSpaceLocalFrameCacheResult>;
  /** App background: abort the in-flight extraction and release the ready cache. The controller stays usable. */
  suspend(): void;
  /** Viewer unmount: like suspend, and no later load may adopt a cache. Idempotent. */
  dispose(): Promise<void>;
}>;

/**
 * Owns the lifecycle of one Film Space frame cache for one viewer: clip
 * switching, cancellation, app background and unmount all converge on the
 * same two rules, abort what is in flight and release what is on disk.
 */
export function createFilmSpaceLocalFrameCacheController(
  loader: FilmSpaceLocalFrameCacheLoader,
  disposer: FilmSpaceLocalFrameCacheDisposer,
): FilmSpaceLocalFrameCacheController {
  let generation = 0;
  let active: AbortController | null = null;
  let current: FilmSpaceLocalFrameCacheV1 | null = null;
  let disposed = false;

  const abortActive = () => {
    active?.abort();
    active = null;
  };
  const releaseCurrent = (): Promise<void> => {
    const cache = current;
    current = null;
    return cache ? disposer(cache) : Promise.resolve();
  };

  return {
    current: () => current,

    async load(clip, plan) {
      abortActive();
      void releaseCurrent();
      generation += 1;
      const token = generation;
      const controller = new AbortController();
      active = controller;
      if (disposed) controller.abort();

      let result: FilmSpaceLocalFrameCacheResult;
      try {
        result = await loader(clip, plan, controller.signal);
      } catch {
        result = { status: "unavailable", reason: "frame_generation_failed" };
      }

      const stale = token !== generation || controller.signal.aborted || disposed;
      if (active === controller) active = null;
      if (result.status === "ready") {
        if (stale) {
          void disposer(result);
          return { status: "cancelled" };
        }
        current = result;
        return result;
      }
      return stale ? { status: "cancelled" } : result;
    },

    suspend() {
      abortActive();
      void releaseCurrent();
    },

    async dispose() {
      disposed = true;
      abortActive();
      await releaseCurrent();
    },
  };
}
