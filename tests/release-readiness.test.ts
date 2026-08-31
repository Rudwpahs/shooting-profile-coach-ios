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

  it("does not print theme state while rendering application routes", () => {
    const themeProvider = readFileSync("lib/theme-provider.tsx", "utf8");
    expect(themeProvider).not.toMatch(/console\.log\s*\(/);
  });

  it("keeps representative capture behind three explicit opt-in flags", () => {
    const flags = readFileSync("lib/feature-flags.ts", "utf8");
    const captureRoute = readFileSync("app/private-capture.tsx", "utf8");
    expect(flags).toMatch(/^\s*captureV2:\s*process\.env\.EXPO_PUBLIC_FORMPATH_CAPTURE_V2 === "1",\s*$/m);
    expect(flags).toMatch(/^\s*representative4DViewer:\s*process\.env\.EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D === "1",\s*$/m);
    expect(flags).toMatch(/^\s*profileV2:\s*process\.env\.EXPO_PUBLIC_FORMPATH_PROFILE_V2 === "1",\s*$/m);
    expect(captureRoute).toContain("FORMPATH_FLAGS.captureV2 && FORMPATH_FLAGS.profileV2");
  });

  it("lists every physical-iPhone acceptance case before V2 rollout", () => {
    const qa = readFileSync("docs/iphone-custom-build-qa.md", "utf8");
    for (const requiredCase of [
      "Camera and Photos permissions",
      "Basic 1+1",
      "High 3+3",
      "left- and right-hand",
      "portrait and landscape",
      "HEVC, slow-motion, and variable-frame-rate",
      "2-second and 20-second",
      "progress and cancellation",
      "background interruption",
      "retake",
      "101-phase playback",
      "airplane mode",
      "reopen",
      "other-account denial",
      "deletion and deletion resumption",
    ]) {
      expect(qa).toContain(requiredCase);
    }
  });

  it("measures false rejects over independently labeled attempts, not accepted-only samples", () => {
    const protocol = readFileSync("docs/representative-4d-validation-protocol.md", "utf8");
    expect(protocol).toContain("independently labeled valid attempted shots");
    expect(protocol).toContain("retain every product rejection and reason");
    expect(protocol).not.toContain("60 adults × 10 accepted shots per view");
  });
});
