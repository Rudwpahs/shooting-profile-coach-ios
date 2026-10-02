import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { representativeGlyph, representativeReleaseFrameIndex, representativeSequenceBounds } from "@/components/skeleton/representative-glyph";
import { isOpaqueShootingProfileIdV2 } from "@/lib/firebase-shooting-profile-contract";
import { buildPhaseSpaceGeometry } from "@/lib/phase-space/geometry";
import {
  PREVIEW_SHOT_ARCHETYPES,
  PREVIEW_SHOT_IDS,
  buildPreviewShotRecord,
  previewShotSummary,
} from "@/lib/preview/preview-shot-library";
import { PERSISTED_JOINT_NAMES_V2, type RepresentativePose4DV2 } from "@/lib/shooting-profile/types";
import { anchorPositions, primaryFinding } from "@/lib/skeleton/analysis-evidence";


// The glyph helpers sit next to the native sequence viewer, whose platform modules have no Node runtime.
vi.mock("react-native", () => ({ StyleSheet: { create: <T>(styles: T) => styles }, AccessibilityInfo: {}, AppState: {} }));
vi.mock("react-native-svg", () => ({ default: () => null, Circle: () => null, Line: () => null }));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({ default: () => null }));
vi.mock("expo-haptics", () => ({ selectionAsync: async () => undefined }));
type Joint = { x: number; y: number; z: number };
const joint = (profile: RepresentativePose4DV2, frame: number, name: string): Joint => (
  (profile.frames[frame].joints as unknown as Record<string, Joint>)[name]
);

const REAL_PLAYER_NAMES = /Curry|Thompson|Edwards|Paul George|Stephen|Klay|Anthony|LeBron|Durant|Lillard|Doncic|Jokic|Tatum/i;

