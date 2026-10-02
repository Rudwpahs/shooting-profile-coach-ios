import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const motionSettings = { reduced: false };
const visibility = { focused: true, state: "active" };
vi.mock("@react-navigation/native", () => ({ useIsFocused: () => visibility.focused }));
vi.mock("@/hooks/use-app-state", () => ({ useAppStateStatus: () => visibility.state }));
const storage = new Map<string, string>();
const storageStatus = { failRead: false };
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => { if (storageStatus.failRead) throw new Error("Storage unavailable"); return storage.get(key) ?? null; },
  setItem: async (key: string, value: string) => { storage.set(key, value); },
} }));
vi.mock("expo-router", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => motionSettings.reduced }));
vi.mock("@/components/screen-container", () => ({ ScreenContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({ default: () => <span /> }));
vi.mock("react-native-svg", () => ({
  default: ({ children, viewBox }: { children: React.ReactNode; viewBox: string }) => <svg viewBox={viewBox}>{children}</svg>,
  Circle: ({ cx, cy, r }: { cx: number; cy: number; r: number }) => <circle cx={cx} cy={cy} r={r} />, Line: () => <line />,
}));

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

describe("minimal reference library", () => {
  it("recovers failed storage reads without overwriting saved personal state", async () => {
    const key = `hoophub:reference:${ANONYMOUS_POSE_REFERENCES[0].id}`;
    storage.set(`${key}:like`, "1"); storage.set(`${key}:note`, "이전 메모"); storageStatus.failRead = true;
    await act(async () => root.render(<LibraryScreen />));
    expect(button("좋아요").getAttribute("aria-disabled")).toBe("true");
    await click(button("동작 정보"));
    expect(document.body.textContent).toContain("기기 저장소를 읽지 못했습니다");
    await click(button("동작 정보 닫기"));
    storageStatus.failRead = false;
    await click(button("저장소 다시 읽기"));
    expect(button("좋아요 취소")).toBeTruthy();
    await click(button("동작 메모"));
    expect(document.body.querySelector<HTMLTextAreaElement>('[aria-label="동작 메모 입력"]')!.value).toBe("이전 메모");
  });
  it("suspends playback behind a sheet, another tab, or a backgrounded app", async () => {
    await act(async () => root.render(<LibraryScreen />));
    await click(button("동작 화면 재생"));
    await click(button("동작 정보"));
    expect(button("동작 화면 재생")).toBeTruthy();
    await click(button("동작 정보 닫기"));
    expect(button("동작 화면 일시정지")).toBeTruthy();
    visibility.focused = false;
    await act(async () => root.render(<LibraryScreen />));
    expect(button("동작 화면 재생")).toBeTruthy();
    visibility.focused = true; visibility.state = "background";
    await act(async () => root.render(<LibraryScreen />));
    expect(button("동작 화면 재생")).toBeTruthy();
    visibility.state = "active";
    await act(async () => root.render(<LibraryScreen />));
    expect(button("동작 화면 일시정지")).toBeTruthy();
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
    await click(button("동작 화면 재생"));
    await click(button("동작 화면 일시정지"));
    expect(button("동작 화면 재생")).toBeTruthy();
    await click(button("릴리스 단계 보기"));
    expect(button("릴리스 단계 보기").getAttribute("aria-pressed")).toBe("true");
    expect(button("동작 화면 재생")).toBeTruthy();
    await click(button("동작 정보"));
    await click(button("추천 목표 선택"));
    expect(replace).toHaveBeenCalledWith("/assessment");
  });

  it("does not autoplay compact motion when reduced motion is enabled", async () => {
    motionSettings.reduced = true;
    await act(async () => root.render(<LibraryScreen />));
    expect(button("동작 화면 재생")).toBeTruthy();
    expect(button("릴리스 단계 보기").getAttribute("aria-pressed")).toBe("true");
  });

  it("allows the whole motion stage to pause and resume", async () => {
    await act(async () => root.render(<LibraryScreen />));
    await click(button("동작 화면 재생"));
    expect(button("동작 화면 일시정지")).toBeTruthy();
    await click(button("동작 화면 일시정지"));
    expect(button("동작 화면 재생")).toBeTruthy();
  });

  it("keeps the complete reference pose inside the canvas at the default zoom", async () => {
    await act(async () => root.render(<LibraryScreen />));
    const [, top, , height] = container.querySelector("svg")!.getAttribute("viewBox")!.split(" ").map(Number);
    for (const phase of ANONYMOUS_POSE_REFERENCES[0].motion.frames) {
      await click(button(`${phase.label} 단계 보기`));
      for (const circle of Array.from(container.querySelectorAll("circle"))) {
        const y = Number(circle.getAttribute("cy"));
        const radius = Number(circle.getAttribute("r"));
        expect(y - radius, phase.label).toBeGreaterThanOrEqual(top);
        expect(y + radius, phase.label).toBeLessThanOrEqual(top + height);
      }
    }
  });

  it("preserves the full viewer evidence for existing analysis callers", async () => {
    const reference = ANONYMOUS_POSE_REFERENCES[0];
    await act(async () => root.render(<PoseMotionViewer motion={reference.motion} boundary="분석 근거" sourcePhaseFrames={reference.sourcePhaseFrames} />));
    expect(container.textContent).toContain("분석 근거");
    expect(container.textContent).toContain("#269");
  });

  it("presents one full-height motion with a right action rail and no separate controls row", async () => {
    await act(async () => root.render(<LibraryScreen />));
    expect(container.querySelector('[data-testid="reference-reel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="reference-action-rail"]')).not.toBeNull();
    expect(button("좋아요").getAttribute("aria-pressed")).toBe("false");
    expect(button("동작 메모")).toBeTruthy();
    expect(container.textContent).not.toContain("추천 목표 선택");
    expect(container.textContent).not.toContain("정면");
    await click(button("시점 선택"));
    expect(button("정면 시점")).toBeTruthy();
  });

  it("persists personal likes and notes on this device", async () => {
    await act(async () => root.render(<LibraryScreen />));
    await click(button("좋아요"));
    expect(button("좋아요 취소").getAttribute("aria-pressed")).toBe("true");
    await click(button("동작 메모"));
    const field = document.body.querySelector<HTMLTextAreaElement>('[aria-label="동작 메모 입력"]')!;
    expect(field).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "릴리스 높이 참고");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button("메모 저장"));
    await act(async () => root.unmount()); root = createRoot(container);
    await act(async () => root.render(<LibraryScreen />));
    expect(button("좋아요 취소")).toBeTruthy();
    await click(button("동작 메모"));
    expect(document.body.querySelector<HTMLTextAreaElement>('[aria-label="동작 메모 입력"]')!.value).toBe("릴리스 높이 참고");
  });
});
