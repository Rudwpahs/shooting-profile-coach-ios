import { afterEach, describe, expect, it, vi } from "vitest";

import { createFilmSpaceSamplingPlan } from "@/lib/film-space/sampling";
import {
  disposeWebFilmFrames,
  extractWebFilmFrames,
  isWebLocalFilmUri,
  type WebFilmFrameBitmapV1,
  type WebFrameExtractionPorts,
  type WebVideoHandleV1,
} from "@/lib/film-space/web-frame-extraction";
import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";

const clip: LocalFilmClipRefV1 = {
  slotId: "front-0",
  view: "front",
  takeIndex: 0,
  uri: "blob:https://rudwpahs.github.io/4f2c7d1e-aaaa-bbbb-cccc-000000000001",
  durationMs: 4433,
  width: 512,
  height: 910,
};
const plan = createFilmSpaceSamplingPlan(clip.durationMs);

type FakeOptions = Readonly<{
  openFails?: boolean;
  openHangs?: boolean;
  seekFailsAt?: number;
  seekHangsAt?: number;
  captureFailsAt?: number;
  badDimensionsAt?: number;
  actualOffsetMs?: number;
}>;

function fakePorts(options: FakeOptions = {}) {
  const seeks: number[] = [];
  const closed: number[] = [];
  const created: WebFilmFrameBitmapV1[] = [];
  let disposed = 0;
  let lastSeekMs = 0;
  const handle: WebVideoHandleV1 = {
    durationMs: clip.durationMs,
    width: clip.width,
    height: clip.height,
    seekTo: async (timestampMs) => {
      const index = seeks.length;
      if (options.seekHangsAt === index) return new Promise<number>(() => undefined);
      seeks.push(timestampMs);
      if (options.seekFailsAt === index) throw new Error("seek failed");
      lastSeekMs = timestampMs;
      return timestampMs + (options.actualOffsetMs ?? 0);
    },
    dispose: () => { disposed += 1; },
  };
  const ports: WebFrameExtractionPorts = {
    openVideo: async () => {
      if (options.openHangs) return new Promise<WebVideoHandleV1>(() => undefined);
      if (options.openFails) throw new Error("cannot open");
      return handle;
    },
    captureFrame: async (_handle, targetLongEdgePx) => {
      const index = created.length;
      if (options.captureFailsAt === index) throw new Error("capture failed");
      const bad = options.badDimensionsAt === index;
      let closeCount = 0;
      const bitmap: WebFilmFrameBitmapV1 = {
        width: bad ? 0 : Math.round(targetLongEdgePx * (clip.width / clip.height)),
        height: bad ? Number.NaN : targetLongEdgePx,
        source: { kind: "fake-bitmap", seekMs: lastSeekMs },
        close: () => { closeCount += 1; if (closeCount === 1) closed.push(index); },
      };
      created.push(bitmap);
      return bitmap;
    },
  };
  return { ports, seeks, closed, created, disposedCount: () => disposed };
}

