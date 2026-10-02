import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const core = read("lib/film-space/local-frame-cache.ts");
const lifecycle = read("lib/film-space/local-frame-cache-lifecycle.ts");
const native = read("lib/film-space/local-frame-cache.native.ts");
const web = read("lib/film-space/local-frame-cache.web.ts");
const types = read("lib/film-space/types.ts");
const manifest = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };

describe("film-space local frame cache boundary", () => {
  it("keeps the core and the lifecycle platform-neutral: no native module, no React Native import", () => {
    for (const source of [core, lifecycle]) {
      expect(source).not.toMatch(/from "expo-|from "react-native|require\(/);
    }
  });

  it("backs native frames with official Expo modules only, and releases every in-memory ref", () => {
    expect(native).toMatch(/from "expo-video"/);
    expect(native).toMatch(/from "expo-image-manipulator"/);
    expect(native).toMatch(/from "expo-file-system"/);
    expect(native).toMatch(/generateThumbnailsAsync/);
    expect(native).toMatch(/saveAsync/);
    expect(native).toMatch(/\.delete\(\)/);
    expect(native).toMatch(/release\(\)/);
    expect(native).not.toMatch(/expo-video-thumbnails|expo-gl|three|three\.js/i);
    expect(manifest.dependencies["expo-image-manipulator"]).toMatch(/^~14\.0\./);
    expect(manifest.dependencies["expo-file-system"]).toMatch(/^~19\.0\./);
  });

  it("keeps web an explicit unsupported adapter with no native extraction or file import", () => {
    expect(web).toMatch(/unsupported_platform/);
    expect(web).toMatch(/기기|iPhone|지원/);
    expect(web).not.toMatch(/expo-video|expo-image-manipulator|expo-file-system|expo-gl|generateThumbnailsAsync/);
  });

  it("never uploads, never persists a URI remotely, and never prints a URI", () => {
    for (const source of [core, lifecycle, native, web]) {
      expect(source).not.toMatch(/firebase|fetch\(|axios|trpc|upload|AsyncStorage|Firestore/i);
      expect(source).not.toMatch(/console\.(log|warn|error|info|debug)/);
    }
  });

  it("keeps the evidence boundary: source-video time only, no measured or synchronized 3D/4D claims", () => {
    for (const source of [core, lifecycle, native, web, types]) {
      expect(source).not.toMatch(/synchronized 4D|measured 3D|measured physical depth|actual 4D|synchronized representative/i);
    }
    expect(types).toMatch(/requestedTimestampMs/);
    expect(types).toMatch(/actualTimestampMs/);
    expect(types).toMatch(/localUri/);
  });

  it("does not touch the viewer or the slice stack that another lane owns", () => {
    for (const source of [core, lifecycle, native, web]) {
      expect(source).not.toMatch(/slice-stack|film-space-viewer/);
    }
  });
});