function maxJointDistance(left: RepresentativePose4DV2, right: RepresentativePose4DV2): number {
  let maxDiff = 0;
  for (let frame = 0; frame < left.frames.length; frame += 1) {
    for (const name of PERSISTED_JOINT_NAMES_V2) {
      const a = joint(left, frame, name);
      const b = joint(right, frame, name);
      maxDiff = Math.max(maxDiff, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    }
  }
  return maxDiff;
}

describe("preview shot library", () => {
  const records = PREVIEW_SHOT_ARCHETYPES.map((entry) => ({ entry, record: buildPreviewShotRecord(entry) }));

  it("offers at least sixteen archetypes with unique opaque ids and unique keys", () => {
    expect(PREVIEW_SHOT_ARCHETYPES.length).toBeGreaterThanOrEqual(16);
    expect(new Set(PREVIEW_SHOT_IDS).size).toBe(PREVIEW_SHOT_IDS.length);
    expect(new Set(PREVIEW_SHOT_ARCHETYPES.map((entry) => entry.key)).size).toBe(PREVIEW_SHOT_ARCHETYPES.length);
    expect(PREVIEW_SHOT_IDS.every((id) => isOpaqueShootingProfileIdV2(id))).toBe(true);
    expect(PREVIEW_SHOT_IDS[0]).toBe("preview-shot-001");
  });

  it("is deterministic: the same id always yields the same motion, phases and summary, with no randomness in the generator", () => {
    const source = readFileSync("lib/preview/preview-shot-library.ts", "utf8") + readFileSync("tests/fixtures/synthetic-landmark-sequence.ts", "utf8");
    expect(source).not.toMatch(/Math\.random|crypto\.|Date\.now\(\)|new Date\(\)/);
    for (const { entry, record } of records) {
      // Memoised: the identical object comes back, and a fresh pipeline run agrees with it.
      expect(buildPreviewShotRecord(entry)).toBe(record);
      expect(JSON.stringify(previewShotSummary(entry))).toBe(JSON.stringify(previewShotSummary(entry)));
    }
    const rebuilt = JSON.parse(JSON.stringify(records[3].record.profile)) as RepresentativePose4DV2;
    expect(rebuilt).toEqual(JSON.parse(JSON.stringify(buildPreviewShotRecord(PREVIEW_SHOT_ARCHETYPES[3]).profile)));
  });

  it("satisfies the stored profile schema for every archetype: 101 normalised phases, five canonical anchors, passed quality", () => {
    for (const { entry, record } of records) {
      const { profile } = record;
      expect(profile.schemaVersion, entry.key).toBe(2);
      expect(profile.boundary, entry.key).toBe("representative_phase_fused_4d_estimate_not_actual_3d");
      expect(profile.timeBasis, entry.key).toBe("normalized_shot_phase");
      expect(profile.units, entry.key).toBe("template_shoulder_breadths");
      expect(profile.mode, entry.key).toBe(entry.mode);
      expect(profile.frames.length, entry.key).toBe(101);
      expect(profile.phaseAnchors.map((anchor) => anchor.phase), entry.key).toEqual([0, 0.25, 0.5, 0.75, 1]);
      expect(profile.quality.passed, entry.key).toBe(true);
      expect(record.shootingHand, entry.key).toBe(entry.shootingHand);
    }
  });

  it("stores finite joints and uncertainty for all 101 samples of every archetype", () => {
    for (const { entry, record } of records) {
      record.profile.frames.forEach((frame, index) => {
        expect(frame.phase, `${entry.key} frame ${index}`).toBeCloseTo(index / 100, 6);
        for (const name of PERSISTED_JOINT_NAMES_V2) {
          const point = joint(record.profile, index, name);
          expect(Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z), `${entry.key} ${name} @${index}`).toBe(true);
          const cone = frame.uncertainty[name]?.directionalConeDegrees;
          expect(typeof cone === "number" && Number.isFinite(cone) && cone >= 0, `${entry.key} ${name} cone @${index}`).toBe(true);
        }
      });
    }
  });

  it("keeps the recorded summary confidence honest against the pipeline for every archetype", () => {
    for (const { entry, record } of records) {
      expect(Math.abs(previewShotSummary(entry).confidence - record.confidence), entry.key).toBeLessThan(0.005);
    }
  });

  it("produces visibly different shots: every pair of archetypes diverges in joint trajectories and several form metrics take many distinct values", () => {
    let closest = Number.POSITIVE_INFINITY;
    for (let a = 0; a < records.length; a += 1) {
      for (let b = a + 1; b < records.length; b += 1) {
        const distance = maxJointDistance(records[a].record.profile, records[b].record.profile);
        closest = Math.min(closest, distance);
        expect(distance, `${records[a].entry.key} vs ${records[b].entry.key}`).toBeGreaterThan(0.12);
      }
    }
    expect(closest).toBeGreaterThan(0.12);

    const metrics = records.map(({ entry, record }) => {
      const hand = entry.shootingHand;
      const { profile } = record;
      return {
        releaseForward: (joint(profile, 75, `${hand}Wrist`).z - joint(profile, 75, `${hand}Shoulder`).z).toFixed(2),
        kneeBend: (joint(profile, 40, `${hand}Knee`).y - joint(profile, 40, `${hand}Hip`).y).toFixed(2),
        stance: Math.abs(joint(profile, 0, "leftAnkle").x - joint(profile, 0, "rightAnkle").x).toFixed(2),
        lean: (joint(profile, 0, `${hand}Shoulder`).z - joint(profile, 0, `${hand}Hip`).z).toFixed(2),
        liftAt40: (joint(profile, 40, `${hand}Wrist`).y - joint(profile, 40, `${hand}Shoulder`).y).toFixed(2),
      };
    });
    expect(new Set(metrics.map((metric) => metric.releaseForward)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(metrics.map((metric) => metric.kneeBend)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(metrics.map((metric) => metric.stance)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(metrics.map((metric) => metric.lean)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(metrics.map((metric) => metric.liftAt40)).size).toBeGreaterThanOrEqual(4);
    // The summary line each analysis opens on is not one sentence repeated.
    expect(new Set(records.map(({ record }) => primaryFinding(record.profile).line)).size).toBeGreaterThanOrEqual(3);
  });

  it("never names a real player and stays declared synthetic", () => {
    const source = readFileSync("lib/preview/preview-shot-library.ts", "utf8");
    expect(source).not.toMatch(REAL_PLAYER_NAMES);
    expect(source).toMatch(/synthetic/i);
    expect(source).not.toMatch(/measured 3D|actual 4D|synchronized representative|real player/i);
    for (const entry of PREVIEW_SHOT_ARCHETYPES) {
      expect(entry.label, entry.key).not.toMatch(REAL_PLAYER_NAMES);
      expect(entry.key).not.toMatch(REAL_PLAYER_NAMES);
    }
  });

  it("lists newest first with strictly decreasing creation dates fixed to the library's anchor date", () => {
    const dates = PREVIEW_SHOT_ARCHETYPES.map((entry) => previewShotSummary(entry).createdAt.toDate().getTime());
    for (let index = 1; index < dates.length; index += 1) expect(dates[index]).toBeLessThan(dates[index - 1]);
    expect(new Date(dates[0]).getFullYear()).toBe(2026);
  });

  it("opens in the real Motion viewer helpers for every archetype", () => {
    for (const { entry, record } of records) {
      const releaseIndex = representativeReleaseFrameIndex(record.profile);
      expect(releaseIndex, entry.key).toBeGreaterThanOrEqual(0);
      for (const view of ["front", "oblique", "side"] as const) {
        const glyph = representativeGlyph(record.profile.frames[releaseIndex], view, record.shootingHand);
        expect(Object.keys(glyph.points).length, `${entry.key} ${view}`).toBeGreaterThan(0);
        const bounds = representativeSequenceBounds(record.profile, view, record.shootingHand);
        expect(bounds.maxX, `${entry.key} ${view}`).toBeGreaterThan(bounds.minX);
      }
    }
  });

  it("builds a distinct Phase Space for every archetype", () => {
    const signatures = new Set<string>();
    for (const { entry, record } of records) {
      const geometry = buildPhaseSpaceGeometry(record.profile, "oblique", record.shootingHand, 11);
      expect(geometry.frames.length, entry.key).toBe(101);
      expect(anchorPositions(record.profile).map((anchor) => anchor.percent), entry.key).toEqual([0, 25, 50, 75, 100]);
      // The viewer draws every joint's trajectory; two archetypes may share a wrist path but never the whole stage.
      signatures.add(geometry.frames.map((frame) => (
        Object.values(frame.joints).map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)},${point.z.toFixed(2)}`).join(";")
      )).join("|"));
    }
    expect(signatures.size).toBe(records.length);
  });
});
