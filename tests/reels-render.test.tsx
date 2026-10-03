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

// Film media decodes a local clip through WebGL; the feed only has to mount it for the active film reel.
vi.mock("@/components/shooting-profile/film-space-viewer", () => ({
  FilmSpaceViewer: ({ clip }: { clip: { slotId: string } }) => <div data-testid="film-space-viewer">film {clip.slotId}</div>,
}));
// Likes and memos live on this device only; the chrome reads and writes them through AsyncStorage.
const deviceStorage = new Map<string, string>();
const storageStatus = { failRead: false };
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => { if (storageStatus.failRead) throw new Error("storage unavailable"); return deviceStorage.get(key) ?? null; },
    setItem: async (key: string, value: string) => { deviceStorage.set(key, value); },
    removeItem: async (key: string) => { deviceStorage.delete(key); },
  },
}));

const { ReelsFeed } = await import("@/components/reels/reels-feed");
const { ReelItem } = await import("@/components/reels/reel-item");
const { REEL_STAGE_BOTTOM, REEL_STAGE_TOP } = await import("@/components/reels/reel-overlay");
const { filmShotReel } = await import("@/lib/reels/reel-model");
const { anonymousReferenceReel, syntheticProfileReel } = await import("@/tests/fixtures/reel-fixtures");

const filmShot = filmShotReel({
  version: "film_shot_v1",
  id: "film-shot-test-1",
  title: "내 슛폼 1",
  createdAtMs: new Date(2026, 9, 2, 9, 0, 0).getTime(),
  clips: [
    { slotId: "front-0", view: "front", takeIndex: 0, uri: "blob:front", durationMs: 3533, width: 1080, height: 1920 },
    { slotId: "shooting_side-0", view: "shooting_side", takeIndex: 0, uri: "blob:side", durationMs: 2967, width: 1080, height: 1920 },
  ],
});

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
  deviceStorage.clear();
  storageStatus.failRead = false;
});