describe("web film frame extraction", () => {
  const consoleSpy = vi.spyOn(console, "log");
  const warnSpy = vi.spyOn(console, "warn");
  const errorSpy = vi.spyOn(console, "error");
  afterEach(() => {
    consoleSpy.mockClear();
    warnSpy.mockClear();
    errorSpy.mockClear();
  });

  it("accepts only browser-local blob URIs as a Film source", () => {
    expect(isWebLocalFilmUri(clip.uri)).toBe(true);
    for (const bad of ["https://example.com/a.mp4", "http://localhost/a.mp4", "data:video/mp4;base64,AAAA", "file:///a.mp4", "", undefined, 42]) {
      expect(isWebLocalFilmUri(bad), String(bad)).toBe(false);
    }
  });

  it("samples exactly the plan's timestamps, in source order, with 64..96 frames", async () => {
    const fake = fakePorts({ actualOffsetMs: 3 });
    const result = await extractWebFilmFrames(clip, plan, fake.ports);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.version).toBe("film_space_frame_cache_v1");
    expect(result.sourceSlotId).toBe(clip.slotId);
    expect(result.targetLongEdgePx).toBe(plan.targetLongEdgePx);
    expect(result.frames.length).toBe(plan.sliceCount);
    expect(result.frames.length).toBeGreaterThanOrEqual(64);
    expect(result.frames.length).toBeLessThanOrEqual(96);
    expect(fake.seeks).toEqual([...plan.timestampsMs]);
    expect(result.frames.map((frame) => frame.requestedTimestampMs)).toEqual([...plan.timestampsMs]);
    expect(result.frames[0].requestedTimestampMs).toBe(0);
    expect(result.frames[result.frames.length - 1].requestedTimestampMs).toBe(clip.durationMs);
    // The decoder's actual time is kept separately from the plan's requested time.
    expect(result.frames.map((frame) => frame.timestampMs)).toEqual(plan.timestampsMs.map((ms) => ms + 3));
    expect(result.frames.every((frame) => frame.width > 0 && frame.height === plan.targetLongEdgePx)).toBe(true);
    expect(result.released).toBe(false);
    expect(fake.disposedCount()).toBe(1);
    expect(fake.closed).toEqual([]);
  });

  it("refuses remote, inline and empty sources without opening a decoder", async () => {
    for (const uri of ["https://example.com/a.mp4", "data:video/mp4;base64,AAAA", "", "file:///a.mp4"]) {
      const fake = fakePorts();
      const open = vi.spyOn(fake.ports, "openVideo");
      const result = await extractWebFilmFrames({ ...clip, uri }, plan, fake.ports);
      expect(result).toEqual({ status: "unavailable", reason: "source_unavailable" });
      expect(open).not.toHaveBeenCalled();
    }
  });

  it("fails closed as source_unavailable when the browser cannot open the clip or metadata never arrives", async () => {
    expect(await extractWebFilmFrames(clip, plan, fakePorts({ openFails: true }).ports))
      .toEqual({ status: "unavailable", reason: "source_unavailable" });
    expect(await extractWebFilmFrames(clip, plan, fakePorts({ openHangs: true }).ports, undefined, { openTimeoutMs: 15 }))
      .toEqual({ status: "unavailable", reason: "source_unavailable" });
  });

  it("treats a seek failure as frame_generation_failed and closes every frame captured so far", async () => {
    const fake = fakePorts({ seekFailsAt: 10 });
    const result = await extractWebFilmFrames(clip, plan, fake.ports);
    expect(result).toEqual({ status: "unavailable", reason: "frame_generation_failed" });
    expect(fake.created.length).toBe(10);
    expect(fake.closed).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(fake.disposedCount()).toBe(1);
  });

  it("treats a seek that never completes as a timeout, not a hang", async () => {
    const fake = fakePorts({ seekHangsAt: 4 });
    const result = await extractWebFilmFrames(clip, plan, fake.ports, undefined, { seekTimeoutMs: 15 });
    expect(result).toEqual({ status: "unavailable", reason: "frame_generation_failed" });
    expect(fake.closed).toEqual([0, 1, 2, 3]);
    expect(fake.disposedCount()).toBe(1);
  });

  it("treats capture failure and malformed frame dimensions as frame_generation_failed", async () => {
    const captureFail = fakePorts({ captureFailsAt: 7 });
    expect(await extractWebFilmFrames(clip, plan, captureFail.ports))
      .toEqual({ status: "unavailable", reason: "frame_generation_failed" });
    expect(captureFail.closed).toEqual([0, 1, 2, 3, 4, 5, 6]);

    const badDims = fakePorts({ badDimensionsAt: 2 });
    expect(await extractWebFilmFrames(clip, plan, badDims.ports))
      .toEqual({ status: "unavailable", reason: "frame_generation_failed" });
    // The malformed frame was produced, so it is closed with the two before it.
    expect(badDims.closed).toEqual([0, 1, 2]);
  });

  it("stops at an aborted signal, closes partial frames, disposes the decoder and never reports partial frames as ready", async () => {
    const pre = new AbortController();
    pre.abort();
    const preFake = fakePorts();
    const openSpy = vi.spyOn(preFake.ports, "openVideo");
    expect(await extractWebFilmFrames(clip, plan, preFake.ports, pre.signal)).toEqual({ status: "cancelled" });
    expect(openSpy).not.toHaveBeenCalled();

    const mid = new AbortController();
    const midFake = fakePorts();
    const originalOpen = midFake.ports.openVideo;
    const ports: WebFrameExtractionPorts = {
      ...midFake.ports,
      openVideo: async (uri, signal) => {
        const handle = await originalOpen(uri, signal);
        return {
          ...handle,
          seekTo: async (ms, s) => {
            const actual = await handle.seekTo(ms, s);
            if (midFake.seeks.length === 20) mid.abort();
            return actual;
          },
        };
      },
    };
    const result = await extractWebFilmFrames(clip, plan, ports, mid.signal);
    expect(result).toEqual({ status: "cancelled" });
    expect(midFake.seeks.length).toBe(20);
    expect(midFake.created.length).toBeLessThanOrEqual(20);
    expect(midFake.closed).toEqual(midFake.created.map((_, index) => index));
  });

  it("releases every bitmap exactly once and is idempotent on repeated dispose", async () => {
    const fake = fakePorts();
    const result = await extractWebFilmFrames(clip, plan, fake.ports);
    if (result.status !== "ready") throw new Error("expected ready");
    await disposeWebFilmFrames(result);
    await disposeWebFilmFrames(result);
    expect(result.released).toBe(true);
    expect(fake.closed).toEqual(result.frames.map((_, index) => index));
  });

  it("never writes to the console", () => {
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
