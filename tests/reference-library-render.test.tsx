import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const motionSettings = { reduced: false };
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
  root = createRoot(container); replace.mockClear(); motionSettings.reduced = false;
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const button = (label: string) => {
  const element = container.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  expect(element, label).not.toBeNull(); return element!;
};
const click = async (element: HTMLElement) => { await act(async () => element.click()); };

describe("minimal reference library", () => {
  it("starts with the motion and keeps provenance behind one reversible disclosure", async () => {
    await act(async () => root.render(<LibraryScreen />));
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toContain("참조 동작");
    expect(container.textContent).not.toMatch(/SHOOTING FORM ANALYSIS|FLUID MOTION|APPROVED ACTUAL|SRC|CMU Graphics/);
    expect(button("동작 정보").getAttribute("aria-expanded")).toBe("false");
    await click(button("동작 정보"));
    expect(button("동작 정보").getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain(ANONYMOUS_POSE_REFERENCES[0].sourceAttribution);
    for (const frame of ANONYMOUS_POSE_REFERENCES[0].sourcePhaseFrames!) expect(container.textContent).toContain(String(frame));
    await click(button("동작 정보"));
    expect(container.textContent).not.toContain("CMU Graphics");
  });

  it("keeps phase seeking, playback and the assessment action reachable", async () => {
    await act(async () => root.render(<LibraryScreen />));
    await click(button("동작 재생"));
    await click(button("동작 일시정지"));
    expect(button("동작 재생")).toBeTruthy();
    await click(button("릴리스 단계 보기"));
    expect(button("릴리스 단계 보기").getAttribute("aria-pressed")).toBe("true");
    expect(button("동작 재생")).toBeTruthy();
    await click(button("추천 목표 선택"));
    expect(replace).toHaveBeenCalledWith("/assessment");
  });

  it("does not autoplay compact motion when reduced motion is enabled", async () => {
    motionSettings.reduced = true;
    await act(async () => root.render(<LibraryScreen />));
    expect(button("동작 재생")).toBeTruthy();
    expect(button("릴리스 단계 보기").getAttribute("aria-pressed")).toBe("true");
  });

  it("allows the whole motion stage to pause and resume", async () => {
    await act(async () => root.render(<LibraryScreen />));
    await click(button("동작 화면 재생"));
    expect(button("동작 일시정지")).toBeTruthy();
    await click(button("동작 화면 일시정지"));
    expect(button("동작 재생")).toBeTruthy();
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
});
