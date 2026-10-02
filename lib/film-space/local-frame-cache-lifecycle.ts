import type {
  FilmSpaceLocalFrameCacheResult,
  FilmSpaceLocalFrameCacheV1,
  FilmSpaceSamplingPlan,
  LocalFilmClipRefV1,
} from "@/lib/film-space/types";

/** Any ready cache the controller can own: it only needs to know when it has been released. */
export type FilmSpaceReadyCacheLike = { status: "ready"; released: boolean };

/** Any result union: one ready shape plus the non-ready statuses every frame source shares. */
export type FilmSpaceCacheResultLike =
  | FilmSpaceReadyCacheLike
  | { status: "unavailable" }
  | { status: "cancelled" }
  | { status: "unsupported_platform" };

export type FilmSpaceLocalFrameCacheLoader<TResult extends FilmSpaceCacheResultLike = FilmSpaceLocalFrameCacheResult> = (
  clip: LocalFilmClipRefV1,
  plan: FilmSpaceSamplingPlan,
  signal: AbortSignal,
) => Promise<TResult>;

export type FilmSpaceLocalFrameCacheDisposer<TReady extends FilmSpaceReadyCacheLike = FilmSpaceLocalFrameCacheV1> = (
  cache: TReady,
) => Promise<void>;

export type FilmSpaceLocalFrameCacheController<TResult extends FilmSpaceCacheResultLike = FilmSpaceLocalFrameCacheResult> = Readonly<{
  /** The ready cache for the most recent load, or `null`. */
  current(): Extract<TResult, FilmSpaceReadyCacheLike> | null;
  /**
   * Loads a clip. Any earlier extraction is aborted and any earlier cache is
   * fully released before the next extraction starts. A result that arrives
   * after it was superseded, suspended or disposed is released at once and
   * reported as cancelled.
   */
  load(clip: LocalFilmClipRefV1, plan: FilmSpaceSamplingPlan): Promise<TResult | { status: "cancelled" }>;
  /** App background: abort in-flight work and queue release of the ready cache. */
  suspend(): void;
  /** Viewer unmount: like suspend, but waits for queued cleanup and permanently rejects new loads. */
  dispose(): Promise<void>;
}>;

/**
 * Owns the lifecycle of one Film Space frame cache for one viewer. The cache
 * representation (device files on native, browser bitmaps on web) is decided
 * by the loader and disposer handed in; the ordering rules are the same.
 */
export function createFilmSpaceLocalFrameCacheController<TResult extends FilmSpaceCacheResultLike>(
  loader: FilmSpaceLocalFrameCacheLoader<TResult>,
  // The result type is inferred from the loader alone; the disposer just has to accept its ready shape.
  disposer: FilmSpaceLocalFrameCacheDisposer<Extract<NoInfer<TResult>, FilmSpaceReadyCacheLike>>,
): FilmSpaceLocalFrameCacheController<TResult>;
// The file-backed native cache is the default shape, so `ReturnType<typeof …>` keeps resolving to it.
export function createFilmSpaceLocalFrameCacheController(
  loader: FilmSpaceLocalFrameCacheLoader,
  disposer: FilmSpaceLocalFrameCacheDisposer,
): FilmSpaceLocalFrameCacheController;
export function createFilmSpaceLocalFrameCacheController<TResult extends FilmSpaceCacheResultLike>(
  loader: FilmSpaceLocalFrameCacheLoader<TResult>,
  disposer: FilmSpaceLocalFrameCacheDisposer<Extract<TResult, FilmSpaceReadyCacheLike>>,
): FilmSpaceLocalFrameCacheController<TResult> {
  type Ready = Extract<TResult, FilmSpaceReadyCacheLike>;
  let generation = 0;
  let active: AbortController | null = null;
  let current: Ready | null = null;
  let disposed = false;
  let cleanupTail: Promise<void> | null = null;

  const abortActive = () => {
    active?.abort();
    active = null;
  };

  const queueDispose = (cache: Ready): Promise<void> => {
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

  const isReady = (result: TResult): result is Ready => result.status === "ready";

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

      let result: TResult;
      try {
        result = await loader(clip, plan, controller.signal);
      } catch {
        result = { status: "unavailable", reason: "frame_generation_failed" } as unknown as TResult;
      }

      const stale = token !== generation || controller.signal.aborted || disposed;
      if (active === controller) active = null;
      if (isReady(result)) {
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
