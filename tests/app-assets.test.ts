import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const EXPECTED_ASSETS = new Map([
  ["./assets/images/icon.png", 1024],
  ["./assets/images/android-icon-foreground.png", 432],
  ["./assets/images/android-icon-background.png", 432],
  ["./assets/images/android-icon-monochrome.png", 432],
  ["./assets/images/favicon.png", 64],
  ["./assets/images/splash-icon.png", 1024],
]);

const OBSOLETE_LOCAL_FONTS = [
  "assets/fonts/Barlow-Regular.ttf",
  "assets/fonts/Barlow-SemiBold.ttf",
  "assets/fonts/BarlowCondensed-SemiBold.ttf",
  "assets/fonts/BarlowCondensed-Bold.ttf",
];

function pngDimensions(contents: Buffer) {
  expect(contents.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);

  return {
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20),
  };
}

describe("Expo application assets", () => {
  it("ships every configured local PNG at its platform size", () => {
    const configSource = readFileSync(resolve(process.cwd(), "app.config.ts"), "utf8");
    const configuredAssets = new Set(
      configSource.match(/\.\/assets\/images\/[a-z0-9-]+\.png/g) ?? [],
    );

    expect(configuredAssets).toEqual(new Set(EXPECTED_ASSETS.keys()));

    for (const [relativePath, expectedSize] of EXPECTED_ASSETS) {
      const absolutePath = resolve(process.cwd(), relativePath);
      expect(existsSync(absolutePath), `${relativePath} is missing`).toBe(true);

      const dimensions = pngDimensions(readFileSync(absolutePath));
      expect(dimensions, `${relativePath} has the wrong dimensions`).toEqual({
        width: expectedSize,
        height: expectedSize,
      });
    }
  });

  it("loads the branded fonts from declared packages", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const layoutSource = readFileSync(
      resolve(process.cwd(), "app/_layout.tsx"),
      "utf8",
    );

    expect(manifest.dependencies).toMatchObject({
      "@expo-google-fonts/barlow": "0.4.1",
      "@expo-google-fonts/barlow-condensed": "0.4.1",
    });
    expect(layoutSource).toContain('from "@expo-google-fonts/barlow"');
    expect(layoutSource).toContain('from "@expo-google-fonts/barlow-condensed"');
    expect(layoutSource).not.toContain("@/assets/fonts/");
    for (const fontPath of OBSOLETE_LOCAL_FONTS) {
      expect(existsSync(resolve(process.cwd(), fontPath)), `${fontPath} is obsolete`).toBe(false);
    }
  });
});
