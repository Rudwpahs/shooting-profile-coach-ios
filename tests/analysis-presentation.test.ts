import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { analysisHref, analysisTitle } from "@/lib/shooting-profile/analysis-presentation";

const read = (path: string) => readFileSync(path, "utf8");

describe("analysis route helpers", () => {
  it("builds the route a surface pushes, with the id encoded and the display name carried along only when it is plain", () => {
    expect(analysisHref("preview-shot-012")).toBe("/private-analysis/preview-shot-012");
    expect(analysisHref("preview-shot-012", "SHOT 12")).toBe("/private-analysis/preview-shot-012?title=SHOT%2012");
    expect(analysisHref("a/b", "x")).toContain("/private-analysis/a%2Fb?");
    expect(analysisHref("abc", "<b>x</b>")).toBe("/private-analysis/abc");
  });

  it("accepts only a short plain display name and falls back otherwise", () => {
    expect(analysisTitle("SHOT 12")).toBe("SHOT 12");
    expect(analysisTitle("내 슛폼")).toBe("내 슛폼");
    expect(analysisTitle(undefined)).toBe("슛폼");
    expect(analysisTitle("")).toBe("슛폼");
    expect(analysisTitle("<script>alert(1)</script>")).toBe("슛폼");
    expect(analysisTitle("x".repeat(25))).toBe("슛폼");
    expect(analysisTitle(["SHOT 12"])).toBe("슛폼");
    expect(analysisTitle("https://example.com")).toBe("슛폼");
    expect(analysisTitle("IMG_8680.mp4")).toBe("슛폼");
  });

  it("is one stage for every entry: the route renders the analysis stage and the three layers live behind its info sheet", () => {
    const route = read("app/private-analysis/[id].tsx");
    expect(route).toContain("<AnalysisStage");
    expect(route).toContain("analysisTitle(");
    expect(route).not.toMatch(/presentation=|MinimalAnalysis|<TopBar|<ScrollView/);
    // Access rules are untouched: both flags, the signed-in owner, an opaque id and a current request key.
    expect(route).toContain("FORMPATH_FLAGS.profileV2 && FORMPATH_FLAGS.representative4DViewer");
    expect(route).toContain("canRenderShootingProfileViewerRecord(");
    expect(route).toContain("opaqueProfileId(id)");
    const stage = read("components/analysis/analysis-stage.tsx");
    expect(stage).toContain("<ReelsFeed");
    for (const layer of ["<AnalysisSummaryLine", "<ShotInspectionViewer", "<AnalysisDetails", "<AnalysisEvidence"]) {
      expect(stage).toContain(layer);
    }
    expect(stage).not.toMatch(/측정된 물리|actual 4D|synchronized representative/i);
  });

  it("keeps the inspection surface to Phase and Film: the stage is the motion", () => {
    const viewer = read("components/shooting-profile/shot-inspection-viewer.tsx");
    expect(viewer).not.toMatch(/SequenceViewer|"motion"/);
    expect(viewer).toContain("<PhaseSpaceViewer");
    expect(viewer).toContain("<FilmSpaceViewer");
    expect(viewer).toContain("연결된 로컬 원본 영상이 없습니다");
  });
});
