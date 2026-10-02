import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?)$/.test(entry) ? [path] : [];
  });
}

const WEB_FILM_FILES = [
  "lib/film-space/frame-source.web.ts",
  "lib/film-space/web-frame-extraction.ts",
  "lib/film-space/web-local-video.ts",
  "lib/film-space/web-local-video-picker.ts",
  "lib/film-space/web-gl-slice-renderer.ts",
  "lib/film-space/local-association.web.ts",
  "lib/film-space/web-metrics.ts",
  "components/shooting-profile/film-space-viewer.web.tsx",
  "components/shooting-profile/film-slice-gl-renderer.web.tsx",
  "components/shooting-profile/film-slice-2d-fallback.web.tsx",
];

const NATIVE_FILM_FILES = [
  "lib/film-space/frame-source.native.ts",
  "lib/film-space/local-frame-cache.native.ts",
  "components/shooting-profile/film-space-viewer.native.tsx",
  "components/shooting-profile/film-slice-gl-renderer.native.tsx",
];

const SHARED_ENGINE_FILES = [
  "lib/film-space/sampling.ts",
  "lib/film-space/slice-stack.ts",
  "lib/film-space/gl-slice-shader.ts",
  "lib/film-space/local-frame-cache-lifecycle.ts",
];

describe("film-space web/native boundary", () => {
  it("keeps the browser implementation free of native Expo media modules and native adapters", () => {
    for (const file of WEB_FILM_FILES) {
      const source = withoutComments(read(file));
      expect(source, file).not.toMatch(/expo-video|expo-gl|expo-image-manipulator|expo-file-system|expo-image-picker|expo-video-thumbnails/);
      expect(source, file).not.toMatch(/local-frame-cache\.native|frame-source\.native|film-slice-gl-renderer\.native|film-space-viewer\.native/);
      expect(source, file).not.toMatch(/generateThumbnailsAsync|GLView|endFrameEXP/);
      expect(source, file).not.toMatch(/\bthree\b|@react-three|expo-three|pixi|regl|\bogl\b/);
    }
  });

  it("keeps the native implementation free of DOM APIs", () => {
    for (const file of NATIVE_FILM_FILES) {
      const source = withoutComments(read(file));
      expect(source, file).not.toMatch(/\bdocument\.|\bwindow\.|HTMLVideoElement|HTMLCanvasElement|createImageBitmap|createObjectURL|revokeObjectURL|requestVideoFrameCallback|OffscreenCanvas/);
    }
  });

  it("keeps the shared engine platform-neutral: no React, React Native, Expo or DOM globals", () => {
    for (const file of SHARED_ENGINE_FILES) {
      const source = withoutComments(read(file));
      expect(source, file).not.toMatch(/from "react|from "expo|from "@expo|\bdocument\.|\bwindow\./);
    }
  });

  it("never uploads, persists remotely, or logs: no Firebase, fetch, axios, tRPC, storage or console in the web Film path", () => {
    for (const file of WEB_FILM_FILES) {
      const source = withoutComments(read(file));
      expect(source, file).not.toMatch(/firebase|fetch\(|axios|trpc|upload|getStorage|uploadBytes|AsyncStorage|localStorage|sessionStorage|indexedDB/i);
      expect(source, file).not.toMatch(/console\.(log|warn|error|info|debug)/);
    }
  });

  it("uses the shared sampling plan, slice stack, camera and lifecycle controller instead of a web-only algorithm", () => {
    const viewer = read("components/shooting-profile/film-space-viewer.web.tsx");
    expect(viewer).toMatch(/resolveFilmSpaceSamplingPlan/);
    expect(viewer).toMatch(/createFilmSpaceSliceStack/);
    expect(viewer).toMatch(/normalizeFilmSpaceCamera/);
    expect(viewer).toMatch(/createFilmSpaceLocalFrameCacheController/);
    expect(viewer).toMatch(/extractFilmSpaceFrames/);
    expect(viewer).toMatch(/disposeFilmSpaceFrames/);
    expect(viewer).toMatch(/\.suspend\(\)/);
    expect(viewer).toMatch(/\.dispose\(\)/);
    expect(viewer).toMatch(/visibilitychange/);
    expect(viewer).toMatch(/SOURCE TIME/);
    expect(viewer).toMatch(/onSourceUnavailable/);
    expect(viewer).toMatch(/FilmSliceGLRenderer/);
    expect(viewer).toMatch(/FilmSlice2DFallback/);
    expect(viewer).toMatch(/Motion/);
    expect(viewer).toMatch(/Phase/);
    for (const file of WEB_FILM_FILES) {
      expect(read(file), file).not.toMatch(/sliceCount\s*=\s*\d+|MIN_SLICES|MAX_SLICES/);
    }
    expect(read("lib/film-space/sampling.ts")).toMatch(/MIN_SLICES = 64/);
    expect(read("lib/film-space/sampling.ts")).toMatch(/MAX_SLICES = 96/);
  });

  it("states the evidence boundary and never claims measured 3D, actual 4D or synchronized representative time", () => {
    const viewer = read("components/shooting-profile/film-space-viewer.web.tsx");
    expect(viewer).toMatch(/시간 슬라이스/);
    expect(viewer).toMatch(/동기화되지 않/);
    expect(viewer).toMatch(/측정된 3D/);
    expect(viewer).toMatch(/4D/);
    expect(viewer).not.toMatch(/\{\s*clip\.uri\s*\}/);
    for (const file of [...WEB_FILM_FILES, ...SHARED_ENGINE_FILES]) {
      const source = read(file);
      expect(source, file).not.toMatch(/synchronized 4D|measured 3D reconstruction|actual 3D reconstruction|measured physical depth|synchronized representative|actual 4D/i);
    }
  });

  it("extracts frames only from a blob object URL and reports unsupported browsers honestly", () => {
    const source = read("lib/film-space/frame-source.web.ts");
    expect(source).toMatch(/unsupported_platform/);
    expect(source).toMatch(/지원/);
    expect(source).toMatch(/extractWebFilmFrames/);
    expect(source).toMatch(/requestVideoFrameCallback/);
    expect(source).toMatch(/seeked/);
    expect(source).toMatch(/loadedmetadata/);
    expect(source).toMatch(/createImageBitmap/);
    expect(source).toMatch(/typeof document === "undefined"/);
  });

  it("publishes anonymous metrics only: no URI, name or path fields", () => {
    const metrics = read("lib/film-space/web-metrics.ts");
    expect(metrics).toMatch(/sliceCount/);
    expect(metrics).toMatch(/extractionMs/);
    expect(metrics).not.toMatch(/uri|localUri|fileName|filename|path/i);
  });

  it("lets the bundler choose the platform file: no platform-neutral module imports a film .web or .native module by name", () => {
    const offenders: string[] = [];
    for (const root of ["app", "components", "hooks", "lib"]) {
      for (const file of sourceFiles(root)) {
        const rel = relative(process.cwd(), file).replace(/\\/g, "/");
        // A platform file may name a module of its own platform; the first test above forbids crossing platforms.
        if (/\.(web|native|ios|android)\.tsx?$/.test(rel)) continue;
        const source = withoutComments(read(file));
        if (/from "@\/(lib\/film-space|components\/shooting-profile)\/[a-z0-9-]+\.(web|native)"/.test(source)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
