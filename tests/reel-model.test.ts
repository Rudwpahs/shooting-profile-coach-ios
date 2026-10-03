import { describe, expect, it, vi } from "vitest";

import { reelConfidence } from "@/components/reels/reel-motion-player";
import { representativeConfidence } from "@/components/skeleton/representative-glyph";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { relativeDayLabel } from "@/lib/format/relative-day";
import {
  filmReelId,
  filmShotReel,
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
import type { FilmShotV1 } from "@/lib/film-space/film-shots";
import { reelStartFrame } from "@/lib/reels/reel-playback";
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

  it("lets Explore name a profile reel honestly instead of 내 슛폼, and reads that name first", () => {
    const explore = { ...profile, title: "SHOT 12", line: "앞으로 기운 릴리스 · 미리보기 합성 예시" };
    expect(reelTitle(explore)).toBe("SHOT 12");
    expect(reelLine(explore)).toBe("앞으로 기운 릴리스 · 미리보기 합성 예시");
    expect(reelAccessibilityName(explore)).toBe("SHOT 12 릴");
    expect(reelAnalysisProfileId(explore)).toBe("demo-profile-1");
    // Without a name, a profile reel is still mine.
    expect(reelTitle({ ...explore, title: undefined, line: undefined })).toBe("내 슛폼");
  });

  it("exposes analysis only for a profile", () => {
    expect(reelAnalysisProfileId(profile)).toBe("demo-profile-1");
    expect(reelAnalysisProfileId(reference)).toBeNull();
  });

  it("shows confidence as form, never as a number", () => {
    expect(reelConfidence(profile)).toBe(representativeConfidence(profile.profile));
    expect(reelConfidence(reference)).toBe("basic");
  });

  it("models a device-local film shot as a reel with its own name, an honest line and no analysis", () => {
    const shot: FilmShotV1 = {
      version: "film_shot_v1",
      id: "film-shot-abc-1",
      title: "내 슛폼 1",
      createdAtMs: new Date(2026, 9, 2, 10, 0, 0).getTime(),
      clips: [{ slotId: "front-0", view: "front", takeIndex: 0, uri: "blob:front", durationMs: 3533, width: 1080, height: 1920 }],
    };
    const reel = filmShotReel(shot);
    expect(reel).toMatchObject({ kind: "film", id: "film:film-shot-abc-1", shotId: "film-shot-abc-1", title: "내 슛폼 1" });
    expect(reel.kind === "film" && reel.clips).toHaveLength(1);
    expect(reelTitle(reel)).toBe("내 슛폼 1");
    expect(reelLine(reel)).toContain("내 영상");
    expect(reelLine(reel)).toContain(relativeDayLabel(new Date(shot.createdAtMs)));
    expect(reelAccessibilityName(reel)).toBe("내 슛폼 1 영상 릴");
    expect(reelAnalysisProfileId(reel)).toBeNull();
    expect(reelConfidence(reel)).toBe("basic");
    expect(reelStartFrame(reel)).toBe(0);
    expect(filmReelId("film-shot-abc-1")).toBe("film:film-shot-abc-1");
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

  it("puts my film shots between my profile and the references, newest first, whatever order they arrive in", () => {
    const older: FilmShotV1 = { version: "film_shot_v1", id: "film-shot-a-1", title: "내 슛폼 1", createdAtMs: new Date(2026, 9, 1).getTime(), clips: [] };
    const newer: FilmShotV1 = { version: "film_shot_v1", id: "film-shot-b-2", title: "내 슛폼 2", createdAtMs: new Date(2026, 9, 2).getTime(), clips: [] };
    const items = homeReelItems(ready, ANONYMOUS_POSE_REFERENCES, [older, newer]);
    expect(items.map((item) => item.kind)).toEqual(["profile", "film", "film", ...ANONYMOUS_POSE_REFERENCES.map(() => "reference")]);
    expect(items[1].id).toBe(filmReelId(newer.id));
    expect(items[2].id).toBe(filmReelId(older.id));
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    // Without film shots the list is exactly what it was.
    expect(homeReelItems(ready, ANONYMOUS_POSE_REFERENCES).map((item) => item.kind)).toEqual(["profile", ...ANONYMOUS_POSE_REFERENCES.map(() => "reference")]);
  });

  it("offers only references when there is no profile to show", () => {
    for (const status of ["signed-out", "disabled", "loading", "empty", "error"] as const) {
      const items = homeReelItems({ status }, ANONYMOUS_POSE_REFERENCES);
      expect(items.length).toBe(ANONYMOUS_POSE_REFERENCES.length);
      expect(items.every((item) => item.kind === "reference")).toBe(true);
    }
  });
});
