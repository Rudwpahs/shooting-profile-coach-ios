import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tells React 19 this is a test environment so act() does not warn on every update.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native-svg", () => ({
  default: ({ children, ...props }: { children?: React.ReactNode; width?: number; height?: number }) => <svg data-testid="skeleton-svg" width={props.width} height={props.height}>{children}</svg>,
  Circle: () => <circle />,
  Line: () => <line />,
}));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({
  default: ({ name }: { name: string }) => <span data-icon={name} />,
}));
// The projection helpers sit beside the analysis viewer, which imports haptics; jsdom has no native runtime for it.
vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(async () => undefined),
  impactAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy", Rigid: "rigid", Soft: "soft" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

const { ReelsFeed } = await import("@/components/reels/reels-feed");
const { ReelItem } = await import("@/components/reels/reel-item");
const { anonymousReferenceReel, syntheticProfileReel } = await import("@/tests/fixtures/reel-fixtures");

const WIDTH = 375;
const HEIGHT = 700;
const INSETS = { top: 47, bottom: 34 };
const items = [syntheticProfileReel("demo-profile-1"), anonymousReferenceReel(), syntheticProfileReel("demo-profile-2", new Date(2026, 8, 10))];
const noop = () => {};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const byTestId = (id: string) => Array.from(container.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];
const tap = () => byTestId("reel-tap").find((node) => node.getAttribute("aria-disabled") !== "true") as HTMLElement;
const label = () => tap().getAttribute("aria-label") ?? "";

// The feed reads its start index once, at mount, like the route does.
const remount = async () => {
  await act(async () => root.unmount());
  root = createRoot(container);
};

type FeedProps = Partial<React.ComponentProps<typeof ReelsFeed>>;

const render = (props: FeedProps = {}) => act(async () => {
  root.render(
    <ReelsFeed
      appState="active"
      focused
      height={HEIGHT}
      initialIndex={0}
      insets={INSETS}
      items={items}
      onClose={noop}
      onOpenAnalysis={noop}
      reducedMotion={false}
      width={WIDTH}
      {...props}
    />,
  );
});

