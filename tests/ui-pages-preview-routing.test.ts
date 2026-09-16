import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const gate = readFileSync("lib/dev/ui-demo.ts", "utf8");
const route = readFileSync("app/dev/ui-demo.tsx", "utf8");
const workflow = readFileSync(".github/workflows/ui-web-preview-pages.yml", "utf8");

describe("GitHub Pages UI preview routing", () => {
  it("has an explicit production-preview build gate separate from the development demo gate", () => {
    expect(gate).toContain('process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"');
    expect(route).toContain('process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"');
    expect(route).toContain('require("@/lib/dev/ui-demo-fixtures")');
  });

  it("uses a production static export for Pages so Expo Router baseUrl is honored", () => {
    expect(workflow).toContain('EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD: "1"');
    expect(workflow).toContain("pnpm exec expo export --platform web --output-dir web-preview-dist");
    expect(workflow).not.toContain("expo export --platform web --dev");
    expect(workflow).toContain('HOOPHUB_WEB_PREVIEW_BASE_URL: "/shooting-profile-coach-ios"');
  });
});
