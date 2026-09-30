import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const gate = readFileSync("lib/dev/ui-demo.ts", "utf8");
const route = readFileSync("app/dev/ui-demo.tsx", "utf8");
const homeRoute = readFileSync("app/(tabs)/index.tsx", "utf8");
const shell = readFileSync("components/dev/ui-preview-shell.tsx", "utf8");
const workflow = readFileSync(".github/workflows/ui-web-preview-pages.yml", "utf8");

describe("GitHub Pages UI preview routing", () => {
  it("has an explicit production-preview build gate separate from the development demo gate", () => {
    expect(gate).toContain('process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"');
    expect(route).toContain('process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"');
    expect(shell).toContain('require("@/lib/dev/ui-demo-fixtures")');
  });

  it("renders the signed-in interactive Home shell directly instead of redirecting through a Pages path", () => {
    expect(homeRoute).toContain('process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"');
    expect(homeRoute).toContain('require("@/components/dev/ui-preview-shell")');
    expect(homeRoute).toContain('<UiPreviewShell');
    expect(homeRoute).not.toContain('<Redirect href="/dev/ui-demo');
    expect(shell).toContain('createUiPreviewNavigation');
    expect(shell).toContain('initialScreen = "home"');
  });

  it("wires visible preview actions instead of leaving primary Home/Profile/Reels actions as noop", () => {
    expect(shell).not.toContain('onOpenAnalysis={noop}');
    expect(shell).not.toContain('onOpenCapture={noop}');
    expect(shell).not.toContain('onOpenProfile={noop}');
    expect(shell).not.toContain('onOpenReel={noop}');
    expect(shell).not.toContain('onOpenReference={noop}');
    expect(shell).not.toContain('onClose={noop}');
    expect(shell).not.toContain('onOpen={noop}');
  });

  it("renders the real shot inspection coordinator in the preview analysis state", () => {
    expect(shell).toContain('import { ShotInspectionViewer } from "@/components/shooting-profile/shot-inspection-viewer"');
    expect(shell).toContain('<ShotInspectionViewer');
    expect(shell).toContain('experimentalEnabled');
  });

  it("uses a production static export for Pages so Expo Router baseUrl is honored", () => {
    expect(workflow).toContain('EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD: "1"');
    expect(workflow).toContain("pnpm exec expo export --platform web --output-dir web-preview-dist");
    expect(workflow).not.toContain("expo export --platform web --dev");
    expect(workflow).toContain('HOOPHUB_WEB_PREVIEW_BASE_URL: "/shooting-profile-coach-ios"');
  });
});
