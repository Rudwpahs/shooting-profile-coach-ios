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
   * fully released before the next extraction starts. A result that arrives
   * after it was superseded, suspended or disposed is released at once and
   * reported as cancelled.
   */
  load(clip: LocalFilmClipRefV1, plan: FilmSpaceSamplingPlan): Promise<FilmSpaceLocalFrameCacheResult>;
  /** App background: abort in-flight work and queue release of the ready cache. */
  suspend(): void;
  /** Viewer unmount: like suspend, but waits for queued cleanup and permanently rejects new loads. */
  dispose(): Promise<void>;
}>;

export function createFilmSpaceLocalFrameCacheController(
  loader: FilmSpaceLocalFrameCacheLoader,
  disposer: FilmSpaceLocalFrameCacheDisposer,
): FilmSpaceLocalFrameCacheController {
  let generation = 0;
  let active: AbortController | null = null;
  let current: FilmSpaceLocalFrameCacheV1 | null = null;
  let disposed = false;
  let cleanupTail: Promise<void> | null = null;

  const abortActive = () => {
    active?.abort();
    active = null;
  };

  const queueDispose = (cache: FilmSpaceLocalFrameCacheV1): Promise<void> => {
    const disposeOne = async () => {
      try {
        await disposer(cache);
      } catch {
        // Cache cleanup is best-effort, but later cleanup must still run.
      }
    };

    const previous = cleanupTail;
    const next = previous ? previous.then(disposeOne, disposeOne) : disposeOne();
    const tracked = next.finally(() => {
      if (cleanupTail === tracked) cleanupTail = null;
    });
    cleanupTail = tracked;
    return tracked;
  };

  const releaseCurrent = (): Promise<void> | null => {
    const cache = current;
    current = null;
    if (cache) return queueDispose(cache);
    return cleanupTail;
  };

  return {
    current: () => current,

    async load(clip, plan) {
      abortActive();
      generation += 1;
      const token = generation;

      const cleanup = releaseCurrent();
      if (cleanup) await cleanup;
      if (token !== generation || disposed) return { status: "cancelled" };

      const controller = new AbortController();
      active = controller;

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
          await queueDispose(result);
          return { status: "cancelled" };
        }
        current = result;
        return result;
      }
      return stale ? { status: "cancelled" } : result;
    },

    suspend() {
      generation += 1;
      abortActive();
      void releaseCurrent();
    },

    async dispose() {
      if (!disposed) {
        disposed = true;
        generation += 1;
        abortActive();
      }
      const cleanup = releaseCurrent();
      if (cleanup) await cleanup;
    },
  };
}
