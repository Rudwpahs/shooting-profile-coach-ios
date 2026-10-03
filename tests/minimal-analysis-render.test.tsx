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
// The full inspection surface (Motion/Phase/Film) has its own suites; here it only has to be reachable from the sheet.
vi.mock("@/components/shooting-profile/shot-inspection-viewer", () => ({
  ShotInspectionViewer: ({ profileId }: { profileId: string }) => <div data-testid="shot-inspection-viewer">inspection {profileId}</div>,
}));

const { MinimalAnalysis } = await import("@/components/analysis/minimal-analysis");
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
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const byLabel = (label: string) => document.body.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const byTestId = (id: string) => Array.from(document.body.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];
const click = async (element: HTMLElement | null) => { expect(element).not.toBeNull(); await act(async () => element!.click()); };

type Props = Partial<React.ComponentProps<typeof MinimalAnalysis>>;
const render = (props: Props = {}) => act(async () => {
  root.render(
    <MinimalAnalysis
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

describe("minimal analysis", () => {
  it("shows one stage, the name, one finding line, the phase line and five phase markers, and nothing else", async () => {
    await render();
    expect(byTestId("minimal-analysis")).toHaveLength(1);
    expect(byTestId("minimal-analysis-stage")).toHaveLength(1);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toContain("SHOT 12");
    expect(byTestId("minimal-analysis-line")).toHaveLength(1);
    expect(byTestId("reel-progress").length).toBeGreaterThanOrEqual(1);
    const markers = ["준비", "딥", "상승", "릴리스", "팔로우스루"].map((label) => byLabel(`${label} 단계 보기`));
    expect(markers.every((marker) => marker !== null)).toBe(true);
    expect(byLabel("뒤로 가기")).not.toBeNull();
    expect(byLabel("자세히")).not.toBeNull();
    // The three-layer surface is not on screen until asked for.
    expect(byTestId("shot-inspection-viewer")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/FLUID MOTION|Motion 보기|Phase 보기/);
  });

  it("tapping the stage pauses and resumes; a phase marker seeks and holds that phase", async () => {
    await render();
    const stage = () => byLabel("동작 화면 일시정지") ?? byLabel("동작 화면 재생");
    expect(byLabel("동작 화면 일시정지")).not.toBeNull();
    await click(stage());
    expect(byLabel("동작 화면 재생")).not.toBeNull();
    expect(byTestId("reel-pause-indicator")).toHaveLength(1);
    await click(stage());
    expect(byLabel("동작 화면 일시정지")).not.toBeNull();
    await click(byLabel("릴리스 단계 보기"));
    expect(byLabel("릴리스 단계 보기")!.getAttribute("aria-pressed")).toBe("true");
    expect(byLabel("동작 화면 재생")).not.toBeNull();
    expect(container.textContent).toContain("릴리스");
  });

  it("opens the full inspection, details and evidence in one sheet, suspends playback behind it, and closes again", async () => {
    await render();
    await click(byLabel("자세히"));
    expect(byTestId("shot-inspection-viewer")).toHaveLength(1);
    expect(document.body.textContent).toContain("inspection preview-shot-012");
    expect(byLabel("자세히")!.getAttribute("aria-expanded")).toBe("true");
    expect(byLabel("동작 화면 재생")).not.toBeNull();
    await click(byLabel("자세히 닫기"));
    expect(byTestId("shot-inspection-viewer")).toHaveLength(0);
    expect(byLabel("동작 화면 일시정지")).not.toBeNull();
  });

  it("never autoplays under Reduce Motion or while unfocused, and goes back from the top control", async () => {
    const onBack = vi.fn();
    await render({ reducedMotion: true, onBack });
    expect(byLabel("동작 화면 재생")).not.toBeNull();
    await click(byLabel("뒤로 가기"));
    expect(onBack).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    root = createRoot(container);
    await render({ focused: false });
    expect(byLabel("동작 화면 재생")).not.toBeNull();
  });
});
