import { describe, expect, it } from "vitest";

import { resolveFilmSpaceGLTextureSources, resolveFilmSpaceLocalFrameGLTextureSources } from "@/lib/film-space/gl-texture-source";
import type { FilmSpaceFrameV1, FilmSpaceLocalFrameV1 } from "@/lib/film-space/types";

function frame(
  imageRef: unknown,
  index = 0,
): FilmSpaceFrameV1<unknown> {
  return {
    timestampMs: index * 10,
    requestedTimestampMs: index * 10,
    width: 240,
    height: 180,
    imageRef,
  };
}

describe("film-space GL texture source", () => {
  it("accepts bounded file-backed local frames without changing source order", () => {
    const sources = resolveFilmSpaceGLTextureSources([
      frame({ localUri: "file:///cache/shot-000.jpg" }, 0),
      frame({ uri: "file:///cache/shot-001.jpg" }, 1),
      frame("file:///cache/shot-002.jpg", 2),
    ]);

    expect(sources?.map((source) => source.requestedTimestampMs)).toEqual([0, 10, 20]);
    expect(sources?.map((source) => source.localUri)).toEqual([
      "file:///cache/shot-000.jpg",
      "file:///cache/shot-001.jpg",
      "file:///cache/shot-002.jpg",
    ]);
  });

  it("maps the file-backed cache contract directly into GPU texture sources", () => {
    const frames: readonly FilmSpaceLocalFrameV1[] = [
      { requestedTimestampMs: 0, actualTimestampMs: 4, width: 240, height: 180, localUri: "file:///cache/local-000.jpg" },
      { requestedTimestampMs: 40, actualTimestampMs: 43, width: 240, height: 180, localUri: "file:///cache/local-001.jpg" },
    ];

    expect(resolveFilmSpaceLocalFrameGLTextureSources(frames)).toEqual([
      { requestedTimestampMs: 0, width: 240, height: 180, localUri: "file:///cache/local-000.jpg" },
      { requestedTimestampMs: 40, width: 240, height: 180, localUri: "file:///cache/local-001.jpg" },
    ]);
  });

  it("fails closed for remote, opaque native refs, invalid dimensions, or an unbounded stack", () => {
    expect(resolveFilmSpaceGLTextureSources([frame("https://example.com/frame.jpg")])).toBeNull();
    expect(resolveFilmSpaceGLTextureSources([frame({ nativeRefType: "image" })])).toBeNull();
    expect(resolveFilmSpaceGLTextureSources([{ ...frame("file:///cache/a.jpg"), width: 0 }])).toBeNull();
    expect(resolveFilmSpaceGLTextureSources(
      Array.from({ length: 97 }, (_, index) => frame(`file:///cache/${index}.jpg`, index)),
    )).toBeNull();
  });
});
