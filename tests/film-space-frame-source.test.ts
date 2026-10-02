import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const nativeSource = readFileSync(
  resolve(process.cwd(), "lib/film-space/frame-source.native.ts"),
  "utf8",
);
const webSource = readFileSync(
  resolve(process.cwd(), "lib/film-space/frame-source.web.ts"),
  "utf8",
);

describe("film-space frame-source boundary", () => {
  it("uses local expo-video thumbnail generation and explicit cleanup on native", () => {
    expect(nativeSource).toMatch(/expo-video/);
    expect(nativeSource).toMatch(/generateThumbnailsAsync/);
    expect(nativeSource).toMatch(/release/);
    expect(nativeSource).toMatch(/AbortSignal|aborted/);
    expect(nativeSource).toMatch(/source_unavailable/);
    expect(nativeSource).not.toMatch(/expo-video-thumbnails/);
    expect(nativeSource).not.toMatch(/firebase|fetch\(|axios|trpc|upload/i);
    expect(nativeSource).not.toMatch(/console\.(log|warn|error).*uri/i);
  });

  it("keeps web explicit and free of native frame extraction", () => {
    expect(webSource).not.toMatch(/generateThumbnailsAsync|expo-gl|expo-video-thumbnails/);
    expect(webSource).toMatch(/unsupported_platform/);
    expect(webSource).toMatch(/기기|iPhone|지원/);
  });
});