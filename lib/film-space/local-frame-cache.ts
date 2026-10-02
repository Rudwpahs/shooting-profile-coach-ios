import type {
  FilmSpaceLocalFrameCacheResult,
  FilmSpaceLocalFrameCacheV1,
  FilmSpaceLocalFrameV1,
  FilmSpaceSamplingPlan,
  LocalFilmClipRefV1,
} from "@/lib/film-space/types";

/**
 * Platform-neutral core of the local file-backed frame cache.
 *
 * The sampling plan stays the only source of truth for which source-video
 * times are extracted; this module only turns each sampled frame into a
 * device-local cache file and owns the cleanup. Every platform concern (how
 * a frame is decoded, written and deleted) comes in through `ports`, so the
 * contract is testable without a native runtime and the web bundle never
 * sees a native module.
 */

const GENERATION_BATCH_SIZE = 16;

export type FilmSpaceGeneratedFrame<TRef> = Readonly<{
  ref: TRef;
  /** Source-video time the decoder actually produced, when it reports one. */
  actualTimestampMs: number | null;
  width: number;
  height: number;
}>;

export type FilmSpacePersistedFrame = Readonly<{
  localUri: string;
  width: number;
  height: number;
}>;

export type FilmSpaceLocalFrameCachePorts<TRef, TSession> = Readonly<{
  /** Opens the local source clip; throws when it is missing or unreadable. */
  open(clip: LocalFilmClipRefV1): Promise<TSession> | TSession;
  close(session: TSession): void;
  /** Decodes the requested source-video times, in order, at most `maxLongEdgePx` on the long edge. */
  generate(
    session: TSession,
    timestampsMs: readonly number[],
    maxLongEdgePx: number,
  ): Promise<readonly FilmSpaceGeneratedFrame<TRef>[]>;
  /** Writes one decoded frame to a device-local cache file. */
  persist(ref: TRef, slotId: string, index: number): Promise<FilmSpacePersistedFrame>;
  /** Frees the in-memory frame once its file exists (or once it is no longer needed). */
  releaseRef(ref: TRef): void;
  /** Deletes one cache file this module wrote. Never called with the source clip's URI. */
  remove(localUri: string): Promise<void>;
}>;

/** A persisted frame must be a device-local file; anything remote, inline or empty is refused. */
export function isLocalFilmFrameUri(uri: unknown): uri is string {
  return typeof uri === "string" && /^file:\/\/.+/i.test(uri);
}

function validSource(clip: LocalFilmClipRefV1): boolean {
  return typeof clip.uri === "string" && clip.uri.length > 0 && !/^https?:/i.test(clip.uri);
}

function positiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function cancelled(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

async function removeAll(
  localUris: readonly string[],
  ports: Pick<FilmSpaceLocalFrameCachePorts<unknown, unknown>, "remove">,
): Promise<void> {
  // Each deletion is independent: one file that refuses to go away must not keep the others.
  await Promise.allSettled(localUris.map((localUri) => ports.remove(localUri)));
}

function releaseAll<TRef>(
  refs: readonly TRef[],
  ports: Pick<FilmSpaceLocalFrameCachePorts<TRef, unknown>, "releaseRef">,
): void {
  for (const ref of refs) {
    try {
      ports.releaseRef(ref);
    } catch {
      // A ref that cannot be released is already unusable; keep releasing the rest.
    }
  }
}

/**
 * Extracts every frame of the plan into device-local cache files. A result is
 * either a complete cache or nothing: cancellation, a missing source, a
 * decoder failure or a bad write removes every file written so far and fails
 * closed, so the caller can fall back to the Motion and Phase views.
 */
export async function createFilmSpaceLocalFrameCache<TRef, TSession>(
  clip: LocalFilmClipRefV1,
  plan: FilmSpaceSamplingPlan,
  ports: FilmSpaceLocalFrameCachePorts<TRef, TSession>,
  signal?: AbortSignal,
): Promise<FilmSpaceLocalFrameCacheResult> {
  if (cancelled(signal)) return { status: "cancelled" };
  if (!validSource(clip)) return { status: "unavailable", reason: "source_unavailable" };

  let session: TSession;
  try {
    session = await ports.open(clip);
  } catch {
    return { status: "unavailable", reason: "source_unavailable" };
  }

  const frames: FilmSpaceLocalFrameV1[] = [];
  const persistedUris: string[] = [];
  const fail = async (reason: "frame_generation_failed" | "frame_persist_failed"): Promise<FilmSpaceLocalFrameCacheResult> => {
    await removeAll(persistedUris, ports);
    return { status: "unavailable", reason };
  };
  const cancel = async (): Promise<FilmSpaceLocalFrameCacheResult> => {
    await removeAll(persistedUris, ports);
    return { status: "cancelled" };
  };

  try {
    for (let start = 0; start < plan.timestampsMs.length; start += GENERATION_BATCH_SIZE) {
      if (cancelled(signal)) return await cancel();
      const batchTimestampsMs = plan.timestampsMs.slice(start, start + GENERATION_BATCH_SIZE);

      let generated: readonly FilmSpaceGeneratedFrame<TRef>[];
      try {
        generated = await ports.generate(session, batchTimestampsMs, plan.targetLongEdgePx);
      } catch {
        return await fail("frame_generation_failed");
      }

      try {
        if (cancelled(signal)) return await cancel();
        if (generated.length !== batchTimestampsMs.length) return await fail("frame_generation_failed");

        for (let offset = 0; offset < generated.length; offset += 1) {
          if (cancelled(signal)) return await cancel();
          const index = start + offset;
          const requestedTimestampMs = batchTimestampsMs[offset];
          const frame = generated[offset];

          let persisted: FilmSpacePersistedFrame;
          try {
            persisted = await ports.persist(frame.ref, clip.slotId, index);
          } catch {
            return await fail("frame_persist_failed");
          }

          if (!isLocalFilmFrameUri(persisted.localUri)) return await fail("frame_persist_failed");
          // The file exists from here on: it is cleaned up even if its metadata is unusable.
          persistedUris.push(persisted.localUri);
          if (!positiveFinite(persisted.width) || !positiveFinite(persisted.height)) {
            return await fail("frame_persist_failed");
          }

          frames.push({
            requestedTimestampMs,
            actualTimestampMs: typeof frame.actualTimestampMs === "number" && Number.isFinite(frame.actualTimestampMs)
              ? Math.round(frame.actualTimestampMs)
              : requestedTimestampMs,
            width: persisted.width,
            height: persisted.height,
            localUri: persisted.localUri,
          });
        }
      } finally {
        releaseAll(generated.map((frame) => frame.ref), ports);
      }
    }

    if (cancelled(signal)) return await cancel();
    return {
      version: "film_space_local_frame_cache_v1",
      status: "ready",
      sourceSlotId: clip.slotId,
      targetLongEdgePx: plan.targetLongEdgePx,
      frames,
      released: false,
    };
  } catch {
    return await fail("frame_generation_failed");
  } finally {
    try {
      ports.close(session);
    } catch {
      // The source handle is best-effort; the files are what must not leak.
    }
  }
}

/** Deletes every cache file exactly once; later calls are no-ops. */
export async function releaseFilmSpaceLocalFrameCache(
  cache: FilmSpaceLocalFrameCacheV1,
  ports: Pick<FilmSpaceLocalFrameCachePorts<unknown, unknown>, "remove">,
): Promise<void> {
  if (cache.released) return;
  cache.released = true;
  await removeAll(cache.frames.map((frame) => frame.localUri), ports);
}
