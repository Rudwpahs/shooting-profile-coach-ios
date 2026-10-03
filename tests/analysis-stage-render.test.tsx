import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native-svg", () => ({
  default: ({ children, ...props }: { children?: React.ReactNode; width?: number; height?: number }) => <svg data-testid="skeleton-svg" width={props.width} height={props.height}>{children}</svg>,
  Circle: () => <circle />,
  Line: () => <line />,
}));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({ default: ({ name }: { name: string }) => <span data-icon={name} /> }));
vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(async () => undefined),
  impactAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy", Rigid: "rigid", Soft: "soft" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));
const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { storage.set(key, value); },
  removeItem: async (key: string) => { storage.delete(key); },
} }));
// The inspection surface (Phase / Film) has its own suites; here it only has to be reachable from the sheet.
vi.mock("@/components/shooting-profile/shot-inspection-viewer", () => ({
  ShotInspectionViewer: ({ profileId }: { profileId: string }) => <div data-testid="shot-inspection-viewer">inspection {profileId}</div>,
}));

const { AnalysisStage } = await import("@/components/analysis/analysis-stage");
const { syntheticRepresentative } = await import("@/tests/fixtures/reel-fixtures");

const { profile, confidence } = syntheticRepresentative();
const WIDTH = 375;
const HEIGHT = 700;
const INSETS = { top: 47, bottom: 34 };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  storage.clear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const byLabel = (label: string) => document.body.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const byTestId = (id: string) => Array.from(document.body.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];
const click = async (element: HTMLElement | null) => { expect(element).not.toBeNull(); await act(async () => element!.click()); };
const stageLabel = () => (document.body.querySelector('[data-testid="reel-tap"]:not([aria-disabled="true"])') as HTMLElement | null)?.getAttribute("aria-label") ?? "";

type Props = Partial<React.ComponentProps<typeof AnalysisStage>>;
const render = (props: Props = {}) => act(async () => {
  root.render(
    <AnalysisStage
      appState="active"
      confidence={confidence}
      experimentalEnabled
      focused
      height={HEIGHT}
      insets={INSETS}
      onBack={() => {}}
      profile={profile}
      profileId="preview-shot-012"
      reducedMotion={false}
      shootingHand="right"
      title="SHOT 12"
      width={WIDTH}
      {...props}
    />,
  );
});

describe("analysis stage", () => {
  it("is the same reel as every player: one stage, the name with band and finding, rail, camera menu, phase dots, back control", async () => {
    await render();
    expect(byTestId("analysis-stage")).toHaveLength(1);
    expect(byTestId("reels-feed")).toHaveLength(1);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(stageLabel()).toContain("SHOT 12 릴, 1/1, 재생 중");
    expect(byTestId("reel-caption")[0].textContent).toContain("SHOT 12");
    expect(byTestId("reel-caption")[0].textContent).toMatch(/Basic|High|재촬영/);
    for (const name of ["릴 닫기", "시점 선택", "좋아요", "동작 메모", "동작 정보", "릴리스 단계 보기"]) expect(byLabel(name), name).not.toBeNull();
    // The three-layer surface is not on screen until asked for.
    expect(byTestId("shot-inspection-viewer")).toHaveLength(0);
    expect(byTestId("analysis-layers")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/FLUID MOTION|Motion 보기/);
  });

  it("opens the inspection, details and evidence in 동작 정보, holds playback behind it, and closes again", async () => {
    await render();
    await click(byLabel("동작 정보"));
    expect(byTestId("analysis-layers")).toHaveLength(1);
    expect(byTestId("shot-inspection-viewer")).toHaveLength(1);
    expect(document.body.textContent).toContain("inspection preview-shot-012");
    expect(document.body.textContent).toContain("자세히");
    expect(document.body.textContent).toContain("위상 · 각도 · 증거");
    expect(stageLabel()).toContain("일시정지됨");
    await click(byLabel("동작 정보 닫기"));
    expect(byTestId("analysis-layers")).toHaveLength(0);
    expect(stageLabel()).toContain("재생 중");
  });

  it("goes back from the top control and never autoplays under Reduce Motion", async () => {
    const onBack = vi.fn();
    await render({ onBack, reducedMotion: true });
    expect(stageLabel()).toContain("일시정지됨");
    await click(byLabel("릴 닫기"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