const byLabel = (label: string) => document.body.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

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
    // The figure is fitted between the top controls and the bottom caption band, so feet never run into text.
    const stage = byTestId("reel-stage-active")[0];
    expect(REEL_STAGE_TOP).toBeGreaterThanOrEqual(44);
    expect(REEL_STAGE_BOTTOM).toBeGreaterThanOrEqual(88);
    expect(stage.style.top).toBe(`${INSETS.top + REEL_STAGE_TOP}px`);
    expect(stage.style.height).toBe(`${HEIGHT - (INSETS.top + REEL_STAGE_TOP) - (INSETS.bottom + REEL_STAGE_BOTTOM)}px`);
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

  it("starts on the item Home selected and offers analysis only for a saved profile, inside 동작 정보", async () => {
    const onOpenAnalysis = vi.fn();
    const sheetAnalysis = () => Array.from(document.body.querySelectorAll('[data-testid="reel-analysis"]')) as HTMLElement[];
    await render({ initialIndex: 1, onOpenAnalysis });
    expect(label()).toContain("참조 릴");
    await act(async () => { byLabel("동작 정보")!.click(); });
    expect(sheetAnalysis()).toHaveLength(0);
    await act(async () => { byLabel("동작 정보 닫기")!.click(); });
    await remount();
    await render({ initialIndex: 0, onOpenAnalysis });
    expect(sheetAnalysis()).toHaveLength(0);
    await act(async () => { byLabel("동작 정보")!.click(); });
    expect(sheetAnalysis().length).toBeGreaterThanOrEqual(1);
    await act(async () => { sheetAnalysis()[0].click(); });
    expect(onOpenAnalysis).toHaveBeenCalledWith("demo-profile-1");
  });

  it("switches the virtual view from the camera menu at the top right, never from a chip row", async () => {
    await render();
    for (const id of ["front", "oblique", "side"]) expect(byTestId(`reel-view-${id}`)).toHaveLength(0);
    const menu = () => byTestId("reel-view-menu").find((node) => node.getAttribute("aria-disabled") !== "true") as HTMLElement;
    expect(menu().getAttribute("aria-label")).toBe("시점 선택");
    expect(menu().getAttribute("aria-expanded")).toBe("false");
    await act(async () => { menu().click(); });
    expect(menu().getAttribute("aria-expanded")).toBe("true");
    const option = (id: string) => byTestId(`reel-view-${id}`)[0];
    expect(option("oblique").getAttribute("aria-pressed")).toBe("true");
    for (const id of ["front", "oblique", "side"]) expect(option(id).textContent).toMatch(/^(정면|사선|측면)$/);
    await act(async () => { option("front").click(); });
    // Choosing a view closes the menu and the choice is shared by the whole feed.
    expect(byTestId("reel-view-front")).toHaveLength(0);
    await act(async () => { menu().click(); });
    expect(option("front").getAttribute("aria-pressed")).toBe("true");
    expect(option("oblique").getAttribute("aria-pressed")).toBe("false");
  });

  it("closes from the top affordance", async () => {
    const onClose = vi.fn();
    await render({ onClose });
    await act(async () => { byTestId("reel-close")[0].click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("inside a tab (Explore) shows a heading instead of a close control, keeps the 분석 action behind 동작 정보, and names the reel from the item", async () => {
    const onOpenAnalysis = vi.fn();
    const named = [{ ...items[0], title: "SHOT 01", line: "균형 잡힌 기본 리듬 · 미리보기 합성 예시" }, items[1]];
    await render({ items: named, onClose: null, heading: "탐색", onOpenAnalysis });
    expect(byTestId("reel-close")).toHaveLength(0);
    expect(byTestId("reel-heading")[0].textContent).toBe("탐색");
    expect(label()).toContain("SHOT 01 릴, 1/2, 재생 중");
    expect(container.textContent).toContain("SHOT 01");
    expect(container.textContent).toContain("균형 잡힌 기본 리듬");
    // The analysis action sits inside the info sheet (a portal), not on the stage.
    const sheetAnalysis = () => Array.from(document.body.querySelectorAll('[data-testid="reel-analysis"]')) as HTMLElement[];
    expect(sheetAnalysis()).toHaveLength(0);
    await act(async () => { byLabel("동작 정보")!.click(); });
    expect(sheetAnalysis().length).toBeGreaterThanOrEqual(1);
    await act(async () => { sheetAnalysis()[0].click(); });
    expect(onOpenAnalysis).toHaveBeenCalledWith("demo-profile-1");
  });

  it("carries the 참조 동작 chrome: heart, memo and info rail, a caption with the name, the source and the current phase, and five phase dots", async () => {
    await render({ initialIndex: 1 });
    for (const name of ["좋아요", "동작 메모", "동작 정보"]) expect(byLabel(name), name).not.toBeNull();
    expect(byTestId("reel-rail")).toHaveLength(1);
    expect(container.querySelector('[data-testid="reel-item-reference"] [data-testid="reel-caption"]')?.textContent).toContain(items[1].kind === "reference" ? items[1].reference.shortLabel : "");
    const dots = ["준비", "딥", "상승", "릴리스", "팔로우스루"].map((phase) => byLabel(`${phase} 단계 보기`));
    expect(dots.every((dot) => dot !== null)).toBe(true);
    // The reel opens on its release still, so the fourth dot is current and the caption says so.
    expect(byLabel("릴리스 단계 보기")!.getAttribute("aria-pressed")).toBe("true");
    expect(byTestId("reel-phase-label")[0].textContent).toBe("릴리스");
  });

  it("a phase dot seeks the active reel to that phase and holds it; the stage tap resumes", async () => {
    await render();
    await act(async () => { byLabel("딥 단계 보기")!.click(); });
    expect(byLabel("딥 단계 보기")!.getAttribute("aria-pressed")).toBe("true");
    expect(byTestId("reel-phase-label")[0].textContent).toBe("딥");
    expect(label()).toContain("일시정지됨");
    expect(byTestId("reel-pause-indicator")).toHaveLength(1);
    await act(async () => { tap().click(); });
    expect(label()).toContain("재생 중");
  });

  it("keeps a like and a memo on this device only, keyed by the reel, and recovers a failed storage read without overwriting what was saved", async () => {
    await render();
    await flush();
    expect(byLabel("좋아요")!.getAttribute("aria-pressed")).toBe("false");
    await act(async () => { byLabel("좋아요")!.click(); });
    await flush();
    expect(byLabel("좋아요 취소")!.getAttribute("aria-pressed")).toBe("true");
    expect(deviceStorage.get("hoophub:reaction:v1:profile:demo-profile-1:like")).toBe("1");

    await act(async () => { byLabel("동작 메모")!.click(); });
    const field = document.body.querySelector<HTMLTextAreaElement>('[aria-label="동작 메모 입력"]');
    expect(field).not.toBeNull();
    expect(document.body.textContent).toContain("이 기기에만 저장");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "릴리스 높이 참고");
      field!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { byLabel("메모 저장")!.click(); });
    await flush();
    expect(deviceStorage.get("hoophub:reaction:v1:profile:demo-profile-1:note")).toBe("릴리스 높이 참고");
    expect(document.body.querySelector('[aria-label="동작 메모 입력"]')).toBeNull();

    await remount();
    storageStatus.failRead = true;
    await render();
    await flush();
    expect(byLabel("좋아요")!.getAttribute("aria-disabled")).toBe("true");
    expect(document.body.textContent).toContain("기기 저장소를 읽지 못했습니다");
    storageStatus.failRead = false;
    await act(async () => { byLabel("저장소 다시 읽기")!.click(); });
    await flush();
    expect(byLabel("좋아요 취소")).not.toBeNull();
    expect(deviceStorage.get("hoophub:reaction:v1:profile:demo-profile-1:note")).toBe("릴리스 높이 참고");
  });

  it("holds playback while a sheet covers the stage and shows the item's provenance in 동작 정보", async () => {
    await render({ initialIndex: 1 });
    expect(label()).toContain("재생 중");
    await act(async () => { byLabel("동작 정보")!.click(); });
    expect(label()).toContain("일시정지됨");
    expect(byLabel("동작 정보")!.getAttribute("aria-expanded")).toBe("true");
    const reference = items[1].kind === "reference" ? items[1].reference : null;
    expect(document.body.textContent).toContain(reference!.sourceAttribution);
    expect(document.body.textContent).toContain("원본 C3D 프레임");
    await act(async () => { byLabel("동작 정보 닫기")!.click(); });
    expect(label()).toContain("재생 중");
  });

  it("lets a surface supply the info body and a primary action (참조 동작 → 추천 목표 선택)", async () => {
    const onAction = vi.fn();
    await render({ items: [items[1]], onClose: null, heading: "참조 동작", renderInfo: () => ({ action: { label: "추천 목표 선택", onPress: onAction } }) });
    await act(async () => { byLabel("동작 정보")!.click(); });
    await act(async () => { byLabel("추천 목표 선택")!.click(); });
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("plays a film shot as film media: the active reel mounts the Film viewer for one clip, offers the other clip, and shows no skeleton playback state", async () => {
    await render({ items: [filmShot, items[1]], onClose: null });
    expect(byTestId("reel-item-film")).toHaveLength(1);
    // Film has no virtual camera and no shot phases: no view menu, no dots.
    expect(byTestId("reel-view-menu").filter((node) => node.getAttribute("aria-disabled") !== "true")).toHaveLength(0);
    expect(byLabel("릴리스 단계 보기")).toBeNull();
    expect(byTestId("film-space-viewer")).toHaveLength(1);
    expect(byTestId("film-space-viewer")[0].textContent).toContain("front-0");
    expect(label()).toContain("내 슛폼 1 영상 릴, 1/2");
    expect(label()).not.toMatch(/재생 중|일시정지됨/);
    expect(byTestId("reel-pause-indicator")).toHaveLength(0);
    expect(byTestId("reel-analysis")).toHaveLength(0);
    expect(container.textContent).toContain("내 영상 · 이 기기에만 보관");
    const side = container.querySelector('[aria-label="측면 1 로컬 영상 보기"]') as HTMLElement | null;
    expect(side).not.toBeNull();
    await act(async () => { side!.click(); });
    expect(byTestId("film-space-viewer")[0].textContent).toContain("shooting_side-0");
  });

  it("tells the truth when a film shot's clips are not on this device", async () => {
    await render({ items: [{ ...filmShot, id: "film:empty", clips: [] }, items[1]], onClose: null });
    expect(byTestId("film-space-viewer")).toHaveLength(0);
    expect(container.textContent).toContain("이 기기에 영상이 없습니다");
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

  it("fakes nothing social: a like and a memo stay on this device, with no counts, shares, follows or bookmarks anywhere", async () => {
    await render();
    const icons = Array.from(container.querySelectorAll("[data-icon]")).map((node) => node.getAttribute("data-icon") ?? "");
    expect(icons.join(" ")).not.toMatch(/share|send|account-plus|bookmark/);
    expect(container.textContent ?? "").not.toMatch(/댓글|팔로우|공유|저장됨|\d+\s*(likes?|views?)/i);
    expect(container.textContent ?? "").not.toMatch(/좋아요\s*\d|\d+\s*좋아요/);
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
