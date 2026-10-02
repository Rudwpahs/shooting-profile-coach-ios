import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Liquid + Glass screen rollout", () => {
  it("uses Liquid on Home controls while leaving motion preview stages as stable Pressables", () => {
    const stories = read("components/home/story-strip.tsx");
    const card = read("components/home/feed-card.tsx");
    const feed = read("components/home/home-feed.tsx");
    expect(stories).toContain("<LiquidPressable");
    expect(card).toContain("<LiquidPressable");
    expect(feed).toContain("<Pressable");
    expect(feed).not.toContain("<LiquidPressable");
  });

  it("uses Liquid for Profile tiles without weakening busy, disabled, focus or long-press semantics", () => {
    const grid = read("components/profile/motion-grid.tsx");
    expect(grid).toContain("<LiquidPressable");
    expect(grid).toContain("accessibilityState={{ disabled, busy: deleting }}");
    expect(grid).toContain("aria-disabled={disabled}");
    expect(grid).toContain("onLongPress=");
    expect(grid).toContain("focusRing(focusedControl === focusKey)");
    expect(grid).toContain("deleting && styles.deleting");
  });

  it("keeps keyboard focus halos visible outside the glass TopBar clipping boundary", () => {
    const top = read("components/ui/top-bar.tsx");
    const profile = read("app/(tabs)/profile.tsx");
    const analysis = read("app/private-analysis/[id].tsx");
    const capture = read("components/shooting-profile/capture-session.tsx");

    expect(profile).toContain("outlineOffset: 2");
    expect(analysis).toContain("getRepresentativeFocusStyle");
    expect(capture).toContain("outlineOffset: 2");
    expect(top).toContain('overflow: "visible"');
  });

  it("glassifies shared TopBar and Dock chrome while their controls keep Liquid semantics", () => {
    const top = read("components/ui/top-bar.tsx");
    const dock = read("components/hoophub-tab-bar.tsx");
    const profile = read("app/(tabs)/profile.tsx");
    const analysis = read("app/private-analysis/[id].tsx");
    expect(top).toContain('<GlassSurface variant="bar"');
    expect(top).toContain('accessibilityRole="header"');
    expect(dock).toContain('<GlassSurface variant="bar"');
    expect(dock).toContain("<LiquidPressable");
    expect(profile).toContain("<LiquidPressable");
    expect(analysis).toContain("<LiquidPressable");
  });

  it("keeps Explore motion tiles stable while making only selector chrome liquid/glass", () => {
    const explore = read("app/(tabs)/explore.tsx");
    expect(explore).toContain('<GlassSurface variant="panel"');
    expect(explore).toContain("<LiquidPressable");
    expect(explore).toContain("<Pressable");
    expect(explore).toContain("<SkeletonGlyph");
  });

  it("keeps Reel media, caption and progress outside Liquid glass controls", () => {
    const overlay = read("components/reels/reel-overlay.tsx");
    const item = read("components/reels/reel-item.tsx");
    expect(overlay).toContain('<GlassSurface');
    expect(overlay).toContain("<LiquidPressable");
    expect(overlay).toContain("<ReelProgress");
    expect(overlay).toContain("style={styles.caption}");
    expect(item).toContain("<Pressable");
    expect(item).toContain('accessibilityRole="adjustable"');
    expect(item).not.toContain("<LiquidPressable");
  });

  it("keeps spring ownership centralized in the Liquid primitive", () => {
    for (const path of [
      "components/home/story-strip.tsx",
      "components/home/feed-card.tsx",
      "components/profile/motion-grid.tsx",
      "app/(tabs)/profile.tsx",
      "app/(tabs)/explore.tsx",
      "app/private-analysis/[id].tsx",
      "components/reels/reel-overlay.tsx",
      "components/shooting-profile/capture-session.tsx",
    ]) {
      expect(read(path), path).not.toMatch(/withSpring|withTiming|useSharedValue/);
    }
  });
});