describe("reels feed", () => {
  it("mounts exactly one active, playing stage sized to the viewport, with a progress line and no giant play button", async () => {
    await render();
    expect(byTestId("reels-feed")).toHaveLength(1);
    expect(byTestId("reel-stage-active")).toHaveLength(1);
    const first = byTestId("reel-item-profile")[0];
    expect(first.style.height).toBe(`${HEIGHT}px`);
    expect(first.style.width).toBe(`${WIDTH}px`);
    expect(label()).toContain("내 슛폼 릴, 1/3, 재생 중");
    expect(tap().getAttribute("aria-valuetext")).toBe("1 / 3");
    expect(byTestId("reel-pause-indicator")).toHaveLength(0);
    expect(byTestId("reel-progress").length).toBeGreaterThanOrEqual(1);
  });

  it("one tap pauses with a small play indicator, the next tap resumes", async () => {
    await render();
    await act(async () => { tap().click(); });
    expect(label()).toContain("일시정지됨");
    expect(byTestId("reel-pause-indicator")).toHaveLength(1);
    await act(async () => { tap().click(); });
    expect(label()).toContain("재생 중");
    expect(byTestId("reel-pause-indicator")).toHaveLength(0);
  });

  it("advances the progress line while playing and holds it while paused", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    await render();
    const fill = () => parseFloat(byTestId("reel-progress-fill")[0].style.width);
    const start = fill();
    await act(async () => { vi.advanceTimersByTime(400); });
    const played = fill();
    expect(played).not.toBe(start);
    await act(async () => { tap().click(); });
    const paused = fill();
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(fill()).toBe(paused);
    await act(async () => { tap().click(); });
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(fill()).not.toBe(paused);
  });

  it("starts on the item Home selected and offers analysis only for a saved profile", async () => {
    const onOpenAnalysis = vi.fn();
    await render({ initialIndex: 1, onOpenAnalysis });
    expect(label()).toContain("참조 릴");
    expect(byTestId("reel-analysis")).toHaveLength(0);
    await remount();
    await render({ initialIndex: 0, onOpenAnalysis });
    expect(byTestId("reel-analysis").length).toBeGreaterThanOrEqual(1);
    await act(async () => { byTestId("reel-analysis")[0].click(); });
    expect(onOpenAnalysis).toHaveBeenCalledWith("demo-profile-1");
  });

  it("switches the virtual view from a small chip row that never looks like a player control", async () => {
    await render();
    const chip = (id: string) => byTestId(`reel-view-${id}`)[0];
    expect(chip("oblique").getAttribute("aria-selected")).toBe("true");
    expect(chip("front").getAttribute("aria-selected")).toBe("false");
    await act(async () => { chip("front").click(); });
    expect(chip("front").getAttribute("aria-selected")).toBe("true");
    expect(chip("oblique").getAttribute("aria-selected")).toBe("false");
    for (const id of ["front", "oblique", "side"]) expect(chip(id).textContent).toMatch(/^(정면|사선|측면)$/);
  });

  it("closes from the top affordance", async () => {
    const onClose = vi.fn();
    await render({ onClose });
    await act(async () => { byTestId("reel-close")[0].click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("never forces autoplay under Reduce Motion, but a tap plays", async () => {
    await render({ reducedMotion: true });
    expect(label()).toContain("일시정지됨");
    expect(byTestId("reel-pause-indicator")).toHaveLength(1);
    await act(async () => { tap().click(); });
    expect(label()).toContain("재생 중");
    // Until the system setting resolves, a fresh Reel does not autoplay either.
    await remount();
    await render({ reducedMotion: null });
    expect(label()).toContain("일시정지됨");
  });

  it("stops in the background and while another screen covers Reels, without changing the viewer's intent", async () => {
    await render({ appState: "background" });
    expect(label()).toContain("일시정지됨");
    await render({ appState: "active", focused: false });
    expect(label()).toContain("일시정지됨");
    await render({ appState: "active", focused: true });
    expect(label()).toContain("재생 중");
  });

  it("fakes nothing social: no likes, comments, shares, follows or counts anywhere in the chrome", async () => {
    await render();
    const icons = Array.from(container.querySelectorAll("[data-icon]")).map((node) => node.getAttribute("data-icon") ?? "");
    expect(icons.join(" ")).not.toMatch(/heart|comment|share|send|account-plus|bookmark/);
    expect(container.textContent ?? "").not.toMatch(/좋아요|댓글|팔로우|공유|저장됨|\d+\s*(likes?|views?)/i);
    const overlay = byTestId("reel-overlay")[0];
    expect(overlay.textContent ?? "").not.toMatch(/[0-9]+%/);
  });
});

describe("reel item roles", () => {
  const renderRole = (role: "active" | "adjacent" | "idle") => act(async () => {
    root.render(
      <ReelItem
        appState="active"
        count={3}
        focused
        height={HEIGHT}
        index={1}
        insets={INSETS}
        item={items[1]}
        onClose={noop}
        onNext={noop}
        onOpenAnalysis={noop}
        onPrevious={noop}
        onTogglePlayback={noop}
        onViewChange={noop}
        playback="auto"
        reducedMotion={false}
        role={role}
        view="oblique"
        width={WIDTH}
      />,
    );
  });

  it("a neighbour holds one still and the rest hold nothing; neither is exposed to VoiceOver", async () => {
    await renderRole("adjacent");
    expect(byTestId("reel-stage-still")).toHaveLength(1);
    expect(byTestId("reel-stage-active")).toHaveLength(0);
    expect(byTestId("skeleton-svg")).toHaveLength(1);
    const surface = byTestId("reel-tap")[0];
    expect(surface.getAttribute("aria-label")).toContain("대기");
    expect(surface.getAttribute("aria-disabled")).toBe("true");
    await renderRole("idle");
    expect(byTestId("reel-stage-idle")).toHaveLength(1);
    expect(byTestId("skeleton-svg")).toHaveLength(0);
    expect(byTestId("reel-overlay")).toHaveLength(0);
  });
});
