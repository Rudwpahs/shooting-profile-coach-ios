import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native-svg", () => ({
  default: ({ children, ...props }: { children?: React.ReactNode; width?: number; height?: number }) => <svg data-testid="skeleton-svg" width={props.width} height={props.height}>{children}</svg>,
  Circle: () => <circle />,
  Line: () => <line />,
}));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({
  default: ({ name }: { name: string }) => <span data-icon={name} />,
}));
// The sequence viewer (whose lifecycle the loops share) imports haptics, which needs a native runtime.
vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(async () => undefined),
  impactAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy", Rigid: "rigid", Soft: "soft" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

const { ReelFeed } = await import("@/components/feed/reel-feed");
const { ReelItem } = await import("@/components/feed/reel-item");
const { REEL_CHROME_BOTTOM_HEIGHT, REEL_RAIL_WIDTH } = await import("@/components/feed/reel-chrome");
const { reelLabFixtures } = await import("@/lib/feed/reel-fixtures");

// Tells React 19 this is a test environment so act() does not warn on every update.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WIDTH = 375;
const HEIGHT = 700;
const items = reelLabFixtures();
const noActions = () => [];

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
});

const byTestId = (id: string) => Array.from(container.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];
const tap = () => container.querySelector('[data-testid="reel-tap"]') as HTMLElement;

describe("reel feed", () => {
  it("renders one full-height item with exactly one active, playing stage", async () => {
    await act(async () => {
      root.render(<ReelFeed actionsFor={noActions} height={HEIGHT} items={items} reducedMotion width={WIDTH} />);
    });
    expect(byTestId("reel-feed")).toHaveLength(1);
    expect(byTestId("reel-stage-active")).toHaveLength(1);
    const first = byTestId("reel-item-user")[0];
    expect(first.style.height).toBe(`${HEIGHT}px`);
    expect(first.style.width).toBe(`${WIDTH}px`);
    const label = tap().getAttribute("aria-label") ?? "";
    expect(label).toContain("내 슛폼 릴, 1/3, 재생 중");
    expect(tap().getAttribute("aria-valuetext")).toBe("1 / 3");
    expect(byTestId("reel-pause-mark")).toHaveLength(0);
  });

  it("tap pauses and resumes the active item and shows a small pause mark outside the centre", async () => {
    await act(async () => {
      root.render(<ReelFeed actionsFor={noActions} height={HEIGHT} items={items} reducedMotion width={WIDTH} />);
    });
    await act(async () => { tap().click(); });
    expect(tap().getAttribute("aria-label")).toContain("일시정지됨");
    expect(byTestId("reel-pause-mark")).toHaveLength(1);
    await act(async () => { tap().click(); });
    expect(tap().getAttribute("aria-label")).toContain("재생 중");
    expect(byTestId("reel-pause-mark")).toHaveLength(0);
  });

  it("renders nothing until the viewport is measured", async () => {
    await act(async () => {
      root.render(<ReelFeed actionsFor={noActions} height={0} items={items} reducedMotion width={WIDTH} />);
    });
    expect(byTestId("reel-feed")).toHaveLength(0);
  });
});

describe("reel item roles", () => {
  const render = (role: "active" | "adjacent" | "idle", paused = false) => act(async () => {
    root.render(
      <ReelItem
        actions={[{ icon: "human", label: "내 슛폼 프로필 열기", onPress: () => {} }]}
        count={3}
        height={HEIGHT}
        index={1}
        item={items[1]}
        onNext={() => {}}
        onPrevious={() => {}}
        onTogglePlayback={() => {}}
        paused={paused}
        role={role}
        width={WIDTH}
      />,
    );
  });

  it("adjacent holds a still and idle holds nothing; neither is exposed to VoiceOver", async () => {
    await render("adjacent");
    expect(byTestId("reel-stage-still")).toHaveLength(1);
    expect(byTestId("reel-stage-active")).toHaveLength(0);
    expect(byTestId("skeleton-svg")).toHaveLength(1);
    expect(tap().getAttribute("aria-label")).toContain("대기");
    expect(tap().getAttribute("aria-disabled")).toBe("true");
    await render("idle");
    expect(byTestId("reel-stage-idle")).toHaveLength(1);
    expect(byTestId("skeleton-svg")).toHaveLength(0);
  });

  it("coach reel: dominant skeleton, one label, one message line, no dashboard", async () => {
    await render("active", true);
    expect(byTestId("reel-stage-active")).toHaveLength(1);
    const chrome = byTestId("reel-chrome")[0];
    const leaves = Array.from(chrome.querySelectorAll("*")).filter((node) => node.children.length === 0);
    const lines = leaves.map((node) => node.textContent?.trim() ?? "").filter((text) => text.length > 0);
    expect(lines).toEqual(["코치 · 릴리스 추정", items[1].kind === "coach" ? items[1].message : ""]);
    expect(chrome.textContent).not.toMatch(/[0-9%]/);
    expect(container.querySelector('[aria-label="내 슛폼 프로필 열기"]')).not.toBeNull();
    expect(byTestId("reel-pause-mark")).toHaveLength(1);
  });

  it("keeps the chrome off the athlete: the stage ends above the caption band and the rail hugs the trailing edge", async () => {
    await render("active");
    const stage = byTestId("reel-stage-active")[0];
    expect(stage.style.height).toBe(`${HEIGHT - REEL_CHROME_BOTTOM_HEIGHT}px`);
    expect(REEL_CHROME_BOTTOM_HEIGHT).toBeGreaterThanOrEqual(88);
    expect(REEL_RAIL_WIDTH).toBeLessThanOrEqual(56);
    expect(tap().style.height).toBe(`${HEIGHT - REEL_CHROME_BOTTOM_HEIGHT}px`);
  });
});
