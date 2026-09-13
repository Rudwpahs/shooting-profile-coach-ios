import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getCriticalLandmarkIndices } from "@/lib/shooting-profile/view-quality-policy";

/**
 * Three implementations compute `quality.reasons` independently: the TypeScript
 * contract (which re-derives them on parse), the iOS native extractor, and the
 * offline MediaPipe adapter. If their final critical-joint policies drift, the
 * parser rejects every sequence the drifting emitter produces. Neither the
 * native module nor the adapter runs in CI, so their policies are pinned here
 * from source against the single TypeScript policy.
 */

const projectFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const SWIFT = "modules/formpath-pose/ios/FormpathPoseModule.swift";
const PYTHON = "scripts/extract-offline-landmark-sequence-v2.py";
const LEGACY_LOCATOR_INDICES = [11, 12, 15, 16, 23, 24, 25, 26, 27, 28];

function integerList(source: string, pattern: RegExp): number[] {
  const match = source.match(pattern);
  if (!match) throw new Error(`list not found: ${pattern}`);
  return match[1].split(",").map((value) => value.trim()).filter(Boolean).map(Number);
}

function swiftList(source: string, name: string): number[] {
  return integerList(source, new RegExp(`static let ${name} = \\[([^\\]]*)\\]`));
}

function pythonTuple(source: string, name: string): number[] {
  return integerList(source, new RegExp(`^${name} = \\(([^)]*)\\)`, "m"));
}

function sliceFunction(source: string, marker: string, endMarker: RegExp): string {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`function not found: ${marker}`);
  const rest = source.slice(start + marker.length);
  const end = rest.search(endMarker);
  return end < 0 ? rest : rest.slice(0, end);
}

const CASES = [
  { view: "front", hand: "right" },
  { view: "front", hand: "left" },
  { view: "shooting_side", hand: "right" },
  { view: "shooting_side", hand: "left" },
] as const;

