import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const layout = readFileSync("app/(tabs)/_layout.tsx", "utf8");
const tabBar = readFileSync("components/hoophub-tab-bar.tsx", "utf8");
const explore = readFileSync("app/(tabs)/explore.tsx", "utf8");

function expectEveryPressableToBeAccessible(source: string) {
  const pressables = source.match(/<Pressable\b/g)?.length ?? 0;
  expect(pressables).toBeGreaterThan(0);
  expect(source.match(/accessibilityRole=/g)?.length ?? 0).toBeGreaterThanOrEqual(pressables);
  expect(source.match(/accessibilityLabel=/g)?.length ?? 0).toBeGreaterThanOrEqual(pressables);
}

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
  it("builds its grid from the anonymous reference only, never from named-player analyses", () => {
    expect(explore).toContain("ANONYMOUS_POSE_REFERENCES");
    expect(explore).not.toMatch(/PLAYER_MONOCULAR_3D_ANALYSES|PLAYER_SOURCE_SKELETON_REVIEWS|PLAYER_VIDEO_REVIEW_RECORDS/);
    expect(explore).not.toMatch(/Curry|Paul George/);
    expect(explore).toContain("SkeletonGlyph");
    expect(explore).toContain("poseMotionGlyph");
  });

  it("measures its own width and never lays out a negative tile", () => {
    expect(explore).toContain("onLayout=");
    expect(explore).toContain("Math.max(1, Math.floor((contentWidth - GAP * 2) / 3))");
    expect(explore).toContain("FALLBACK_WIDTH");
  });

  it("keeps every tile and chip accessible and labels the source in one line", () => {
    expectEveryPressableToBeAccessible(explore);
    expect(explore).toContain("accessibilityState={{ selected }}");
    expect(explore).toContain("CMU optical mocap");
    // Instagram density: no eyebrow/kicker lines or paragraphs of explanation.
    expect(explore).not.toMatch(/kicker|eyebrow|lead:|detail:/);
  });
});
