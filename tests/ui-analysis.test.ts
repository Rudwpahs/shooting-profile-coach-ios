import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("app/private-analysis/[id].tsx", "utf8");
const layers = readFileSync("components/analysis/analysis-layers.tsx", "utf8");
const viewer = readFileSync("components/shooting-profile/sequence-viewer.tsx", "utf8");

describe("analysis in three layers", () => {
  it("opens on the skeleton, a band and one finding, with the numbers one tap deeper", () => {
    const summary = route.indexOf("<AnalysisSummaryLine");
    const stage = route.indexOf("<SequenceViewer");
    const details = route.indexOf("<AnalysisDetails");
    const evidence = route.indexOf("<AnalysisEvidence");
    expect(summary).toBeGreaterThan(-1);
    expect(stage).toBeGreaterThan(summary);
    expect(details).toBeGreaterThan(stage);
    expect(evidence).toBeGreaterThan(details);
    expect(route).not.toMatch(/PRIVATE ANALYSIS|나의 대표 슛폼|소유자 계정에서만 불러온/);
  });

  it("keeps the percentage and the conventions in layer 2, collapsed by default", () => {
    expect(layers).toContain("const [expanded, setExpanded] = useState(false);");
    expect(layers).toContain('accessibilityState={{ expanded, disabled: false }}');
    const details = layers.slice(layers.indexOf("export function AnalysisDetails"), layers.indexOf("export function AnalysisEvidence"));
    expect(details).toContain("추정 신뢰도");
    expect(details).toContain("* 100)}%");
    const summaryLine = layers.slice(layers.indexOf("export function AnalysisSummaryLine"), layers.indexOf("function Disclosure"));
    expect(summaryLine).not.toContain("%");
  });

  it("puts per-joint cones and the boundary in layer 3 from stored uncertainty only", () => {
    const evidence = layers.slice(layers.indexOf("export function AnalysisEvidence"));
    expect(evidence).toContain("jointConeSummary(profile)");
    expect(evidence).toContain("위상 결합 4D 추정 · 실측 3D 아님");
    expect(evidence).toContain("heuristic_v1");
    expect(layers).not.toMatch(/reconstructBoneDirection|buildRepresentativeSequence|two-view-pipeline/);
  });

  it("plays like a post: tap the stage to pause or resume, scrub 1:1, snap to anchors, no text chrome", () => {
    expect(viewer).not.toMatch(/REPRESENTATIVE SEQUENCE|대표 슛폼 101|metaPanel|sampleNote|legend/);
    expect(viewer).toContain('accessibilityLabel={isPlaying ? "대표 동작 일시정지" : "대표 동작 재생"}');
    expect(viewer).toContain("onTouchMove={(event) => seekFromTrack(event.nativeEvent.locationX)}");
    expect(viewer).toContain('accessibilityRole="adjustable"');
    expect(viewer).toContain("Haptics.selectionAsync()");
    expect(viewer).toContain("AccessibilityInfo.announceForAccessibility(message)");
    for (const control of ["대표 동작 위상 슬라이더", "시점 선택", "위상 ${marker.index}%로 이동"]) {
      expect(viewer).toContain(control);
    }
  });

  it("makes a low-confidence result look different from a high one", () => {
    expect(layers).toContain("styles.dotHigh");
    expect(layers).toContain("styles.dotRecapture");
    expect(layers).toContain("styles.qualityRecapture");
  });
});
