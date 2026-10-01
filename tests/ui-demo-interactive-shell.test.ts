import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("app/dev/ui-demo.tsx", "utf8");
const homeRoute = readFileSync("app/(tabs)/index.tsx", "utf8");
const workflow = readFileSync(".github/workflows/ui-web-preview-pages.yml", "utf8");

describe("interactive signed-in web preview shell", () => {
  it("starts the Pages preview in synthetic signed-in Home instead of a static profile scene", () => {
    expect(homeRoute).toContain('<Redirect href="/dev/ui-demo?screen=home&state=ready"');
    expect(route).toContain('createUiDemoNavigation(params.screen, params.state)');
    expect(route).toContain('const { screen, state } = navigation.current;');
  });

  it("keeps primary preview navigation inside one state-driven demo shell", () => {
    expect(route).toContain('pushUiDemoScene');
    expect(route).toContain('backUiDemoScene');
    expect(route).toContain('openScene("profile", "ready")');
    expect(route).toContain('openScene("capture", "setup")');
    expect(route).toContain('openScene("reels", "playing")');
    expect(route).toContain('openScene("reference", "ready")');
    expect(route).toContain('openScene("analysis", "ready")');
    expect(route).not.toContain('const noop = () => undefined');
  });

  it("provides in-shell return paths for analysis, reels, capture, and reference", () => {
    expect(route).toContain('accessibilityLabel="미리보기에서 뒤로 가기"');
    expect(route).toContain('onClose={goBack}');
    expect(route).toContain('if (screen === "reference")');
  });

  it("deploys the integration branch through the same base-path-safe Pages workflow", () => {
    expect(workflow).toContain("- work/hoophub-liquid-preview-integration-v1");
    expect(workflow).toContain('HOOPHUB_WEB_PREVIEW_BASE_URL: "/shooting-profile-coach-ios"');
  });
});
