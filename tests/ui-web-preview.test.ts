import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const appConfig = readFileSync("app.config.ts", "utf8");

describe("install-free UI web preview", () => {
  it("keeps the GitHub Pages base path opt-in and production-neutral", () => {
    expect(appConfig).toContain("process.env.HOOPHUB_WEB_PREVIEW_BASE_URL?.trim()");
    expect(appConfig).toContain("baseUrl: webPreviewBaseUrl || undefined");
    expect(appConfig).toContain("typedRoutes: true");
    expect(appConfig).toContain("reactCompiler: true");
  });
});
