import { describe, expect, it } from "vitest";

import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import {
  HOME_STATUS_LINES,
  buildHomeFeed,
  homeStatusLine,
  insertCoachReel,
  referenceReels,
  userReelFromLatest,
} from "@/lib/feed/home-feed";
import { reelLabFixtures, representativeFixtureFromMotion } from "@/lib/feed/reel-fixtures";
import { reelAccessibilityName, reelLabel, reelLine, type CoachReel, type ReelItem, type UserReel } from "@/lib/feed/reel-model";
import { isMomentSaved, toggleSavedMoment, type SavedMoment } from "@/lib/feed/saved-moments";
import type { LatestRepresentativeState } from "@/hooks/use-latest-representative-profile";

const reference = ANONYMOUS_POSE_REFERENCES[0];
const profile = representativeFixtureFromMotion(reference.motion, "right");
const fixtures = reelLabFixtures();
const coach = fixtures.find((item): item is CoachReel => item.kind === "coach");
if (!coach) throw new Error("fixture coach reel");

const ready = (createdAt: Date, quality = profile.quality): LatestRepresentativeState => ({
  status: "ready",
  summary: { id: "abc123def456", mode: "basic_1_plus_1", shootingHand: "right", confidence: 0.65, createdAt: { toDate: () => createdAt } } as never,
  record: { profile: { ...profile, quality }, shootingHand: "right", confidence: 0.65 } as never,
});

const own = (id = "user-abc123def456"): UserReel => ({ kind: "user", id, author: "내 슛폼", meta: "오늘", caption: "Basic · 4D 추정 · 실측 3D 아님", motion: { source: "representative", profile, shootingHand: "right" } });
const refs = referenceReels(ANONYMOUS_POSE_REFERENCES);

describe("home feed composition", () => {
  it("turns the anonymous references into reference reels, nothing named", () => {
    expect(refs).toHaveLength(ANONYMOUS_POSE_REFERENCES.length);
    expect(refs[0]).toMatchObject({ kind: "reference", id: `reference-${reference.id}`, label: reference.shortLabel, attribution: "CMU optical mocap" });
    expect(refs[0].motion).toEqual({ source: "reference", motion: reference.motion, hand: "right" });
    expect(JSON.stringify(refs.map((item) => [reelLabel(item), reelLine(item)]))).not.toMatch(/Curry|Paul George|PLAYER_/);
  });

  it("orders the feed: my reel first, the coaching moment right after it, then references", () => {
    const feed = buildHomeFeed({ own: own(), coach, references: refs });
    expect(feed.map((item) => item.kind)).toEqual(["user", "coach", "reference"]);
    expect(new Set(feed.map((item) => item.id)).size).toBe(feed.length);
  });

  it("is video-first without a coaching moment, and references-only without my reel", () => {
    expect(buildHomeFeed({ own: own(), coach: null, references: refs }).map((item) => item.kind)).toEqual(["user", "reference"]);
    expect(buildHomeFeed({ own: null, coach, references: refs }).map((item) => item.kind)).toEqual(["reference"]);
    expect(buildHomeFeed({ own: null, coach: null, references: refs }).map((item) => item.kind)).toEqual(["reference"]);
  });

  it("inserts the coaching moment after the first user reel and never leads with it", () => {
    const items: ReelItem[] = [own("user-1"), own("user-2"), refs[0]];
    expect(insertCoachReel(items, coach).map((item) => item.id)).toEqual(["user-1", coach.id, "user-2", refs[0].id]);
    expect(insertCoachReel([refs[0]], coach)).toEqual([refs[0]]);
    expect(insertCoachReel(items, null)).toEqual(items);
    expect(insertCoachReel([], coach)).toEqual([]);
  });

  it("builds my reel from the latest profile with honest recency and band, never engagement numbers", () => {
    const today = userReelFromLatest(ready(new Date()));
    expect(today).toMatchObject({ kind: "user", id: "user-abc123def456", author: "내 슛폼", meta: "오늘", caption: "Basic · 4D 추정 · 실측 3D 아님" });
    expect(today?.motion).toEqual({ source: "representative", profile: expect.objectContaining({ boundary: "representative_phase_fused_4d_estimate_not_actual_3d" }), shootingHand: "right" });
    if (today) {
      expect(reelLabel(today)).toBe("내 슛폼 · 오늘");
      expect(reelAccessibilityName(today)).toBe("내 슛폼 릴");
      expect(reelLine(today)).toBe("Basic · 4D 추정 · 실측 3D 아님");
    }
    const recapture = userReelFromLatest(ready(new Date(), { passed: false, reasons: ["uncertainty_exceeds_limit"] }));
    expect(recapture?.caption).toBe("재촬영 필요 · 4D 추정 · 실측 3D 아님");
    for (const status of ["signed-out", "disabled", "loading", "empty", "error"] as const) {
      expect(userReelFromLatest({ status })).toBeNull();
    }
  });

  it("keeps one honest status line for every state without my reel, and none when it is there", () => {
    expect(HOME_STATUS_LINES).toEqual({
      "signed-out": "로그인 후 촬영",
      disabled: "대표 슛폼 저장이 꺼져 있습니다",
      loading: "내 슛폼을 불러오는 중",
      empty: "첫 슛폼을 촬영해 보세요",
      error: "내 슛폼을 불러오지 못했습니다",
    });
    for (const status of ["signed-out", "disabled", "loading", "empty", "error"] as const) {
      expect(homeStatusLine({ status })).toBe(HOME_STATUS_LINES[status]);
      expect(HOME_STATUS_LINES[status]).not.toContain("\n");
    }
    expect(homeStatusLine(ready(new Date()))).toBeNull();
  });
});

describe("saved moments (state only)", () => {
  const moment: SavedMoment = { itemId: "user-abc123def456", yaw: -22.6, savedAtMs: 1 };

  it("saves a moment once per item, replacing the yaw, and toggles it away again", () => {
    let list = toggleSavedMoment([], moment);
    expect(list).toEqual([moment]);
    expect(isMomentSaved(list, moment.itemId)).toBe(true);
    list = toggleSavedMoment(list, { ...moment, yaw: 10, savedAtMs: 2 });
    expect(list).toEqual([]);
    list = toggleSavedMoment(list, moment);
    list = toggleSavedMoment(list, { itemId: "coach-x", yaw: 0, savedAtMs: 3 });
    expect(list.map((item) => item.itemId)).toEqual(["user-abc123def456", "coach-x"]);
    expect(isMomentSaved(list, "reference-cmu")).toBe(false);
  });
});
