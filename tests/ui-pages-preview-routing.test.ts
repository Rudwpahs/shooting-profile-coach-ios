import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const homeRoute = readFileSync("app/(tabs)/index.tsx", "utf8");
const rootLayout = readFileSync("app/_layout.tsx", "utf8");
const analysisRoute = readFileSync("app/private-analysis/[id].tsx", "utf8");
const workflow = readFileSync(".github/workflows/ui-web-preview-pages.yml", "utf8");

describe("GitHub Pages UI preview routing", () => {
  it("has an explicit production-preview build gate that only swaps the runtime, never the routes", () => {
    expect(rootLayout).toContain('process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"');
    expect(rootLayout).toContain('require("@/lib/preview/preview-runtime-root")');
    expect(homeRoute).not.toContain("EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD");
    expect(homeRoute).not.toContain("<Redirect");
  });

  it("opens the install-free preview in the already signed-in real Home", () => {
    expect(homeRoute).toContain("<HomeFeed");
    expect(homeRoute).toContain("useFirebaseAuth()");
    expect(homeRoute).toContain("useLatestRepresentativeProfile(user, authLoading)");
  });

  it("pre-renders the preview analysis route for static hosting without changing production route semantics", () => {
    expect(analysisRoute).toMatch(/export (async )?function generateStaticParams/);
    expect(analysisRoute).toContain('process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"');
    expect(analysisRoute).toContain("return [];");
    expect(analysisRoute).toContain("<ShotInspectionViewer");
    expect(analysisRoute).toContain("experimentalEnabled");
  });

  it("uses a production static export for Pages so Expo Router baseUrl is honored", () => {
    expect(workflow).toContain('EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD: "1"');
    expect(workflow).toContain("pnpm exec expo export --platform web --output-dir web-preview-dist");
    expect(workflow).not.toContain("expo export --platform web --dev");
    expect(workflow).toContain('HOOPHUB_WEB_PREVIEW_BASE_URL: "/shooting-profile-coach-ios"');
  });
});
