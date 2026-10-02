import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  FILM_SLICE_FRAGMENT_SHADER,
  FILM_SLICE_MAX_TEXTURES,
  FILM_SLICE_QUAD,
  FILM_SLICE_UV,
  FILM_SLICE_VERTEX_SHADER,
  orderFilmSlicesForDraw,
} from "@/lib/film-space/gl-slice-shader";
import { createFilmSpaceSliceStack, normalizeFilmSpaceCamera } from "@/lib/film-space/slice-stack";
import { createFilmSliceGLEngine, type FilmSliceGLContext } from "@/lib/film-space/web-gl-slice-renderer";

type Call = { name: string; args: unknown[] };

function fakeGL(options: { failTextureAt?: number; failProgram?: boolean } = {}) {
  const calls: Call[] = [];
  let textureCount = 0;
  const live = { textures: new Set<object>(), buffers: new Set<object>(), programs: new Set<object>(), shaders: new Set<object>() };
  const record = (name: string) => (...args: unknown[]) => { calls.push({ name, args }); };
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, STATIC_DRAW: 6,
    TEXTURE_2D: 7, TEXTURE_MIN_FILTER: 8, TEXTURE_MAG_FILTER: 9, TEXTURE_WRAP_S: 10, TEXTURE_WRAP_T: 11, LINEAR: 12,
    CLAMP_TO_EDGE: 13, RGBA: 14, UNSIGNED_BYTE: 15, COLOR_BUFFER_BIT: 16, DEPTH_BUFFER_BIT: 32, DEPTH_TEST: 17,
    BLEND: 18, SRC_ALPHA: 19, ONE_MINUS_SRC_ALPHA: 20, FLOAT: 21, TRIANGLES: 22, TEXTURE0: 23, UNPACK_FLIP_Y_WEBGL: 24,
    drawingBufferWidth: 390, drawingBufferHeight: 320,
    createShader: () => { const shader = {}; live.shaders.add(shader); return shader; },
    shaderSource: record("shaderSource"),
    compileShader: record("compileShader"),
    getShaderParameter: () => true,
    deleteShader: (shader: object) => { live.shaders.delete(shader); calls.push({ name: "deleteShader", args: [shader] }); },
    createProgram: () => { const program = {}; live.programs.add(program); return program; },
    attachShader: record("attachShader"),
    linkProgram: record("linkProgram"),
    getProgramParameter: () => !options.failProgram,
    deleteProgram: (program: object) => { live.programs.delete(program); calls.push({ name: "deleteProgram", args: [program] }); },
    createBuffer: () => { const buffer = {}; live.buffers.add(buffer); return buffer; },
    bindBuffer: record("bindBuffer"),
    bufferData: record("bufferData"),
    deleteBuffer: (buffer: object) => { live.buffers.delete(buffer); calls.push({ name: "deleteBuffer", args: [buffer] }); },
    createTexture: () => {
      textureCount += 1;
      if (options.failTextureAt !== undefined && textureCount - 1 === options.failTextureAt) return null;
      const texture = { id: textureCount - 1 };
      live.textures.add(texture);
      return texture;
    },
    bindTexture: record("bindTexture"),
    texParameteri: record("texParameteri"),
    pixelStorei: record("pixelStorei"),
    texImage2D: record("texImage2D"),
    deleteTexture: (texture: object) => { live.textures.delete(texture); calls.push({ name: "deleteTexture", args: [texture] }); },
    getAttribLocation: (_: object, name: string) => (name === "a_position" ? 0 : 1),
    getUniformLocation: (_: object, name: string) => ({ name }),
    viewport: record("viewport"),
    clearColor: record("clearColor"),
    clear: record("clear"),
    disable: record("disable"),
    enable: record("enable"),
    blendFunc: record("blendFunc"),
    useProgram: record("useProgram"),
    enableVertexAttribArray: record("enableVertexAttribArray"),
    vertexAttribPointer: record("vertexAttribPointer"),
    uniform1f: record("uniform1f"),
    uniform1i: record("uniform1i"),
    activeTexture: record("activeTexture"),
    drawArrays: record("drawArrays"),
    flush: record("flush"),
    isContextLost: () => false,
  };
  return { gl: gl as unknown as FilmSliceGLContext, calls, live };
}

