import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const motionSettings = { reduced: false as boolean | null };
const visibility = { focused: true, state: "active" };
const storage = new Map<string, string>();
const storageStatus = { failRead: false };
vi.mock("@react-navigation/native", () => ({ useIsFocused: () => visibility.focused }));
vi.mock("@/hooks/use-app-state", () => ({ useAppStateStatus: () => visibility.state }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => { if (storageStatus.failRead) throw new Error("Storage unavailable"); return storage.get(key) ?? null; },
  setItem: async (key: string, value: string) => { storage.set(key, value); },
  removeItem: async (key: string) => { storage.delete(key); },
} }));
vi.mock("expo-router", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => motionSettings.reduced }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }) }));
vi.mock("@/components/screen-container", () => ({
  ScreenContainer: ({ children, onLayout, testID }: { children: React.ReactNode; onLayout?: (event: { nativeEvent: { layout: { width: number; height: number } } }) => void; testID?: string }) => {
    onLayout?.({ nativeEvent: { layout: { width: 375, height: 720 } } });
    return <div data-testid={testID}>{children}</div>;
  },
}));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({ default: ({ name }: { name: string }) => <span data-icon={name} /> }));
vi.mock("react-native-svg", () => ({
  default: ({ children, width, height }: { children: React.ReactNode; width?: number | string; height?: number | string }) => <svg width={width} height={height}>{children}</svg>,
  Circle: ({ cx, cy, r }: { cx: number; cy: number; r: number }) => <circle cx={cx} cy={cy} r={r} />, Line: () => <line />,
}));
vi.mock("expo-haptics", () => ({ selectionAsync: async () => undefined }));

const { default: LibraryScreen } = await import("@/app/(tabs)/library");
const { PoseMotionViewer } = await import("@/components/pose-motion-viewer");
const { ANONYMOUS_POSE_REFERENCES } = await import("@/lib/anonymous-pose-library");
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container); replace.mockClear(); motionSettings.reduced = false; storage.clear(); storageStatus.failRead = false; visibility.focused = true; visibility.state = "active";
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const button = (label: string) => {
  const element = document.body.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  expect(element, label).not.toBeNull(); return element!;
};
const click = async (element: HTMLElement) => { await act(async () => element.click()); };
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const stageLabel = () => (document.body.querySelector('[data-testid="reel-tap"]:not([aria-disabled="true"])') as HTMLElement | null)?.getAttribute("aria-label") ?? "";
const reactionKey = `hoophub:reaction:v1:reference:${ANONYMOUS_POSE_REFERENCES[0].id}`;

