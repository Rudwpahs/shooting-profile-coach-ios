import { describe, expect, it, vi } from "vitest";

import { createFilmSpaceLocalFrameCacheController } from "@/lib/film-space/local-frame-cache-lifecycle";
import { createFilmSpaceSamplingPlan } from "@/lib/film-space/sampling";
import type {
  FilmSpaceLocalFrameCacheResult,
  FilmSpaceLocalFrameCacheV1,
  LocalFilmClipRefV1,
} from "@/lib/film-space/types";

const plan = createFilmSpaceSamplingPlan(3000);
const clipA: LocalFilmClipRefV1 = { slotId: "front-0", view: "front", takeIndex: 0, uri: "file:///caches/a.mov", durationMs: 3000, width: 1080, height: 1920 };
const clipB: LocalFilmClipRefV1 = { ...clipA, slotId: "shooting_side-0", view: "shooting_side", uri: "file:///caches/b.mov" };

function readyCache(slotId: string): FilmSpaceLocalFrameCacheV1 {
  return {
    version: "film_space_local_frame_cache_v1",
    status: "ready",
    sourceSlotId: slotId,
    targetLongEdgePx: plan.targetLongEdgePx,
    frames: plan.timestampsMs.map((ms, index) => ({ requestedTimestampMs: ms, actualTimestampMs: ms, width: 240, height: 426, localUri: `file:///caches/${slotId}/${index}.jpg` })),
    released: false,
  };
}

/** A loader whose completion the test controls; it honours the signal like the real one. */
function controllableLoader() {
  const pending: { clip: LocalFilmClipRefV1; signal: AbortSignal | undefined; resolve: (r: FilmSpaceLocalFrameCacheResult) => void }[] = [];
  const loader = vi.fn((clip: LocalFilmClipRefV1, _plan: typeof plan, signal?: AbortSignal) => new Promise<FilmSpaceLocalFrameCacheResult>((resolve) => {
    pending.push({ clip, signal, resolve });
  }));
  const finish = (index: number) => {
    const entry = pending[index];
    if (entry.signal?.aborted) entry.resolve({ status: "cancelled" });
    else entry.resolve(readyCache(entry.clip.slotId));
  };
  return { loader, pending, finish };
}

describe("film-space local frame cache controller", () => {
  it("loads a clip and exposes the ready cache", async () => {
    const { loader, finish } = controllableLoader();
    const disposer = vi.fn(async (cache: FilmSpaceLocalFrameCacheV1) => { cache.released = true; });
    const controller = createFilmSpaceLocalFrameCacheController(loader, disposer);
    const load = controller.load(clipA, plan);
    finish(0);
    const result = await load;
    expect(result.status).toBe("ready");
    expect(controller.current()?.sourceSlotId).toBe("front-0");
    expect(disposer).not.toHaveBeenCalled();
  });

  it("switching clips aborts the previous extraction and releases the previous cache", async () => {
    const { loader, pending, finish } = controllableLoader();
    const disposer = vi.fn(async (cache: FilmSpaceLocalFrameCacheV1) => { cache.released = true; });
    const controller = createFilmSpaceLocalFrameCacheController(loader, disposer);
    const first = controller.load(clipA, plan);
    finish(0);
    const firstResult = await first;
    expect(firstResult.status).toBe("ready");

    const second = controller.load(clipB, plan);
    // The first cache is gone before the second clip is even decoded.
    expect(disposer).toHaveBeenCalledTimes(1);
    expect(controller.current()).toBeNull();
    finish(1);
    const secondResult = await second;
    expect(secondResult.status).toBe("ready");
    expect(controller.current()?.sourceSlotId).toBe("shooting_side-0");

    // A still-pending load that is superseded is aborted and its late result is dropped and released.
    const third = controller.load(clipA, plan);
    const fourth = controller.load(clipB, plan);
    expect(pending[2].signal?.aborted).toBe(true);
    expect(pending[3].signal?.aborted).toBe(false);
    finish(2);
    expect(await third).toEqual({ status: "cancelled" });
    finish(3);
    expect((await fourth).status).toBe("ready");
    expect(controller.current()?.sourceSlotId).toBe("shooting_side-0");
  });

  it("drops a late ready result from a superseded load and releases its files", async () => {
    const { loader, pending } = controllableLoader();
    const disposer = vi.fn(async (cache: FilmSpaceLocalFrameCacheV1) => { cache.released = true; });
    const controller = createFilmSpaceLocalFrameCacheController(loader, disposer);
    const first = controller.load(clipA, plan);
    const second = controller.load(clipB, plan);
    // The first loader ignores the abort and still hands back a cache: it must not become current.
    pending[0].resolve(readyCache("front-0"));
    expect(await first).toEqual({ status: "cancelled" });
    expect(disposer).toHaveBeenCalledTimes(1);
    expect(disposer.mock.calls[0][0].sourceSlotId).toBe("front-0");
    pending[1].resolve(readyCache("shooting_side-0"));
    expect((await second).status).toBe("ready");
  });

  it("suspends on app background: aborts the pending load and releases the ready cache", async () => {
    const { loader, pending, finish } = controllableLoader();
    const disposer = vi.fn(async (cache: FilmSpaceLocalFrameCacheV1) => { cache.released = true; });
    const controller = createFilmSpaceLocalFrameCacheController(loader, disposer);
    const load = controller.load(clipA, plan);
    finish(0);
    await load;
    controller.suspend();
    expect(disposer).toHaveBeenCalledTimes(1);
    expect(controller.current()).toBeNull();

    const again = controller.load(clipA, plan);
    controller.suspend();
    expect(pending[1].signal?.aborted).toBe(true);
    finish(1);
    expect(await again).toEqual({ status: "cancelled" });
    expect(disposer).toHaveBeenCalledTimes(1);
  });

  it("disposes once, idempotently, and refuses to adopt a cache that arrives afterwards", async () => {
    const { loader, pending, finish } = controllableLoader();
    const disposer = vi.fn(async (cache: FilmSpaceLocalFrameCacheV1) => { cache.released = true; });
    const controller = createFilmSpaceLocalFrameCacheController(loader, disposer);
    const load = controller.load(clipA, plan);
    finish(0);
    await load;
    await controller.dispose();
    await controller.dispose();
    expect(disposer).toHaveBeenCalledTimes(1);
    expect(controller.current()).toBeNull();

    const late = controller.load(clipB, plan);
    expect(pending[1].signal?.aborted).toBe(true);
    pending[1].resolve(readyCache("shooting_side-0"));
    expect(await late).toEqual({ status: "cancelled" });
    expect(disposer).toHaveBeenCalledTimes(2);
    expect(controller.current()).toBeNull();
  });

  it("passes non-ready results through unchanged and keeps nothing to release", async () => {
    const loader = vi.fn(async (): Promise<FilmSpaceLocalFrameCacheResult> => ({ status: "unavailable", reason: "source_unavailable" }));
    const disposer = vi.fn(async () => undefined);
    const controller = createFilmSpaceLocalFrameCacheController(loader, disposer);
    expect(await controller.load(clipA, plan)).toEqual({ status: "unavailable", reason: "source_unavailable" });
    expect(controller.current()).toBeNull();
    await controller.dispose();
    expect(disposer).not.toHaveBeenCalled();
  });
});