function frames(count: number) {
  return Array.from({ length: count }, (_, index) => ({ source: { fake: index }, width: 135, height: 240 }));
}

describe("film-space WebGL slice engine", () => {
  it("shares one shader program and quad geometry between native Expo GL and the browser", () => {
    const native = readFileSync("components/shooting-profile/film-slice-gl-renderer.native.tsx", "utf8");
    const web = readFileSync("components/shooting-profile/film-slice-gl-renderer.web.tsx", "utf8");
    const engine = readFileSync("lib/film-space/web-gl-slice-renderer.ts", "utf8");
    expect(native).toMatch(/from "@\/lib\/film-space\/gl-slice-shader"/);
    expect(engine).toMatch(/from "@\/lib\/film-space\/gl-slice-shader"/);
    expect(web).toMatch(/from "@\/lib\/film-space\/web-gl-slice-renderer"/);
    expect(native).not.toMatch(/attribute vec2 a_position/);
    expect(FILM_SLICE_VERTEX_SHADER).toMatch(/u_depth|u_yaw|u_pitch|u_sliceScale|u_planeAspect|u_viewportAspect/);
    expect(FILM_SLICE_FRAGMENT_SHADER).toMatch(/u_opacity/);
    expect(FILM_SLICE_QUAD.length).toBe(12);
    expect(FILM_SLICE_UV.length).toBe(12);
    expect(FILM_SLICE_MAX_TEXTURES).toBe(96);
  });

  it("draws unselected slices first and the selected slice last", () => {
    const stack = createFilmSpaceSliceStack(5, 2, normalizeFilmSpaceCamera({ yawDegrees: 0, pitchDegrees: 0, zoom: 1 }));
    const ordered = orderFilmSlicesForDraw(stack);
    expect(ordered.map((slice) => slice.index)).toEqual([0, 1, 3, 4, 2]);
    expect(ordered[ordered.length - 1].selected).toBe(true);
  });

  it("uploads one bounded texture per frame and refuses more than the slice budget", () => {
    const { gl, calls, live } = fakeGL();
    const engine = createFilmSliceGLEngine(gl);
    engine.setTextures(frames(80));
    expect(engine.textureCount()).toBe(80);
    expect(live.textures.size).toBe(80);
    expect(calls.filter((call) => call.name === "texImage2D")).toHaveLength(80);
    expect(() => engine.setTextures(frames(97))).toThrow();
    // A refused upload leaves no textures behind.
    expect(live.textures.size).toBe(0);
    expect(() => engine.setTextures([])).toThrow();
  });

  it("replaces textures when the source changes and never leaks the previous set", () => {
    const { gl, live } = fakeGL();
    const engine = createFilmSliceGLEngine(gl);
    engine.setTextures(frames(64));
    engine.setTextures(frames(72));
    expect(live.textures.size).toBe(72);
    expect(engine.textureCount()).toBe(72);
  });

  it("cleans up partially created textures when one allocation fails", () => {
    const { gl, live } = fakeGL({ failTextureAt: 5 });
    const engine = createFilmSliceGLEngine(gl);
    expect(() => engine.setTextures(frames(64))).toThrow();
    expect(live.textures.size).toBe(0);
    expect(engine.textureCount()).toBe(0);
  });

  it("fails program creation closed with no dangling shaders or programs", () => {
    const { gl, live } = fakeGL({ failProgram: true });
    expect(() => createFilmSliceGLEngine(gl)).toThrow();
    expect(live.programs.size).toBe(0);
    expect(live.shaders.size).toBe(0);
    expect(live.buffers.size).toBe(0);
  });

  it("binds every slice's depth, scale, opacity and aspect from the shared render plan and the camera", () => {
    const { gl, calls } = fakeGL();
    const engine = createFilmSliceGLEngine(gl);
    engine.setTextures(frames(64));
    const camera = normalizeFilmSpaceCamera({ yawDegrees: -18, pitchDegrees: 7, zoom: 1.2 });
    const stack = createFilmSpaceSliceStack(64, 10, camera);
    engine.draw(stack, camera, { width: 390, height: 320 });
    const draws = calls.filter((call) => call.name === "drawArrays");
    expect(draws).toHaveLength(64);
    const uniformNames = calls.filter((call) => call.name === "uniform1f").map((call) => (call.args[0] as { name: string }).name);
    for (const name of ["u_yaw", "u_pitch", "u_viewportAspect", "u_depth", "u_sliceScale", "u_opacity", "u_planeAspect"]) {
      expect(uniformNames).toContain(name);
    }
    const yaw = calls.find((call) => call.name === "uniform1f" && (call.args[0] as { name: string }).name === "u_yaw");
    expect(yaw?.args[1]).toBeCloseTo(-18 * Math.PI / 180);
    const binds = calls.filter((call) => call.name === "bindTexture" && (call.args[1] as { id: number } | null)?.id !== undefined);
    expect((binds[binds.length - 1].args[1] as { id: number }).id).toBe(10);
    expect(calls.some((call) => call.name === "blendFunc")).toBe(true);
  });

  it("disposes program, buffers and textures exactly once and tolerates repeated disposal", () => {
    const { gl, calls, live } = fakeGL();
    const engine = createFilmSliceGLEngine(gl);
    engine.setTextures(frames(64));
    engine.dispose();
    engine.dispose();
    expect(live.textures.size).toBe(0);
    expect(live.buffers.size).toBe(0);
    expect(live.programs.size).toBe(0);
    expect(calls.filter((call) => call.name === "deleteProgram")).toHaveLength(1);
    expect(calls.filter((call) => call.name === "deleteTexture")).toHaveLength(64);
    expect(engine.textureCount()).toBe(0);
    expect(() => engine.draw([], normalizeFilmSpaceCamera({ yawDegrees: 0, pitchDegrees: 0, zoom: 1 }), { width: 1, height: 1 })).not.toThrow();
  });
});

