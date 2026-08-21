import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release readiness configuration", () => {
  const config = readFileSync("app.config.ts", "utf8");
  const capture = readFileSync("components/private-pose-capture.tsx", "utf8");
  const tabBar = readFileSync("components/liquid-tab-bar.tsx", "utf8");

  it("configures photo selection and includes a development client for custom on-device detection", () => {
    const manifest = readFileSync("package.json", "utf8");
    expect(manifest).toContain('"expo-dev-client"');
    expect(config).toContain('"expo-image-picker"');
    expect(config).toContain("NSPhotoLibraryUsageDescription");
    expect(capture).toContain("requestMediaLibraryPermissionsAsync");
  });

  it("uses bounded timing for the interactive liquid-glass tab capsule", () => {
    expect(tabBar).toContain("withTiming(selectedIndex * tabWidth");
    expect(tabBar).toContain("duration: 250");
    expect(tabBar).not.toContain("withSpring");
  });
});
