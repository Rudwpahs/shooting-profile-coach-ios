import { describe, expect, it, vi } from "vitest";

import { reelConfidence } from "@/components/reels/reel-motion-player";
import { representativeConfidence } from "@/components/skeleton/representative-glyph";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { relativeDayLabel } from "@/lib/format/relative-day";
import {
  profileReelId,
  reelAccessibilityName,
  reelAnalysisProfileId,
  reelLine,
  reelTitle,
  referenceReelId,
} from "@/lib/reels/reel-model";
import { homeReelItems } from "@/lib/reels/reel-sources";
import type { LatestRepresentativeState } from "@/hooks/use-latest-representative-profile";
import type { ShootingProfileSummaryV2 } from "@/lib/firebase-shooting-profiles";
import { anonymousReferenceReel, syntheticProfileReel, syntheticRepresentative } from "@/tests/fixtures/reel-fixtures";

// The projection helpers live beside the analysis viewer, which pulls React Native in; node tests mock the runtime.
vi.mock("react-native", () => ({ StyleSheet: { create: <T>(styles: T) => styles }, AccessibilityInfo: {}, AppState: {} }));
vi.mock("react-native-svg", () => ({ default: () => null, Circle: () => null, Line: () => null }));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({ default: () => null }));
vi.mock("expo-haptics", () => ({ selectionAsync: async () => undefined }));

const profile = syntheticProfileReel();
const reference = anonymousReferenceReel();

describe("reel model", () => {
  it("names items by kind, never by a person", () => {
    expect(reelTitle(profile)).toBe("내 슛폼");
    expect(reelTitle(reference)).toBe(reference.reference.shortLabel);
    expect(reelAccessibilityName(profile)).toBe("내 슛폼 릴");
    expect(reelAccessibilityName(reference)).toBe(`${reference.reference.shortLabel} 참조 릴, CMU optical mocap`);
    expect(`${reelTitle(reference)} ${reelAccessibilityName(reference)}`).not.toMatch(/Curry|Paul George/);
  });

  it("gives one line per item: recency for mine, the style title for a reference", () => {
    expect(reelLine(profile)).toBe(relativeDayLabel(profile.createdAt));
    expect(reelLine(reference)).toBe(reference.reference.styleTitle);
  });

  it("exposes analysis only for a profile", () => {
    expect(reelAnalysisProfileId(profile)).toBe("demo-profile-1");
    expect(reelAnalysisProfileId(reference)).toBeNull();
  });

  it("shows confidence as form, never as a number", () => {
    expect(reelConfidence(profile)).toBe(representativeConfidence(profile.profile));
    expect(reelConfidence(reference)).toBe("basic");
  });

  it("builds ids that identify the kind and survive a route param", () => {
    expect(profileReelId("abc-123")).toBe("profile:abc-123");
    expect(referenceReelId(reference.reference.id)).toBe(reference.id);
    expect(decodeURIComponent(encodeURIComponent(profileReelId("abc-123")))).toBe("profile:abc-123");
  });
});

describe("home reel items", () => {
  const { profile: representative, confidence } = syntheticRepresentative();
  const createdAt = new Date(2026, 8, 15, 10, 0, 0);
  const summary = {
    id: "demo-profile-1",
    mode: "basic_1_plus_1",
    shootingHand: "right",
    confidence,
    createdAt: { toDate: () => createdAt },
  } as unknown as ShootingProfileSummaryV2;
  const ready: LatestRepresentativeState = { status: "ready", summary, record: { profile: representative, shootingHand: "right", confidence } };

  it("puts my latest profile first, then the anonymous references", () => {
    const items = homeReelItems(ready, ANONYMOUS_POSE_REFERENCES);
    expect(items[0]).toMatchObject({ kind: "profile", id: "profile:demo-profile-1", profileId: "demo-profile-1", shootingHand: "right", createdAt });
    expect(items.slice(1).map((item) => item.id)).toEqual(ANONYMOUS_POSE_REFERENCES.map((candidate) => `reference:${candidate.id}`));
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it("offers only references when there is no profile to show", () => {
    for (const status of ["signed-out", "disabled", "loading", "empty", "error"] as const) {
      const items = homeReelItems({ status }, ANONYMOUS_POSE_REFERENCES);
      expect(items.length).toBe(ANONYMOUS_POSE_REFERENCES.length);
      expect(items.every((item) => item.kind === "reference")).toBe(true);
    }
  });
});
