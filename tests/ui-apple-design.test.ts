import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { typography } from "@/constants/typography";

const read = (path: string) => readFileSync(path, "utf8");
const REDESIGNED = [
  "app/(tabs)/index.tsx",
  "app/(tabs)/explore.tsx",
  "app/(tabs)/profile.tsx",
  "app/private-analysis/[id].tsx",
  "components/hoophub-tab-bar.tsx",
  "components/ui/top-bar.tsx",
  "components/home/feed-card.tsx",
  "components/home/story-strip.tsx",
  "components/profile/profile-hero.tsx",
  "components/profile/profile-stats.tsx",
  "components/profile/motion-grid.tsx",
  "components/analysis/analysis-layers.tsx",
  "components/skeleton/loop-stage.tsx",
  "components/shooting-profile/sequence-viewer.tsx",
];

/**
 * The parts of Apple's design guidance (Designing Fluid Interfaces, The
 * Details of UI Typography, Principles of Great Design) that this app can
 * honour in React Native, pinned so they survive later edits.
 */
describe("apple design foundations", () => {
  it("uses the platform system font on every redesigned surface, with hierarchy from weight and size", () => {
    for (const file of REDESIGNED) {
      expect(read(file), file).not.toMatch(/fontFamily: "Barlow/);
    }
    expect(typography.wordmark.fontWeight).toBe("800");
    expect(typography.title.fontWeight).toBe("600");
    expect(typography.body.fontWeight).toBe("400");
  });

  it("tightens tracking as text grows and never goes negative on small labels", () => {
    expect(typography.wordmark.letterSpacing).toBeLessThan(typography.title.letterSpacing);
    expect(typography.title.letterSpacing).toBeLessThan(0);
    expect(typography.body.letterSpacing).toBe(0);
    expect(typography.label.letterSpacing).toBeGreaterThan(0);
    // Leading tracks size inversely: relative line height is tighter on large text.
    expect(typography.wordmark.lineHeight / typography.wordmark.fontSize).toBeLessThan(typography.caption.lineHeight / typography.caption.fontSize);
    expect(typography.stat.fontVariant).toEqual(["tabular-nums"]);
  });

  it("gives every screen one 44-point bar that answers where am I and how do I get out", () => {
    const topBar = read("components/ui/top-bar.tsx");
    expect(topBar).toContain("TOP_BAR_HEIGHT = 44");
    expect(topBar).toContain('accessibilityRole="header"');
    for (const screen of ["app/(tabs)/index.tsx", "app/(tabs)/explore.tsx", "app/(tabs)/profile.tsx", "app/private-analysis/[id].tsx", "components/shooting-profile/capture-session.tsx"]) {
      expect(read(screen), screen).toContain("<TopBar");
    }
    expect(read("app/private-analysis/[id].tsx")).toContain('name="chevron-left"');
    expect(read("components/shooting-profile/capture-session.tsx")).not.toContain("FORMPATH / PRIVATE CAPTURE");
  });

  it("keeps the bottom bar flat: same-weight icons, no capsule, no accent blob, feedback on touch-down", () => {
    const bar = read("components/hoophub-tab-bar.tsx");
    expect(bar).toContain('name="plus-box-outline"');
    expect(bar).not.toMatch(/capture: \{|borderRadius: 22, height: 44|withTiming|withSpring/);
    expect(bar).toContain("pressed && styles.pressed");
    expect(bar).toContain("ICON_SIZE = 26");
  });

  it("makes every loop behave like a post: tap the stage to pause, the whole stage is the target", () => {
    const loopStage = read("components/skeleton/loop-stage.tsx");
    expect(loopStage).toContain("setPaused((value) => !value)");
    expect(loopStage).toContain('position: "absolute"');
    for (const file of ["app/(tabs)/index.tsx", "components/profile/profile-hero.tsx"]) {
      expect(read(file), file).toContain("<LoopStage");
      expect(read(file), file).toContain("paused={paused}");
    }
    for (const loop of ["components/skeleton/skeleton-loop.tsx", "components/skeleton/pose-motion-loop.tsx"]) {
      const source = read(loop);
      expect(source).toContain("paused?: boolean;");
      // Mounting never forces play; only the viewer's own change of intent does.
      expect(source).toContain("if (pausedRef.current === paused) return;");
    }
  });

  it("responds on touch-down everywhere a finger can land", () => {
    for (const file of REDESIGNED) {
      const source = read(file);
      if (!source.includes("<Pressable")) continue;
      expect(source, file).toMatch(/pressed && (?:!\w+ && )?styles\.(pressed|stagePressed)/);
    }
  });
});
