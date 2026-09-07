import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const home = readFileSync("app/(tabs)/index.tsx", "utf8");
const hook = readFileSync("hooks/use-latest-representative-profile.ts", "utf8");
const feedCard = readFileSync("components/home/feed-card.tsx", "utf8");
const stories = readFileSync("components/home/story-strip.tsx", "utf8");

describe("home around the motion loop", () => {
  it("is built from skeleton loops: my latest profile, the anonymous reference, nothing named", () => {
    expect(home).toContain("<SkeletonLoop");
    expect(home).toContain("<PoseMotionLoop");
    expect(home).toContain("useLatestRepresentativeProfile(user, authLoading)");
    expect(home).toContain("ANONYMOUS_POSE_REFERENCES");
    expect(home).not.toMatch(/Curry|Paul George|PLAYER_/);
    expect(home).not.toContain('"/motion"');
  });

  it("keeps the text budget: one caption line per card, no kickers, no KPI rows, no paragraphs", () => {
    expect(home).not.toMatch(/kicker|eyebrow|TODAY|NEXT UP|VERIFIED REFERENCE|sectionTitle/);
    expect(home).not.toContain("focus.detail");
    expect(home).not.toContain("ANONYMOUS_POSE_LIBRARY_STATUS");
    expect(feedCard).toContain("numberOfLines={1}");
    expect(feedCard).not.toMatch(/<Text[^>]*>\s*\{[^}]*detail/);
  });

  it("answers what I can do now with the capture story and action", () => {
    expect(home).toContain('kind: "capture"');
    expect(home).toContain('router.push("/private-capture" as never)');
    expect(stories).toContain('accessibilityRole="button"');
    expect(stories).toContain("accessibilityLabel={item.accessibilityLabel}");
  });

  it("shows honest recency and confidence as form, never fake engagement", () => {
    expect(home).toContain("relativeDayLabel(latest.summary.createdAt.toDate())");
    expect(home).toContain("representativeConfidence(latest.record.profile)");
    expect(home).not.toMatch(/팔로워|좋아요|follower|\d+\s*likes?\b/i);
    expect(feedCard).toContain("신뢰도 밴드");
  });

  it("labels every action for assistive technology", () => {
    expect(feedCard).toContain("accessibilityLabel={action.label}");
    expect(feedCard).toContain('accessibilityRole="button"');
    expect(feedCard).toContain("minHeight: 44");
    expect(feedCard).toContain("minWidth: 44");
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
