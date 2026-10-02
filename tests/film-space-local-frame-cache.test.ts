import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createFilmSpaceLocalFrameCache,
  isLocalFilmFrameUri,
  releaseFilmSpaceLocalFrameCache,
  type FilmSpaceLocalFrameCachePorts,
} from "@/lib/film-space/local-frame-cache";
import { createFilmSpaceSamplingPlan } from "@/lib/film-space/sampling";
import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";

type Ref = { id: number; released: boolean };
type Session = { uri: string; closed: boolean };

const clip: LocalFilmClipRefV1 = {
  slotId: "front-0",
  view: "front",
  takeIndex: 0,
  uri: "file:///var/mobile/Containers/Data/Application/app/Library/Caches/clip-front-0.mov",
  durationMs: 3000,
  width: 1080,
  height: 1920,
};

type FakeOptions = {
  persistUri?: (index: number) => string;
  persistSize?: (index: number) => { width: number; height: number };
  actual?: (requestedMs: number) => number | null;
  failGenerateAtBatch?: number;
  shortGenerateAtBatch?: number;
  failPersistAtIndex?: number;
  failOpen?: boolean;
  abortAfterBatch?: { controller: AbortController; batch: number };
};

function fakePorts(options: FakeOptions = {}) {
  let nextRef = 0;
  let persistIndex = 0;
  let batch = 0;
  const refs: Ref[] = [];
  const sessions: Session[] = [];
  const removed: string[] = [];
  const generateBatches: number[][] = [];
  const ports: FilmSpaceLocalFrameCachePorts<Ref, Session> = {
    async open(source) {
      if (options.failOpen) throw new Error("asset missing");
      const session = { uri: source.uri, closed: false };
      sessions.push(session);
      return session;
    },
    close(session) {
      session.closed = true;
    },
    async generate(_session, timestampsMs) {
      const current = batch;
      batch += 1;
      generateBatches.push([...timestampsMs]);
      if (options.failGenerateAtBatch === current) throw new Error("decoder failed");
      const count = options.shortGenerateAtBatch === current ? timestampsMs.length - 1 : timestampsMs.length;
      const result = timestampsMs.slice(0, count).map((requestedMs) => {
        const ref = { id: nextRef, released: false };
        nextRef += 1;
        refs.push(ref);
        return { ref, actualTimestampMs: options.actual ? options.actual(requestedMs) : requestedMs + 7, width: 240, height: 426 };
      });
      if (options.abortAfterBatch && options.abortAfterBatch.batch === current) options.abortAfterBatch.controller.abort();
      return result;
    },
    async persist(ref, slotId, index) {
      if (options.failPersistAtIndex === index) throw new Error("disk full");
      persistIndex += 1;
      const localUri = options.persistUri ? options.persistUri(index) : `file:///var/mobile/Caches/hoophub-film-space/${slotId}/frame-${index}.jpg`;
      const size = options.persistSize ? options.persistSize(index) : { width: ref.id >= 0 ? 240 : 0, height: 426 };
      return { localUri, ...size };
    },
    releaseRef(ref) {
      ref.released = true;
    },
    async remove(localUri) {
      removed.push(localUri);
    },
  };
  return { ports, refs, sessions, removed, generateBatches, persisted: () => persistIndex };
}

const plan = createFilmSpaceSamplingPlan(3000);
const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

afterEach(() => {
  warn.mockClear();
  log.mockClear();
  error.mockClear();
});

