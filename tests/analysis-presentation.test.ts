import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { minimalAnalysisHref, minimalAnalysisTitle, resolveAnalysisPresentation } from "@/lib/shooting-profile/analysis-presentation";

const read = (path: string) => readFileSync(path, "utf8");

describe("analysis presentation", () => {
  it("selects the minimal surface only for the exact param value", () => {
    expect(resolveAnalysisPresentation("minimal")).toBe("minimal");
    expect(resolveAnalysisPresentation(undefined)).toBe("full");
    expect(resolveAnalysisPresentation("full")).toBe("full");
    expect(resolveAnalysisPresentation("Minimal")).toBe("full");
    expect(resolveAnalysisPresentation(["minimal"])).toBe("full");
  });

  it("builds the route Explore pushes, with the id encoded and the display name carried along", () => {
    expect(minimalAnalysisHref("preview-shot-012")).toBe("/private-analysis/preview-shot-012?presentation=minimal");
    expect(minimalAnalysisHref("preview-shot-012", "SHOT 12")).toBe("/private-analysis/preview-shot-012?presentation=minimal&title=SHOT%2012");
    expect(minimalAnalysisHref("a/b", "x")).toContain("/private-analysis/a%2Fb?");
  });

  it("accepts only a short plain display name and falls back otherwise", () => {
    expect(minimalAnalysisTitle("SHOT 12")).toBe("SHOT 12");
    expect(minimalAnalysisTitle("MOTION 01")).toBe("MOTION 01");
    expect(minimalAnalysisTitle("내 슛폼")).toBe("내 슛폼");
    expect(minimalAnalysisTitle(undefined)).toBe("슛폼");
    expect(minimalAnalysisTitle("")).toBe("슛폼");
    expect(minimalAnalysisTitle("<script>alert(1)</script>")).toBe("슛폼");
    expect(minimalAnalysisTitle("x".repeat(25))).toBe("슛폼");
    expect(minimalAnalysisTitle(["SHOT 12"])).toBe("슛폼");
    expect(minimalAnalysisTitle("https://example.com")).toBe("슛폼");
  });

  it("is what the analysis route switches on, leaving the full three-layer layout in place", () => {
    const route = read("app/private-analysis/[id].tsx");
    expect(route).toContain("resolveAnalysisPresentation(");
    expect(route).toContain("minimalAnalysisTitle(");
    expect(route).toContain("<MinimalAnalysis");
    for (const layer of ["<AnalysisSummaryLine", "<ShotInspectionViewer", "<AnalysisDetails", "<AnalysisEvidence"]) {
      expect(route).toContain(layer);
    }
    // Access rules are untouched: both flags, the signed-in owner, an opaque id and a current request key.
    expect(route).toContain("FORMPATH_FLAGS.profileV2 && FORMPATH_FLAGS.representative4DViewer");
    expect(route).toContain("canRenderShootingProfileViewerRecord(");
    expect(route).toContain("opaqueProfileId(id)");
  });

  it("keeps the minimal surface honest: the same inspection, details and evidence sit behind one sheet, nothing social", () => {
    const minimal = read("components/analysis/minimal-analysis.tsx");
    for (const layer of ["<AnalysisSummaryLine", "<ShotInspectionViewer", "<AnalysisDetails", "<AnalysisEvidence"]) {
      expect(minimal).toContain(layer);
    }
    expect(minimal).toContain("<Modal");
    expect(minimal).toContain("<ReelMotionPlayer");
    expect(minimal).toContain("<ReelProgress");
    expect(minimal).not.toMatch(/좋아요|댓글|팔로우|공유하기|likes|comments|follower/i);
    expect(minimal).not.toMatch(/측정된 물리|actual 4D|synchronized representative/i);
    const controls = minimal.match(/<(?:Pressable|LiquidPressable)\b/g)?.length ?? 0;
    expect(controls).toBeGreaterThan(0);
    expect(minimal.match(/accessibilityRole=/g)?.length ?? 0).toBeGreaterThanOrEqual(controls);
    expect(minimal.match(/accessibilityLabel=/g)?.length ?? 0).toBeGreaterThanOrEqual(controls);
  });
});
