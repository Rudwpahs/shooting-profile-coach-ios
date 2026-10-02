import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const legacyDemo = readFileSync("app/dev/ui-demo.tsx", "utf8");
const homeRoute = readFileSync("app/(tabs)/index.tsx", "utf8");
const rootLayout = readFileSync("app/_layout.tsx", "utf8");
const workflow = readFileSync(".github/workflows/ui-web-preview-pages.yml", "utf8");

describe("interactive signed-in web preview", () => {
  it("has exactly one shell: the real app, started signed in by the preview runtime", () => {
    expect(homeRoute).not.toContain("/dev/ui-demo");
    expect(rootLayout).toContain('require("@/lib/preview/preview-runtime-root")');
    expect(legacyDemo).not.toMatch(/createUiDemoNavigation|pushUiDemoScene|backUiDemoScene|openScene\(/);
    expect(legacyDemo).not.toMatch(/HomeFeed|ReelsFeed|CaptureSessionView|ShotInspectionViewer|MotionGrid|ProfileHero/);
  });

  it("keeps the legacy demo addresses working by redirecting into the real routes", () => {
    expect(legacyDemo).toContain("<Redirect");
    expect(legacyDemo).toContain("useLocalSearchParams");
    expect(legacyDemo).toContain('"/explore"');
    expect(legacyDemo).toContain('"/profile"');
    expect(legacyDemo).toContain('"/reels"');
    expect(legacyDemo).toContain('"/private-capture"');
    expect(legacyDemo).toContain('"/library"');
  });

  it("deploys the integration branch through the same base-path-safe Pages workflow", () => {
    expect(workflow).toContain("- work/hoophub-liquid-preview-integration-v1");
    expect(workflow).toContain("- work/hoophub-unified-web-film-preview-v1");
    expect(workflow).toContain('HOOPHUB_WEB_PREVIEW_BASE_URL: "/shooting-profile-coach-ios"');
  });
});