describe("final quality critical-joint policy parity", () => {
  it("pins the TypeScript policy the other two implementations must match", () => {
    expect(getCriticalLandmarkIndices("front", "right")).toEqual(LEGACY_LOCATOR_INDICES);
    expect(getCriticalLandmarkIndices("shooting_side", "right")).toEqual([12, 14, 16, 23, 24, 25, 26, 27, 28]);
    expect(getCriticalLandmarkIndices("shooting_side", "left")).toEqual([11, 13, 15, 23, 24, 25, 26, 27, 28]);
  });

  describe("iOS native extractor", () => {
    const swift = projectFile(SWIFT);

    it("declares the same per-view final quality lists", () => {
      expect(swiftList(swift, "frontCriticalLandmarkIndices")).toEqual([...getCriticalLandmarkIndices("front", "right")]);
      expect(swiftList(swift, "rightShootingSideCriticalLandmarkIndices"))
        .toEqual([...getCriticalLandmarkIndices("shooting_side", "right")]);
      expect(swiftList(swift, "leftShootingSideCriticalLandmarkIndices"))
        .toEqual([...getCriticalLandmarkIndices("shooting_side", "left")]);
    });

    it("selects the list from view and shooting hand exactly as TypeScript does", () => {
      const selector = sliceFunction(swift, "static func finalQualityCriticalLandmarkIndices(", /\n {2}\}/);
      expect(selector).toContain("view: String");
      expect(selector).toContain("shootingHand: String");
      expect(selector).toMatch(/if view == "front" \{\s*return frontCriticalLandmarkIndices\s*\}/);
      expect(selector).toMatch(/shootingHand == "right"\s*\?\s*rightShootingSideCriticalLandmarkIndices\s*:\s*leftShootingSideCriticalLandmarkIndices/);
      for (const testCase of CASES) {
        const expected = testCase.view === "front"
          ? "frontCriticalLandmarkIndices"
          : testCase.hand === "right" ? "rightShootingSideCriticalLandmarkIndices" : "leftShootingSideCriticalLandmarkIndices";
        const expectedList = swiftList(swift, expected);
        expect(expectedList).toEqual([...getCriticalLandmarkIndices(testCase.view, testCase.hand)]);
      }
    });

    it("feeds view and shooting hand into final quality and uses no global list there", () => {
      const quality = sliceFunction(swift, "private func qualityReasons(", /\n {2}private func /);
      expect(quality).toMatch(/view: String/);
      expect(quality).toMatch(/shootingHand: String/);
      expect(quality).toContain("finalQualityCriticalLandmarkIndices(");
      expect(quality).not.toContain("locatorCriticalLandmarkIndices");
      expect(swift).toMatch(/qualityReasons\(\s*for: output,\s*releaseProxyTimestampMs: releaseProxyTimestampMs,\s*view: request\.view,\s*shootingHand: request\.shootingHand\s*\)/);
    });

    it("keeps the locator ROI on its own unchanged person-finding list", () => {
      expect(swiftList(swift, "locatorCriticalLandmarkIndices")).toEqual(LEGACY_LOCATOR_INDICES);
      const locator = sliceFunction(swift, "private func locatorFrameBodyEvidence(", /\n {2}private func /);
      expect(locator).toContain("locatorCriticalLandmarkIndices");
      expect(locator).not.toContain("finalQualityCriticalLandmarkIndices");
      expect(swift).not.toMatch(/static let criticalLandmarkIndices = /);
    });

    it("keeps the final quality thresholds unchanged", () => {
      expect(swift).toContain("static let minimumCriticalJointCoverage = 0.85");
      expect(swift).toContain("static let minimumCriticalJointVisibility = 0.5");
    });
  });

  describe("offline MediaPipe adapter", () => {
    const python = projectFile(PYTHON);

    it("declares the same per-view final quality lists", () => {
      expect(pythonTuple(python, "FRONT_CRITICAL_LANDMARK_INDICES")).toEqual([...getCriticalLandmarkIndices("front", "right")]);
      expect(pythonTuple(python, "RIGHT_SHOOTING_SIDE_CRITICAL_LANDMARK_INDICES"))
        .toEqual([...getCriticalLandmarkIndices("shooting_side", "right")]);
      expect(pythonTuple(python, "LEFT_SHOOTING_SIDE_CRITICAL_LANDMARK_INDICES"))
        .toEqual([...getCriticalLandmarkIndices("shooting_side", "left")]);
    });

    it("selects the list from --view and --hand and uses it for final quality", () => {
      const selector = sliceFunction(python, "def final_quality_critical_landmark_indices(", /\n\n\ndef /);
      expect(selector).toMatch(/if view == "front":\s*return FRONT_CRITICAL_LANDMARK_INDICES/);
      expect(selector).toMatch(/RIGHT_SHOOTING_SIDE_CRITICAL_LANDMARK_INDICES if shooting_hand == "right" else LEFT_SHOOTING_SIDE_CRITICAL_LANDMARK_INDICES/);
      const quality = sliceFunction(python, "def quality_reasons(", /\n\n\ndef /);
      expect(quality).toContain("final_quality_critical_landmark_indices(view, shooting_hand)");
      expect(quality).not.toContain("LOCATOR_CRITICAL_LANDMARK_INDICES");
      expect(python).toMatch(/quality_reasons\(output, release_proxy_ms, view, shooting_hand\)/);
    });

    it("keeps the locator ROI on its own unchanged list and the thresholds unchanged", () => {
      expect(pythonTuple(python, "LOCATOR_CRITICAL_LANDMARK_INDICES")).toEqual(LEGACY_LOCATOR_INDICES);
      const locator = sliceFunction(python, "def _body_evidence(", /\n\n\ndef /);
      expect(locator).toContain("LOCATOR_CRITICAL_LANDMARK_INDICES");
      expect(python).not.toMatch(/^CRITICAL_LANDMARK_INDICES = /m);
      expect(python).toContain("MINIMUM_CRITICAL_JOINT_COVERAGE = 0.85");
      expect(python).toContain("MINIMUM_CRITICAL_JOINT_VISIBILITY = 0.5");
    });
  });
});
