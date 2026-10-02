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

function controllableLoader() {
  const pending: { clip: LocalFilmClipRefV1; signal: AbortSignal | undefined; resolve: (r: FilmSpaceLocalFrameCacheResult) => void }[] = [];
  const loader = vi.fn((clip: LocalFilmClipRefV1, _plan: typeof plan, signal?: AbortSignal) => new Promise<FilmSpaceLocalFrameCacheResult>((resolve) => {
    pending.push({ clip, signal, resolve });
  }));
  const finish = (index: number) => {
    const entry = pending[index];
    if (!entry) throw new Error(`missing pending loader ${index}`);
    if (entry.signal?.aborted) entry.resolve({ status: "cancelled" });
    else entry.resolve(readyCache(entry.clip.slotId));
  };
  return { loader, pending, finish };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
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

  it("waits for the previous cache cleanup before decoding the next clip", async () => {
    const { loader, pending, finish } = controllableLoader();
    let finishCleanup!: () => void;
    const cleanupGate = new Promise<void>((resolve) => { finishCleanup = resolve; });
    const disposer = vi.fn(async (cache: FilmSpaceLocalFrameCacheV1) => {
      if (cache.sourceSlotId === "front-0") await cleanupGate;
      cache.released = true;
    });
    const controller = createFilmSpaceLocalFrameCacheController(loader, disposer);

    const first = controller.load(clipA, plan);
    finish(0);
    await first;

    const second = controller.load(clipB, plan);
    expect(disposer).toHaveBeenCalledTimes(1);
    expect(controller.current()).toBeNull();
    expect(pending).toHaveLength(1);

    finishCleanup();
    await flushMicrotasks();
    expect(pending).toHaveLength(2);
    finish(1);
    expect((await second).status).toBe("ready");
  });

  it("a load superseded while waiting for cleanup never starts decoding", async () => {
    const { loader, pending, finish } = controllableLoader();
    const disposer = vi.fn(async (cache: FilmSpaceLocalFrameCacheV1) => { cache.released = true; });
    const controller = createFilmSpaceLocalFrameCacheController(loader, disposer);

    const first = controller.load(clipA, plan);
    finish(0);
    await first;

    const third = controller.load(clipA, plan);
    const fourth = controller.load(clipB, plan);
    await flushMicrotasks();

    expect(await third).toEqual({ status: "cancelled" });
    expect(pending).toHaveLength(2);
    expect(pending[1].clip.slotId).toBe("shooting_side-0");
    finish(1);
    expect((await fourth).status).toBe("ready");
    expect(controller.current()?.sourceSlotId).toBe("shooting_side-0");
  });

  it("drops a late ready result from a superseded in-flight load and releases its files", async () => {
    const { loader, pending } = controllableLoader();
    const disposer = vi.fn(async (cache: FilmSpaceLocalFrameCacheV1) => { cache.released = true; });
    const controller = createFilmSpaceLocalFrameCacheController(loader, disposer);
    const first = controller.load(clipA, plan);
    const second = controller.load(clipB, plan);
    pending[0].resolve(readyCache("front-0"));
    expect(await first).toEqual({ status: "cancelled" });
    expect(disposer).toHaveBeenCalledTimes(1);
    expect(disposer.mock.calls[0][0].sourceSlotId).toBe("front-0");
    pending[1].resolve(readyCache("shooting_side-0"));
    expect((await second).status).toBe("ready");
  });

  it("suspend invalidates work waiting behind cleanup and releases the ready cache", async () => {
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
    expect(await again).toEqual({ status: "cancelled" });
    expect(pending).toHaveLength(1);
    expect(disposer).toHaveBeenCalledTimes(1);
  });

  it("disposes idempotently, waits for cleanup, and refuses later loads", async () => {
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

    expect(await controller.load(clipB, plan)).toEqual({ status: "cancelled" });
    expect(pending).toHaveLength(1);
    expect(disposer).toHaveBeenCalledTimes(1);
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
