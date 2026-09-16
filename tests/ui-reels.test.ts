import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const route = read("app/reels.tsx");
const rootLayout = read("app/_layout.tsx");
const homeFeed = read("components/home/home-feed.tsx");
const homeRoute = read("app/(tabs)/index.tsx");
const feed = read("components/reels/reels-feed.tsx");
const item = read("components/reels/reel-item.tsx");
const player = read("components/reels/reel-motion-player.tsx");
const overlay = read("components/reels/reel-overlay.tsx");
const progress = read("components/reels/reel-progress.tsx");
const playback = read("lib/reels/reel-playback.ts");
const reduceMotion = read("hooks/use-reduce-motion.ts");
const appState = read("hooks/use-app-state.ts");
const reels = [feed, item, player, overlay, progress].join("\n");

describe("reels route", () => {
  it("is a full-screen stack route outside the tabs: no tab bar, no top bar, safe areas kept", () => {
    expect(existsSync("app/reels.tsx")).toBe(true);
    expect(existsSync("app/(tabs)/reels.tsx")).toBe(false);
    expect(rootLayout).toContain('<Stack.Screen name="reels"');
    expect(route).not.toMatch(/<Tabs|HoopHubTabBar|<TopBar|headerShown: true/);
    expect(route).toContain("useSafeAreaInsets()");
    expect(route).toContain("useWindowDimensions()");
  });

  it("opens on the item Home handed over, falls back to Home's own item list, and returns with back", () => {
    expect(route).toContain("takeReelHandoff()");
    expect(route).toContain("homeReelItems(");
    expect(route).toContain("initialReelIndex(");
    expect(route).toContain("router.back()");
    expect(route).toContain('router.replace("/"');
  });

  it("pauses while another screen covers it and restores the same Reel on return", () => {
    expect(route).toContain("useFocusEffect(");
    expect(route).toContain("focused={focused}");
    expect(route).toContain("useAppStateStatus()");
    expect(route).toContain("useReduceMotion()");
    expect(route).toContain("/private-analysis/");
    // The feed keeps its index and each item its frame while unfocused: the route never remounts the feed on focus.
    expect(route).not.toMatch(/key=\{[^}]*focused/);
  });

  it("enters with a stable scale and fade, skipped under Reduce Motion", () => {
    expect(rootLayout).toContain('animation: "fade"');
    expect(route).toContain("Animated.timing(");
    expect(route).toMatch(/reducedMotion\)\s*\{\s*enter\.setValue\(1\)/);
  });
});

describe("home entry", () => {
  it("opens Reels from the previews at the tapped item, with no detail screen and no fullscreen button", () => {
    expect(homeFeed).toContain("onOpenReel(");
    expect(homeFeed).toContain("릴 열기");
    expect(homeFeed).not.toContain("<LoopStage");
    // No control is labelled as a fullscreen/expand entry: the preview itself is the entry.
    expect(homeFeed).not.toMatch(/accessibilityLabel="[^"]*(전체화면|fullscreen|확대)/i);
    expect(homeRoute).toContain("setReelHandoff(");
    expect(homeRoute).toContain("homeReelItems(");
    expect(homeRoute).toContain("`/reels?start=${encodeURIComponent(reelId)}`");
  });
});

describe("reels chrome contract", () => {
  it("shows a play indicator only while paused and never a persistent giant play button", () => {
    const conditional = overlay.indexOf("{paused ? (");
    expect(conditional).toBeGreaterThan(-1);
    expect(overlay.indexOf('testID="reel-pause-indicator"')).toBeGreaterThan(conditional);
    expect(overlay.indexOf('name="play"')).toBeGreaterThan(conditional);
    expect(overlay).not.toMatch(/name="pause"/);
    expect(progress).toContain("REEL_PROGRESS_HEIGHT = 2");
  });

  it("fakes nothing social", () => {
    expect(reels).not.toMatch(/좋아요|댓글|팔로우|팔로워|공유하기|follower|likes|comments|shares|\bDM\b|bookmark/i);
    expect(overlay).not.toMatch(/name="(heart|comment|share|send|account-plus)/);
  });

  it("keeps the analysis viewer separate and reuses the projection helpers instead of copying the maths", () => {
    expect(reels).not.toContain("<SequenceViewer");
    expect(reels).not.toContain("import { SequenceViewer");
    expect(player).toContain("representativeGlyph(");
    expect(player).toContain("poseMotionGlyph(");
    expect(playback).toContain("advanceRepresentativeFrameIndex(");
    expect(playback).toContain("resolveRepresentativePlayback(");
    expect(reels).not.toMatch(/projectPosePoint|Math\.cos\(|Math\.sin\(/);
  });

  it("subscribes once per screen to app state and Reduce Motion, outside the viewer", () => {
    expect(reduceMotion).toContain('addEventListener("reduceMotionChanged"');
    expect(appState).toContain('addEventListener("change"');
    expect(reels).not.toMatch(/AccessibilityInfo\.|AppState\./);
    expect(feed).toContain("focused={focused}");
  });

  it("gives every control a label, a role and a 44-point target, and reads the Reel as one adjustable element", () => {
    for (const source of [overlay, item]) {
      const pressables = source.match(/<Pressable\b/g)?.length ?? 0;
      expect(pressables).toBeGreaterThan(0);
      expect(source.match(/accessibilityRole=/g)?.length ?? 0).toBeGreaterThanOrEqual(pressables);
      expect(source.match(/accessibilityLabel=/g)?.length ?? 0).toBeGreaterThanOrEqual(pressables);
    }
    expect(overlay).toContain("CONTROL = 44");
    expect(item).toContain('accessibilityRole="adjustable"');
    expect(item).toContain('{ name: "increment", label: "다음 릴" }');
    expect(item).toContain('{ name: "decrement", label: "이전 릴" }');
    expect(item).toContain('importantForAccessibility={active ? "auto" : "no-hide-descendants"}');
  });
});