describe("참조 동작 as one reel", () => {
  it("recovers failed storage reads without overwriting saved personal state", async () => {
    storage.set(`${reactionKey}:like`, "1"); storage.set(`${reactionKey}:note`, "이전 메모"); storageStatus.failRead = true;
    await act(async () => root.render(<LibraryScreen />));
    await flush();
    expect(button("좋아요").getAttribute("aria-disabled")).toBe("true");
    expect(document.body.textContent).toContain("기기 저장소를 읽지 못했습니다");
    storageStatus.failRead = false;
    await click(button("저장소 다시 읽기"));
    await flush();
    expect(button("좋아요 취소")).toBeTruthy();
    await click(button("동작 메모"));
    expect(document.body.querySelector<HTMLTextAreaElement>('[aria-label="동작 메모 입력"]')!.value).toBe("이전 메모");
  });

  it("suspends playback behind a sheet, another tab, or a backgrounded app", async () => {
    await act(async () => root.render(<LibraryScreen />));
    expect(stageLabel()).toContain("재생 중");
    await click(button("동작 정보"));
    expect(stageLabel()).toContain("일시정지됨");
    await click(button("동작 정보 닫기"));
    expect(stageLabel()).toContain("재생 중");
    visibility.focused = false;
    await act(async () => root.render(<LibraryScreen />));
    expect(stageLabel()).toContain("일시정지됨");
    visibility.focused = true; visibility.state = "background";
    await act(async () => root.render(<LibraryScreen />));
    expect(stageLabel()).toContain("일시정지됨");
    visibility.state = "active";
    await act(async () => root.render(<LibraryScreen />));
    expect(stageLabel()).toContain("재생 중");
  });

  it("starts with the motion and keeps provenance behind one reversible disclosure", async () => {
    await act(async () => root.render(<LibraryScreen />));
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toContain("참조 동작");
    expect(container.textContent).not.toMatch(/SHOOTING FORM ANALYSIS|FLUID MOTION|APPROVED ACTUAL|SRC|CMU Graphics/);
    expect(button("동작 정보").getAttribute("aria-expanded")).toBe("false");
    await click(button("동작 정보"));
    expect(button("동작 정보").getAttribute("aria-expanded")).toBe("true");
    expect(document.body.textContent).toContain(ANONYMOUS_POSE_REFERENCES[0].sourceAttribution);
    for (const frame of ANONYMOUS_POSE_REFERENCES[0].sourcePhaseFrames!) expect(document.body.textContent).toContain(String(frame));
    await click(button("동작 정보 닫기"));
    expect(container.textContent).not.toContain("CMU Graphics");
  });

  it("keeps phase seeking, playback and the assessment action reachable", async () => {
    await act(async () => root.render(<LibraryScreen />));
    const tap = () => document.body.querySelector('[data-testid="reel-tap"]:not([aria-disabled="true"])') as HTMLElement;
    await click(tap());
    expect(stageLabel()).toContain("일시정지됨");
    await click(tap());
    expect(stageLabel()).toContain("재생 중");
    await click(button("릴리스 단계 보기"));
    expect(button("릴리스 단계 보기").getAttribute("aria-pressed")).toBe("true");
    expect(stageLabel()).toContain("일시정지됨");
    await click(button("동작 정보"));
    await click(button("추천 목표 선택"));
    expect(replace).toHaveBeenCalledWith("/assessment");
  });

  it("does not autoplay when reduced motion is enabled or unknown, and opens on the release still", async () => {
    motionSettings.reduced = true;
    await act(async () => root.render(<LibraryScreen />));
    expect(stageLabel()).toContain("일시정지됨");
    expect(button("릴리스 단계 보기").getAttribute("aria-pressed")).toBe("true");
    expect(document.body.querySelector('[data-testid="reel-phase-label"]')?.textContent).toBe("릴리스");
  });

  it("keeps the complete reference pose inside the stage at every phase", async () => {
    await act(async () => root.render(<LibraryScreen />));
    const svg = container.querySelector("svg")!;
    const height = Number(svg.getAttribute("height"));
    expect(height).toBeGreaterThan(0);
    for (const phase of ["준비", "딥", "상승", "릴리스", "팔로우스루"]) {
      await click(button(`${phase} 단계 보기`));
      for (const circle of Array.from(container.querySelectorAll("circle"))) {
        const y = Number(circle.getAttribute("cy"));
        const radius = Number(circle.getAttribute("r"));
        expect(y - radius, phase).toBeGreaterThanOrEqual(0);
        expect(y + radius, phase).toBeLessThanOrEqual(height);
      }
    }
  });

  it("preserves the full viewer evidence for the Profile caller of the pose motion viewer", async () => {
    const reference = ANONYMOUS_POSE_REFERENCES[0];
    await act(async () => root.render(<PoseMotionViewer motion={reference.motion} boundary="분석 근거" sourcePhaseFrames={reference.sourcePhaseFrames} />));
    expect(container.textContent).toContain("분석 근거");
    expect(container.textContent).toContain("#269");
  });

  it("presents one full-height motion with the right rail and the camera menu, and no separate controls row", async () => {
    await act(async () => root.render(<LibraryScreen />));
    expect(container.querySelector('[data-testid="reference-reel"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="reel-rail"]')).not.toBeNull();
    expect(button("좋아요").getAttribute("aria-pressed")).toBe("false");
    expect(button("동작 메모")).toBeTruthy();
    expect(container.textContent).not.toContain("추천 목표 선택");
    expect(container.textContent).not.toContain("정면");
    await click(button("시점 선택"));
    expect(button("정면 시점")).toBeTruthy();
    // The caption names the motion and its style; the attribution stays behind 동작 정보.
    const caption = document.body.querySelector('[data-testid="reel-caption"]')?.textContent ?? "";
    expect(caption).toContain(ANONYMOUS_POSE_REFERENCES[0].shortLabel);
    expect(caption).toContain(ANONYMOUS_POSE_REFERENCES[0].styleTitle);
    expect(caption).not.toContain("CMU");
  });

  it("persists personal likes and notes on this device", async () => {
    await act(async () => root.render(<LibraryScreen />));
    await flush();
    await click(button("좋아요"));
    await flush();
    expect(button("좋아요 취소").getAttribute("aria-pressed")).toBe("true");
    await click(button("동작 메모"));
    const field = document.body.querySelector<HTMLTextAreaElement>('[aria-label="동작 메모 입력"]')!;
    expect(field).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "릴리스 높이 참고");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button("메모 저장"));
    await flush();
    expect(storage.get(`${reactionKey}:note`)).toBe("릴리스 높이 참고");
    await act(async () => root.unmount()); root = createRoot(container);
    await act(async () => root.render(<LibraryScreen />));
    await flush();
    expect(button("좋아요 취소")).toBeTruthy();
    await click(button("동작 메모"));
    expect(document.body.querySelector<HTMLTextAreaElement>('[aria-label="동작 메모 입력"]')!.value).toBe("릴리스 높이 참고");
  });
});