describe("film-space local frame cache: extraction", () => {
  it("writes one local file per planned timestamp, in plan order, keeping the requested and the actual time", async () => {
    const fake = fakePorts();
    const result = await createFilmSpaceLocalFrameCache(clip, plan, fake.ports);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.version).toBe("film_space_local_frame_cache_v1");
    expect(result.sourceSlotId).toBe(clip.slotId);
    expect(result.targetLongEdgePx).toBe(plan.targetLongEdgePx);
    expect(result.frames.map((frame) => frame.requestedTimestampMs)).toEqual([...plan.timestampsMs]);
    expect(result.frames.map((frame) => frame.actualTimestampMs)).toEqual(plan.timestampsMs.map((ms) => ms + 7));
    expect(result.frames.every((frame) => frame.width === 240 && frame.height === 426)).toBe(true);
    expect(result.frames.every((frame) => frame.localUri.startsWith("file://"))).toBe(true);
    expect(new Set(result.frames.map((frame) => frame.localUri)).size).toBe(plan.sliceCount);
    expect(result.released).toBe(false);
    // In-memory refs are released as soon as their file exists; the session is closed.
    expect(fake.refs.every((ref) => ref.released)).toBe(true);
    expect(fake.sessions.every((session) => session.closed)).toBe(true);
    expect(fake.removed).toEqual([]);
  });

  it("keeps the frame count bounded by the plan and generates in bounded batches", async () => {
    const wide = createFilmSpaceSamplingPlan(20_000, { preferredSlices: 500 });
    const fake = fakePorts();
    const result = await createFilmSpaceLocalFrameCache(clip, wide, fake.ports);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.frames.length).toBe(wide.sliceCount);
    expect(result.frames.length).toBeLessThanOrEqual(96);
    expect(fake.generateBatches.every((batch) => batch.length <= 16)).toBe(true);
    expect(fake.generateBatches.flat()).toEqual([...wide.timestampsMs]);
  });

  it("falls back to the requested time when the decoder reports no actual time", async () => {
    const fake = fakePorts({ actual: () => null });
    const result = await createFilmSpaceLocalFrameCache(clip, plan, fake.ports);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.frames.map((frame) => frame.actualTimestampMs)).toEqual([...plan.timestampsMs]);
  });

  it("refuses a source that is not a local file before opening anything", async () => {
    for (const uri of ["https://example.com/clip.mov", "http://example.com/clip.mov", ""]) {
      const fake = fakePorts();
      const result = await createFilmSpaceLocalFrameCache({ ...clip, uri }, plan, fake.ports);
      expect(result).toEqual({ status: "unavailable", reason: "source_unavailable" });
      expect(fake.sessions).toHaveLength(0);
    }
  });

  it("reports a missing source as unavailable and leaves nothing behind", async () => {
    const fake = fakePorts({ failOpen: true });
    const result = await createFilmSpaceLocalFrameCache(clip, plan, fake.ports);
    expect(result).toEqual({ status: "unavailable", reason: "source_unavailable" });
    expect(fake.removed).toEqual([]);
  });
});

describe("film-space local frame cache: validation of what came back", () => {
  it("accepts only file URIs for persisted frames", () => {
    expect(isLocalFilmFrameUri("file:///var/mobile/Caches/x.jpg")).toBe(true);
    expect(isLocalFilmFrameUri("https://cdn.example.com/x.jpg")).toBe(false);
    expect(isLocalFilmFrameUri("http://cdn.example.com/x.jpg")).toBe(false);
    expect(isLocalFilmFrameUri("")).toBe(false);
    expect(isLocalFilmFrameUri("data:image/jpeg;base64,AAAA")).toBe(false);
    expect(isLocalFilmFrameUri("blob:http://localhost/abc")).toBe(false);
    expect(isLocalFilmFrameUri(undefined)).toBe(false);
    expect(isLocalFilmFrameUri(42)).toBe(false);
  });

  it("rejects a persisted frame with a remote or empty URI and removes every file written so far", async () => {
    for (const bad of ["https://cdn.example.com/frame.jpg", ""]) {
      const fake = fakePorts({ persistUri: (index) => (index === 5 ? bad : `file:///tmp/f/${index}.jpg`) });
      const result = await createFilmSpaceLocalFrameCache(clip, plan, fake.ports);
      expect(result).toEqual({ status: "unavailable", reason: "frame_persist_failed" });
      expect(fake.removed).toEqual([0, 1, 2, 3, 4].map((index) => `file:///tmp/f/${index}.jpg`));
      expect(fake.removed).not.toContain(clip.uri);
      expect(fake.refs.every((ref) => ref.released)).toBe(true);
      expect(fake.sessions.every((session) => session.closed)).toBe(true);
    }
  });

  it("rejects malformed persisted dimensions and cleans up", async () => {
    const fake = fakePorts({ persistSize: (index) => (index === 3 ? { width: 0, height: Number.NaN } : { width: 240, height: 426 }) });
    const result = await createFilmSpaceLocalFrameCache(clip, plan, fake.ports);
    expect(result).toEqual({ status: "unavailable", reason: "frame_persist_failed" });
    // The malformed frame's file exists on disk too, so it is removed with the three before it.
    expect(fake.removed).toHaveLength(4);
    expect(fake.removed).not.toContain(clip.uri);
  });

  it("treats a decoder returning fewer frames than requested as a generation failure and cleans up", async () => {
    const fake = fakePorts({ shortGenerateAtBatch: 2 });
    const result = await createFilmSpaceLocalFrameCache(clip, plan, fake.ports);
    expect(result).toEqual({ status: "unavailable", reason: "frame_generation_failed" });
    expect(fake.removed).toHaveLength(32);
    expect(fake.refs.every((ref) => ref.released)).toBe(true);
  });
});

