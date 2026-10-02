import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const renderer = readFileSync(
  resolve(process.cwd(), "components/shooting-profile/film-slice-gl-renderer.native.tsx"),
  "utf8",
);
const webViewer = readFileSync(
  resolve(process.cwd(), "components/shooting-profile/film-space-viewer.web.tsx"),
  "utf8",
);
const packageJson = readFileSync(resolve(process.cwd(), "package.json"), "utf8");

describe("film-space GL renderer boundary", () => {
  it("uses Expo GL textured planes with explicit GPU resource cleanup", () => {
    expect(renderer).toMatch(/GLView/);
    expect(renderer).toMatch(/texImage2D/);
    expect(renderer).toMatch(/drawArrays/);
    expect(renderer).toMatch(/blendFunc/);
    expect(renderer).toMatch(/endFrameEXP/);
    expect(renderer).toMatch(/deleteTexture/);
    expect(renderer).toMatch(/deleteBuffer/);
    expect(renderer).toMatch(/deleteProgram/);
  });

  it("keeps network, cloud, and raw-video concerns out of the renderer", () => {
    expect(renderer).not.toMatch(/firebase|fetch\(|axios|trpc|upload|videoPlayer/i);
    expect(renderer).not.toMatch(/console\.(log|warn|error)/);
  });

  it("keeps the native GL dependency out of the web viewer", () => {
    expect(packageJson).toMatch(/"expo-gl":\s*"~16\.0\.10"/);
    expect(webViewer).not.toMatch(/expo-gl|GLView|texImage2D/);
  });
});
