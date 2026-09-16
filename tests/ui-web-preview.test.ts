import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const appConfig = readFileSync("app.config.ts", "utf8");
const workflowPath = ".github/workflows/ui-web-preview-pages.yml";

describe("install-free UI web preview", () => {
  it("keeps the GitHub Pages base path opt-in and production-neutral", () => {
    expect(appConfig).toContain("process.env.HOOPHUB_WEB_PREVIEW_BASE_URL?.trim()");
    expect(appConfig).toContain("baseUrl: webPreviewBaseUrl || undefined");
    expect(appConfig).toContain("typedRoutes: true");
    expect(appConfig).toContain("reactCompiler: true");
  });

  it("builds the real development UI demo and deploys only the static export to Pages", () => {
    expect(existsSync(workflowPath)).toBe(true);
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain('EXPO_PUBLIC_HOOPHUB_UI_DEMO: "1"');
    expect(workflow).toContain('HOOPHUB_WEB_PREVIEW_BASE_URL: "/shooting-profile-coach-ios"');
    expect(workflow).toContain("pnpm exec expo export --platform web --dev --output-dir web-preview-dist");
    expect(workflow).toContain("pnpm vitest run tests/ui-web-preview.test.ts tests/ui-demo-isolation.test.ts");
    expect(workflow).toContain("actions/configure-pages@v5");
    expect(workflow).toContain("actions/upload-pages-artifact@v4");
    expect(workflow).toContain("actions/deploy-pages@v4");
    expect(workflow).toContain("path: web-preview-dist");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("pages: write");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("name: github-pages");
  });
});