describe("film-space local frame cache: cleanup lifecycle", () => {
  it("removes every file on release, exactly once, however often release is called", async () => {
    const fake = fakePorts();
    const result = await createFilmSpaceLocalFrameCache(clip, plan, fake.ports);
    if (result.status !== "ready") throw new Error("expected ready");
    await releaseFilmSpaceLocalFrameCache(result, fake.ports);
    expect(result.released).toBe(true);
    expect(fake.removed).toEqual(result.frames.map((frame) => frame.localUri));
    await releaseFilmSpaceLocalFrameCache(result, fake.ports);
    await releaseFilmSpaceLocalFrameCache(result, fake.ports);
    expect(fake.removed).toHaveLength(plan.sliceCount);
    expect(fake.removed).not.toContain(clip.uri);
  });

  it("keeps releasing when one file refuses to go away", async () => {
    const fake = fakePorts();
    const result = await createFilmSpaceLocalFrameCache(clip, plan, fake.ports);
    if (result.status !== "ready") throw new Error("expected ready");
    const flaky = { ...fake.ports, remove: async (uri: string) => { if (uri.endsWith("frame-1.jpg")) throw new Error("busy"); await fake.ports.remove(uri); } };
    await expect(releaseFilmSpaceLocalFrameCache(result, flaky)).resolves.toBeUndefined();
    expect(fake.removed).toHaveLength(plan.sliceCount - 1);
    expect(result.released).toBe(true);
  });

  it("cleans up a partial extraction when the decoder throws mid-way", async () => {
    const fake = fakePorts({ failGenerateAtBatch: 3 });
    const result = await createFilmSpaceLocalFrameCache(clip, plan, fake.ports);
    expect(result).toEqual({ status: "unavailable", reason: "frame_generation_failed" });
    expect(fake.removed).toHaveLength(48);
    expect(fake.removed).not.toContain(clip.uri);
    expect(fake.sessions.every((session) => session.closed)).toBe(true);
  });

  it("cleans up a partial extraction when a write fails", async () => {
    const fake = fakePorts({ failPersistAtIndex: 20 });
    const result = await createFilmSpaceLocalFrameCache(clip, plan, fake.ports);
    expect(result).toEqual({ status: "unavailable", reason: "frame_persist_failed" });
    expect(fake.removed).toHaveLength(20);
    expect(fake.refs.every((ref) => ref.released)).toBe(true);
  });
});

describe("film-space local frame cache: cancellation", () => {
  it("returns cancelled without opening the source when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fake = fakePorts();
    const result = await createFilmSpaceLocalFrameCache(clip, plan, fake.ports, controller.signal);
    expect(result).toEqual({ status: "cancelled" });
    expect(fake.sessions).toHaveLength(0);
  });

  it("stops after the current batch, removes the written frames and never returns a partial cache", async () => {
    const controller = new AbortController();
    const fake = fakePorts({ abortAfterBatch: { controller, batch: 1 } });
    const result = await createFilmSpaceLocalFrameCache(clip, plan, fake.ports, controller.signal);
    expect(result).toEqual({ status: "cancelled" });
    expect(fake.generateBatches).toHaveLength(2);
    expect(fake.persisted()).toBeLessThanOrEqual(32);
    expect(fake.removed).toHaveLength(fake.persisted());
    expect(fake.removed).not.toContain(clip.uri);
    expect(fake.refs.every((ref) => ref.released)).toBe(true);
    expect(fake.sessions.every((session) => session.closed)).toBe(true);
  });

  it("never prints to the console, so no URI can reach a log", async () => {
    const controller = new AbortController();
    const fake = fakePorts({ abortAfterBatch: { controller, batch: 0 }, failPersistAtIndex: 1 });
    await createFilmSpaceLocalFrameCache(clip, plan, fake.ports, controller.signal);
    await createFilmSpaceLocalFrameCache({ ...clip, uri: "https://x" }, plan, fake.ports);
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
