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
  it("keeps the native viewer local-only, bounded, cancellable, and source-time labeled", () => {
    expect(nativeSource).toMatch(/extractFilmSpaceFrames/);
    expect(nativeSource).toMatch(/disposeFilmSpaceFrames/);
    expect(nativeSource).toMatch(/createFilmSpaceSamplingPlan/);
    expect(nativeSource).toMatch(/AbortController/);
    expect(nativeSource).toMatch(/PanResponder/);
    expect(nativeSource).toMatch(/SOURCE TIME/);
    expect(nativeSource).toMatch(/동기화되지 않/);
    expect(nativeSource).toMatch(/source_unavailable|unavailable/);
    expect(nativeSource).not.toMatch(/firebase|fetch\(|axios|trpc|upload/i);
    expect(nativeSource).not.toMatch(/console\.(log|warn|error).*uri/i);
  });

  it("keeps web as an honest unsupported fallback without native extraction imports", () => {
    expect(webSource).not.toMatch(/frame-source|expo-video|expo-gl|expo-image/);
    expect(webSource).toMatch(/iPhone|기기/);
    expect(webSource).toMatch(/지원/);
  });
});