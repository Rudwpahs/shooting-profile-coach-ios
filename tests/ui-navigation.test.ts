import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const layout = readFileSync("app/(tabs)/_layout.tsx", "utf8");
const tabBar = readFileSync("components/hoophub-tab-bar.tsx", "utf8");
const explore = readFileSync("app/(tabs)/explore.tsx", "utf8");

describe("bottom navigation", () => {
  it("shows 홈 · 탐색 · 프로필 as tabs and keeps the other routes reachable but hidden", () => {
    for (const name of ["index", "explore", "profile"]) {
      expect(layout).toMatch(new RegExp(`name="${name}" options=\\{\\{ title: "[^"]+" \\}\\}`));
    }
    for (const name of ["motion", "assessment", "library", "settings"]) {
      expect(layout).toMatch(new RegExp(`name="${name}" options=\\{\\{ href: null \\}\\}`));
      expect(existsSync(`app/(tabs)/${name}.tsx`)).toBe(true);
    }
    expect(layout).toContain("HoopHubTabBar");
    expect(layout).toContain("ProfileProvider");
    expect(existsSync("components/liquid-tab-bar.tsx")).toBe(false);
  });

  it("is icon-only with labels reserved for assistive technology, plus a central capture action", () => {
    expect(tabBar).not.toMatch(/<Text\b/);
    expect(tabBar.match(/accessibilityRole="tab"/g)).toHaveLength(1);
    expect(tabBar).toContain('accessibilityState={{ selected }}');
    expect(tabBar).toContain("accessibilityLabel={tab.label}");
    expect(tabBar).toContain('accessibilityRole="button"');
    expect(tabBar).toContain('CAPTURE_ACTION_LABEL = "슛폼 촬영"');
    expect(tabBar).toContain('router.push("/private-capture")');
    expect(tabBar).toContain("HOOPHUB_TABS[0]");
    expect(tabBar).toContain("HOOPHUB_TABS[1]");
    expect(tabBar).toContain("HOOPHUB_TABS[2]");
  });

  it("sits inside the safe area as a static bar, without spring or timing animation", () => {
    expect(tabBar).toContain("useSafeAreaInsets");
    expect(tabBar).toContain("Math.max(insets.bottom, 10)");
    expect(tabBar).not.toContain("withSpring");
    expect(tabBar).not.toContain("withTiming");
    expect(tabBar).not.toContain('position: "absolute"');
    expect(tabBar).toContain("minHeight: 48");
    expect(tabBar).toContain("minWidth: 48");
  });

  it("no longer pads screens for a floating dock", () => {
    for (const screen of ["index", "motion", "profile", "library", "explore"]) {
      expect(readFileSync(`app/(tabs)/${screen}.tsx`, "utf8")).not.toContain("paddingBottom: 116");
    }
  });
});

describe("explore tab", () => {
  it("browses the explore source, whose production content is the anonymous reference only, never named-player analyses", () => {
    const exploreSource = readFileSync("lib/explore-source.ts", "utf8");
    expect(explore).toContain('from "@/lib/explore-source"');
    expect(explore).toContain("exploreMotions()");
    expect(exploreSource).toContain("ANONYMOUS_POSE_REFERENCES");
    for (const source of [explore, exploreSource]) {
      expect(source).not.toMatch(/PLAYER_MONOCULAR_3D_ANALYSES|PLAYER_SOURCE_SKELETON_REVIEWS|PLAYER_VIDEO_REVIEW_RECORDS/);
      expect(source).not.toMatch(/Curry|Paul George/);
    }
    expect(exploreSource).toContain("CMU optical mocap");
  });

  it("is one form per screen: the Reels feed inside the tab, with a heading instead of a close affordance and no chip row", () => {
    expect(explore).toContain("<ReelsFeed");
    expect(explore).toContain("onClose={null}");
    expect(explore).toContain('heading="탐색"');
    expect(explore).not.toMatch(/viewChips|정면|사선|측면|<ScrollView|<FlatList|TopBar/);
    // The feed takes the tab scene's own measured size; the tab bar stays below it.
    expect(explore).toContain("onLayout=");
    expect(explore).toContain("height={height}");
    expect(explore).toContain("useTabSceneSize()");
    expect(explore).toContain("useSafeAreaInsets()");
    expect(explore).toContain("useIsFocused()");
  });

  it("builds reels progressively and opens the minimal analysis surface", () => {
    expect(explore).toContain("useExploreFeed(");
    expect(explore).toContain("onActiveIndex(state.activeIndex)");
    expect(explore).toContain("analysisHref(profileId,");
    const feed = readFileSync("lib/explore-feed.ts", "utf8");
    expect(feed).toMatch(/EXPLORE_FEED_AHEAD = [1-3];/);
    expect(feed).not.toMatch(/from "react-native"|from "react"/);
    // Instagram density: no eyebrow/kicker lines or paragraphs of explanation.
    expect(explore).not.toMatch(/kicker|eyebrow|lead:|detail:/);
  });
});
