import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("unified public preview route integration", () => {
  it("Home selects preview data but keeps the real Reels handoff", () => {
    const home = read("app/(tabs)/index.tsx");
    expect(home).toContain('usePreviewRuntime');
    expect(home).toMatch(/preview\.enabled\s*\?\s*preview\.latest/);
    expect(home).toContain("setReelHandoff");
    expect(home).toContain("/reels?start=");
  });

  it("Reels deep links use preview latest data when there is no Home handoff", () => {
    const reels = read("app/reels.tsx");
    expect(reels).toContain("usePreviewRuntime");
    expect(reels).toMatch(/preview\.enabled\s*\?\s*preview\.latest/);
    expect(reels).toContain("takeReelHandoff");
  });

  it("Profile, Capture, and Analysis split preview from owner-bound implementations", () => {
    const profile = read("app/(tabs)/profile.tsx");
    const capture = read("app/private-capture.tsx");
    const analysis = read("app/private-analysis/[id].tsx");

    expect(profile).toContain("PreviewProfileContent");
    expect(profile).toContain("OwnerProfileTab");
    expect(capture).toContain("PreviewCaptureRoute");
    expect(capture).toContain("OwnerPrivateCaptureRoute");
    expect(analysis).toContain("PreviewAnalysisRoute");
    expect(analysis).toContain("OwnerPrivateAnalysisRoute");
  });
});
