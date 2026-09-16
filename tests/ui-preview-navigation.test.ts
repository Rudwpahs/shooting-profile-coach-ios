import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("preview-only navigation components", () => {
  it("Profile preview reuses real presentational profile components without Firebase", () => {
    const source = read("components/preview/preview-profile-content.tsx");
    expect(source).toContain("ProfileHero");
    expect(source).toContain("ProfileStats");
    expect(source).toContain("MotionGrid");
    expect(source).not.toContain("firebase");
    expect(source).not.toContain("useFirebaseAuth");
  });

  it("Capture preview reuses CaptureSessionView and never imports real persistence", () => {
    const source = read("components/preview/preview-capture-route.tsx");
    expect(source).toContain("CaptureSessionView");
    expect(source).toContain("addCapturedRepresentative");
    expect(source).not.toContain("saveShootingProfileV2");
    expect(source).not.toContain("useShootingProfileCapture");
    expect(source).not.toContain("firebase");
  });

  it("Preview capture completion can navigate to the synthetic analysis record", () => {
    const source = read("components/preview/preview-capture-route.tsx");
    expect(source).toContain("/private-analysis/");
    expect(source).toContain("router.replace");
  });

  it("Preview Analysis renders existing analysis layers without owner loading", () => {
    const source = read("components/preview/preview-analysis-route.tsx");
    expect(source).toContain("AnalysisSummaryLine");
    expect(source).toContain("SequenceViewer");
    expect(source).toContain("AnalysisDetails");
    expect(source).toContain("AnalysisEvidence");
    expect(source).not.toContain("getShootingProfileV2");
    expect(source).not.toContain("useFirebaseAuth");
  });
});
