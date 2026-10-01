import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const dock = readFileSync("components/hoophub-tab-bar.tsx", "utf8");
const preview = readFileSync("app/dev/ui-demo.tsx", "utf8");
const workflow = readFileSync(".github/workflows/ui-web-preview-pages.yml", "utf8");

describe("Liquid Dock", () => {
  it("uses the shared Liquid interaction primitive without moving accessibility semantics", () => {
    expect(dock).toContain('from "@/components/ui/liquid"');
    expect(dock).toContain("export function HoopHubDock");
    expect(dock).toContain("<LiquidPressable");
    expect(dock).not.toMatch(/<Pressable\b/);
    expect(dock).toContain('accessibilityRole="tab"');
    expect(dock).toContain('accessibilityRole="button"');
    expect(dock).toContain("accessibilityState={{ selected }}");
    expect(dock).toContain("minHeight: 48");
    expect(dock).toContain("minWidth: 48");
  });

  it("gives tabs bounded magnetic/ripple feedback and a distinct selected/capture surface", () => {
    expect(dock.match(/magnetic/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(dock).toContain("rippleColor=");
    expect(dock).toContain("surfaceStyle=");
    expect(dock).toContain("styles.selectedSurface");
    expect(dock).toContain("styles.captureSurface");
    expect(dock).not.toMatch(/withSpring|withTiming|useSharedValue/);
  });

  it("shares the same Dock with the install-free preview and keeps tab navigation in-shell", () => {
    expect(preview).toContain("HoopHubDock");
    expect(preview).toContain('openScene("explore", "ready")');
    expect(preview).toContain('screen === "explore"');
    expect(preview).toContain('openScene("profile", "ready")');
    expect(preview).toContain('openScene("capture", "setup")');
  });

  it("deploys the Dock branch through the base-path-safe Pages workflow", () => {
    expect(workflow).toContain("- work/hoophub-liquid-dock-v1");
    expect(workflow).toContain('HOOPHUB_WEB_PREVIEW_BASE_URL: "/shooting-profile-coach-ios"');
  });
});
