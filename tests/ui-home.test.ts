import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const home = readFileSync("app/(tabs)/index.tsx", "utf8");
const hook = readFileSync("hooks/use-latest-representative-profile.ts", "utf8");
const coachHook = readFileSync("hooks/use-home-coach-reel.ts", "utf8");
const homeFeed = readFileSync("lib/feed/home-feed.ts", "utf8");
const homeCoach = readFileSync("lib/feed/home-coach.ts", "utf8");
const adapter = readFileSync("lib/feed/coach-reel-adapter.ts", "utf8");
const chrome = readFileSync("components/feed/reel-chrome.tsx", "utf8");

describe("home as a vertical reel feed", () => {
  it("is one vertical feed of reels: my latest profile, the coaching moment, the anonymous reference, nothing named", () => {
    expect(home).toContain("<ReelFeed");
    expect(home).toContain("useLatestRepresentativeProfile(user, authLoading)");
    expect(home).toContain("useHomeCoachReel(");
    expect(home).toContain("buildHomeFeed(");
    expect(home).toContain("ANONYMOUS_POSE_REFERENCES");
    expect(home).not.toMatch(/Curry|Paul George|PLAYER_/);
    expect(home).not.toContain('"/motion"');
    expect(home).not.toMatch(/ScrollView|FeedCard|StoryStrip|components\/home\//);
    expect(existsSync("components/home/feed-card.tsx")).toBe(false);
    expect(existsSync("components/home/story-strip.tsx")).toBe(false);
  });

  it("keeps the default reel free of analysis and the text budget to one line", () => {
    expect(home).not.toMatch(/getPracticeFocus|focus\.detail|ANONYMOUS_POSE_LIBRARY_STATUS|kicker|eyebrow|TODAY|NEXT UP|sectionTitle/);
    expect(home).not.toMatch(/AnalysisSummaryLine|AnalysisDetails|AnalysisEvidence|jointConeSummary|directionalConeDegrees/);
    expect(home).not.toMatch(/coaching_comment|primary_visual_cue|observation_summary|hypotheses/);
    expect(chrome).toContain("numberOfLines={1}");
    expect(homeFeed).not.toMatch(/팔로워|좋아요|follower|\d+\s*likes?\b/i);
  });

  it("answers what I can do now with one capture action in the top bar", () => {
    expect(home).toContain('router.push("/private-capture" as never)');
    expect(home).toContain('accessibilityLabel="슛폼 촬영"');
    expect(home).toContain("<TopBar");
  });

  it("shows honest recency and confidence as form, never fake engagement", () => {
    expect(homeFeed).toContain("relativeDayLabel(latest.summary.createdAt.toDate())");
    expect(homeFeed).toContain("representativeConfidence(latest.record.profile)");
    expect(homeFeed).toContain("실측 3D 아님");
  });

  it("builds coaching moments only from the frozen feed event and skips them when the coach is unavailable", () => {
    expect(coachHook).toContain("homeCoachReel(");
    expect(coachHook).toContain("controller.abort()");
    // Public reels and persisted saves enter through their own boundaries; Home reads no private profile of others.
    expect(home).toContain("useHomePublicReels(");
    expect(home).toContain("syncSavedMoment(");
    expect(home).toContain("syncUnsavedMoment(");
    expect(home).not.toMatch(/getDocsFromServer|firebase\/firestore|firebase\/storage|decodeMotionPacketV1/);
    expect(homeCoach).toContain("buildCoachFeedEvent(");
    expect(homeCoach).toContain("buildCoachRequest(");
    expect(adapter).toContain("if (!event.eligibility.eligible");
    expect(homeFeed).toContain("insertCoachReel(");
  });

  it("keeps the harness as a regression surface and does not bypass the device gates", () => {
    expect(existsSync("app/dev/reel-lab.tsx")).toBe(true);
    expect(home).not.toMatch(/EXPO_PUBLIC_FORMPATH_REAL_VIDEO_EVAL|realVideoEvaluation/);
  });

  it("loads the latest profile with the profile route's owner rules", () => {
    expect(hook).toContain("if (!FORMPATH_FLAGS.profileV2) return;");
    const resume = hook.indexOf("await resumePendingShootingProfileDeletionsV2(owner)");
    const list = hook.indexOf("await listShootingProfilesV2(owner)");
    expect(resume).toBeGreaterThan(-1);
    expect(list).toBeGreaterThan(resume);
    expect(hook).toContain("ownerGenerationMatches(currentOwnerUidRef.current, ownerUid, generationRef.current, generation)");
    expect(hook).toContain("isOpaqueShootingProfileIdV2(summary.id)");
    expect(hook).toContain("valueForExactOwner(user.uid, envelope)");
    expect(hook).not.toMatch(/saveShootingProfileV2|deleteShootingProfileV2|console\./);
  });
});
