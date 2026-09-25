import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  clampPhaseSpaceZoom,
  phaseIndexFromScrub,
} from "@/lib/phase-space/interaction";

const VIEWER_SOURCE = readFileSync(
  resolve(process.cwd(), "components/shooting-profile/phase-space-viewer.tsx"),
  "utf8",
);

describe("phase-space viewer contract", () => {
  it("maps scrub position deterministically onto the stored 0..100 phase index", () => {
    expect(phaseIndexFromScrub(0)).toBe(0);
    expect(phaseIndexFromScrub(0.5)).toBe(50);
    expect(phaseIndexFromScrub(1)).toBe(100);
    expect(phaseIndexFromScrub(-1)).toBe(0);
    expect(phaseIndexFromScrub(2)).toBe(100);
  });

  it("keeps zoom bounded for stable projection", () => {
    expect(clampPhaseSpaceZoom(0.2)).toBe(0.75);
    expect(clampPhaseSpaceZoom(1.1)).toBe(1.1);
    expect(clampPhaseSpaceZoom(4)).toBe(1.8);
  });

  it("renders trajectories, sparse ghosts, semantic anchors, rotate, zoom, and scrub", () => {
    expect(VIEWER_SOURCE).toMatch(/trajector/i);
    expect(VIEWER_SOURCE).toMatch(/ghost/i);
    expect(VIEWER_SOURCE).toMatch(/ready/);
    expect(VIEWER_SOURCE).toMatch(/deepestDip/);
    expect(VIEWER_SOURCE).toMatch(/rise/);
    expect(VIEWER_SOURCE).toMatch(/releaseProxy/);
    expect(VIEWER_SOURCE).toMatch(/followThrough/);
    expect(VIEWER_SOURCE).toMatch(/PanResponder/);
    expect(VIEWER_SOURCE).toMatch(/zoom/i);
    expect(VIEWER_SOURCE).toMatch(/scrub/i);
    expect(VIEWER_SOURCE).toMatch(/accessibilityLabel/);
  });

  it("labels the axis as shot phase and explicitly rejects synchronized-time or measured-4D interpretation", () => {
    expect(VIEWER_SOURCE).toMatch(/SHOT PHASE/);
    expect(VIEWER_SOURCE).toMatch(/정규화/);
    expect(VIEWER_SOURCE).toMatch(/동기화 시간축이 아님/);
    expect(VIEWER_SOURCE).toMatch(/계측 4D가 아님/);
    expect(VIEWER_SOURCE).not.toMatch(/SYNC TIME|실시간 4D/);
  });
});