describe("film-space browser GL component", () => {
  const web = readFileSync("components/shooting-profile/film-slice-gl-renderer.web.tsx", "utf8");
  const fallback = readFileSync("components/shooting-profile/film-slice-2d-fallback.web.tsx", "utf8");

  it("renders through a browser canvas, handles context loss, resizes and falls back instead of crashing", () => {
    expect(web).toMatch(/<canvas/);
    expect(web).toMatch(/getContext\(\s*["']webgl2?["']/);
    expect(web).toMatch(/webglcontextlost/);
    expect(web).toMatch(/preventDefault\(\)/);
    expect(web).toMatch(/onRendererError/);
    expect(web).toMatch(/ResizeObserver|onLayout/);
    expect(web).toMatch(/devicePixelRatio/);
    expect(web).toMatch(/\.dispose\(\)/);
    expect(web).not.toMatch(/three|@react-three|expo-gl|GLView|endFrameEXP/);
    expect(web).not.toMatch(/firebase|fetch\(|axios|trpc|upload/i);
    expect(web).not.toMatch(/console\.(log|warn|error)/);
  });

  it("offers a bounded 2D canvas fallback that uses the same slice render plan", () => {
    expect(fallback).toMatch(/<canvas/);
    expect(fallback).toMatch(/getContext\(\s*["']2d["']/);
    expect(fallback).toMatch(/globalAlpha/);
    expect(fallback).toMatch(/drawImage/);
    expect(fallback).toMatch(/orderFilmSlicesForDraw|FilmSpaceSlicePoseV1/);
    expect(fallback).not.toMatch(/three|expo-gl|webgl/i);
    expect(fallback).not.toMatch(/console\.(log|warn|error)/);
  });
});
