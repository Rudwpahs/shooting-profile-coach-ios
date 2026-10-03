import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const home = read("app/(tabs)/index.tsx");
const tabsLayout = read("app/(tabs)/_layout.tsx");
const rootLayout = read("app/_layout.tsx");
const dock = read("components/hoophub-tab-bar.tsx");
const analysis = read("app/private-analysis/[id].tsx");
const capture = read("app/private-capture.tsx");
const reels = read("app/reels.tsx");
const inspection = read("components/shooting-profile/shot-inspection-viewer.tsx");
const legacyDemo = read("app/dev/ui-demo.tsx");
const liquidLab = read("app/dev/liquid-lab.tsx");
const workflow = read(".github/workflows/ui-web-preview-pages.yml");
const appConfig = read("app.config.ts");

describe("the web preview is the actual HoopHub app", () => {
  it("opens the root URL on the real Home route with no redirect into a demo shell", () => {
    expect(home).not.toMatch(/Redirect/);
    expect(home).not.toMatch(/dev\/ui-demo|dev\/liquid-lab/);
    expect(home).toContain("<HomeFeed");
    expect(home).toContain("useLatestRepresentativeProfile(user, authLoading)");
    expect(home).toContain('router.push("/private-capture" as never)');
    expect(home).toContain("`/private-analysis/${profileId}`");
    expect(home).toContain("`/reels?start=${encodeURIComponent(reelId)}`");
    expect(home).toContain('router.navigate("/profile" as never)');
  });

  it("uses the real tab layout and the real HoopHub dock for navigation", () => {
    expect(tabsLayout).toContain("HoopHubTabBar");
    expect(tabsLayout).toContain('name="explore"');
    expect(tabsLayout).toContain('name="profile"');
    expect(dock).toContain("export function HoopHubDock");
    expect(dock).toContain('router.push("/private-capture")');
    for (const route of ["app/(tabs)/explore.tsx", "app/(tabs)/profile.tsx", "app/reels.tsx", "app/private-capture.tsx", "app/private-analysis/[id].tsx", "app/(tabs)/library.tsx"]) {
      expect(existsSync(route), route).toBe(true);
    }
  });

  it("reaches Analysis from Home, Profile and Reels through the real dynamic route; the preview pre-renders no analysis page because it keeps footage only", () => {
    expect(read("app/(tabs)/profile.tsx")).toContain("/private-analysis/");
    expect(reels).toContain("`/private-analysis/${profileId}`");
    expect(analysis).toMatch(/export (async )?function generateStaticParams/);
    expect(analysis).toContain("return [];");
    expect(analysis).not.toMatch(/preview-shot|@\/lib\/preview\//);
    expect(analysis).toContain("<AnalysisStage");
    expect(analysis).toContain("experimentalEnabled");
    expect(read("components/analysis/analysis-stage.tsx")).toContain("<ShotInspectionViewer");
  });

  it("mounts Phase and Film inside the real shot inspection coordinator behind the reel stage, with Film available on web", () => {
    expect(inspection).not.toContain("<SequenceViewer");
    expect(inspection).toContain("<PhaseSpaceViewer");
    expect(inspection).toContain("<FilmSpaceViewer");
    expect(inspection).toMatch(/Platform\.OS === "ios" \|\| Platform\.OS === "web"/);
  });

  it("offers local video selection inside the real capture flow in the preview build, never a separate upload page", () => {
    expect(capture).toContain("<CaptureSession");
    expect(capture).toContain('process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"');
    expect(capture).toContain('require("@/lib/preview/preview-capture-session")');
    const previewCapture = read("lib/preview/preview-capture-session.tsx");
    expect(previewCapture).toContain("<CaptureSessionView");
    expect(previewCapture).not.toMatch(/<input|type="file"/);
    const picker = read("lib/film-space/web-local-video-picker.ts");
    expect(picker).toMatch(/type = "file"|type="file"/);
    expect(picker).toMatch(/accept/);
    expect(picker).toMatch(/video\/mp4/);
    expect(picker).not.toMatch(/fetch\(|XMLHttpRequest|FormData|upload/i);
    expect(existsSync("app/dev/film-space-demo.tsx")).toBe(false);
    expect(existsSync("app/film-space.tsx")).toBe(false);
  });

  it("wraps the real app in a preview-only runtime from the root layout and shows a phone-sized frame only on desktop web", () => {
    expect(rootLayout).toContain('process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"');
    expect(rootLayout).toContain('require("@/lib/preview/preview-runtime-root")');
    expect(rootLayout).toContain("<FirebaseAuthProvider>");
    const shell = withoutComments(read("lib/preview/preview-runtime-root.web.tsx"));
    expect(shell).toMatch(/<iframe/);
    expect(shell).toMatch(/window\.self !== window\.top|window\.parent !== window/);
    expect(shell).toMatch(/innerWidth/);
    expect(shell).toMatch(/768/);
    expect(shell).toMatch(/replaceState/);
    expect(shell).toMatch(/postMessage\([^)]*window\.location\.origin/);
    expect(shell).toMatch(/event\.origin !== window\.location\.origin/);
    expect(shell).toMatch(/removeEventListener\("message"/);
    expect(shell).not.toMatch(/HomeFeed|ReelsFeed|CaptureSessionView|ShotInspectionViewer|HoopHubDock/);
    const nativeShell = withoutComments(read("lib/preview/preview-runtime-root.tsx"));
    expect(nativeShell).not.toMatch(/\bwindow\.|\bdocument\.|<iframe/);
  });

  it("keeps a single public URL: legacy demo paths redirect into the real app and the lab stays developer-only", () => {
    expect(legacyDemo).toContain("<Redirect");
    expect(legacyDemo).not.toMatch(/HomeFeed|ReelsFeed|CaptureSessionView|ShotInspectionViewer|buildUiDemoFixtures|HoopHubDock|openScene|pushUiDemoScene/);
    for (const screen of ["explore", "profile", "analysis", "reels", "capture", "reference"]) {
      expect(legacyDemo).toContain(`${screen}:`);
    }
    expect(legacyDemo).toContain('analysis: "/profile"');
    expect(legacyDemo).not.toMatch(/preview-shot|EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD/);
    expect(liquidLab).toContain('process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"');
    expect(liquidLab).toMatch(/if \(!LIQUID_LAB_ENABLED\) return <Redirect href="\/" \/>/);
    expect(existsSync("app/+not-found.tsx")).toBe(true);
    expect(read("app/+not-found.tsx")).toContain("<Redirect");
  });

  it("deploys the integration branch to Pages with the repository base path and verifies the real routes in the export", () => {
    expect(appConfig).toContain("baseUrl: webPreviewBaseUrl || undefined");
    expect(workflow).toContain("- work/hoophub-unified-web-film-preview-v1");
    expect(workflow).toContain('HOOPHUB_WEB_PREVIEW_BASE_URL: "/shooting-profile-coach-ios"');
    expect(workflow).toContain("test -f web-preview-dist/index.html");
    expect(workflow).toContain("test -f web-preview-dist/explore.html");
    expect(workflow).toContain("test -f web-preview-dist/profile.html");
    expect(workflow).toContain("test -f web-preview-dist/reels.html");
    expect(workflow).toContain("test -f web-preview-dist/private-capture.html");
    // No synthetic analysis page is pre-rendered any more: the preview's own shots are footage on the viewer's device.
    expect(workflow).not.toContain("preview-shot-001.html");
    expect(workflow).toContain("- work/hoophub-film-shots-reel-stage-v1");
    expect(workflow).toContain("test -f web-preview-dist/404.html");
    expect(workflow).not.toContain('Expected /dev/ui-demo static route was not emitted');
    expect(workflow).toContain("tests/ui-actual-app-preview.test.ts");
    expect(workflow).toContain("tests/preview-runtime-isolation.test.ts");
    expect(workflow).toContain("tests/film-space-web-boundary.test.ts");
  });
});
