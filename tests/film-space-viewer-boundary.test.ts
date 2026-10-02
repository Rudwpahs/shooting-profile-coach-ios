import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const nativeSource = readFileSync(
  resolve(process.cwd(), "components/shooting-profile/film-space-viewer.native.tsx"),
  "utf8",
);
const webSource = readFileSync(
  resolve(process.cwd(), "components/shooting-profile/film-space-viewer.web.tsx"),
  "utf8",
);

describe("film-space viewer boundary", () => {
  it("keeps the native viewer local-only, bounded, cancellable, fail-closed, and source-time labeled", () => {
    expect(nativeSource).toMatch(/extractFilmSpaceLocalFrames/);
    expect(nativeSource).toMatch(/disposeFilmSpaceLocalFrames/);
    expect(nativeSource).toMatch(/createFilmSpaceLocalFrameCacheController/);
    expect(nativeSource).not.toMatch(/frame-source\.native|extractFilmSpaceFrames|disposeFilmSpaceFrames/);
    expect(nativeSource).toMatch(/resolveFilmSpaceSamplingPlan/);
    expect(nativeSource).toMatch(/createFilmSpaceSliceStack/);
    expect(nativeSource).toMatch(/normalizeFilmSpaceCamera/);
    expect(nativeSource).toMatch(/resolveFilmSpaceLocalFrameGLTextureSources/);
    expect(nativeSource).toMatch(/FilmSliceGLRenderer/);
    expect(nativeSource).toMatch(/glTextureSources\s*\?/);
    expect(nativeSource).toMatch(/<Image/);
    expect(nativeSource).toMatch(/localUri/);
    expect(nativeSource).toMatch(/\.suspend\(\)/);
    expect(nativeSource).toMatch(/\.dispose\(\)/);
    expect(nativeSource).toMatch(/AppState/);
    expect(nativeSource).toMatch(/addEventListener\(\s*["']change["']/);
    expect(nativeSource).toMatch(/PanResponder/);
    expect(nativeSource).toMatch(/SOURCE TIME/);
    expect(nativeSource).toMatch(/동기화되지 않/);
    expect(nativeSource).toMatch(/source_unavailable|unavailable/);
    expect(nativeSource).toMatch(/onSourceUnavailable/);
    expect(nativeSource).not.toMatch(/firebase|fetch\(|axios|trpc|upload/i);
    expect(nativeSource).not.toMatch(/console\.(log|warn|error).*uri/i);
  });

  it("renders source-time slices as an XY volume without claiming measured 3D or 4D", () => {
    expect(nativeSource).toMatch(/translateX/);
    expect(nativeSource).toMatch(/translateY/);
    expect(nativeSource).toMatch(/시간 슬라이스/);
    expect(nativeSource).toMatch(/측정된 3D|measured 3D/i);
    expect(nativeSource).toMatch(/4D/);
  });

  it("keeps web as an honest unsupported fallback without native extraction imports", () => {
    expect(webSource).not.toMatch(/frame-source|expo-video|expo-gl|expo-image/);
    expect(webSource).toMatch(/iPhone|기기/);
    expect(webSource).toMatch(/Motion/);
    expect(webSource).toMatch(/Phase/);
    expect(webSource).toMatch(/지원/);
  });
});