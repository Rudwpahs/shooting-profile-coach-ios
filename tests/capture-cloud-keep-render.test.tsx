import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The native capture hook binds the on-device pose module, which has no jsdom runtime; the view takes a controller.
vi.mock("@/hooks/use-shooting-profile-capture", () => ({ useShootingProfileCapture: () => { throw new Error("not used"); } }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("react-native-svg", () => ({ default: ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>, Circle: () => <circle />, Line: () => <line /> }));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({ default: ({ name }: { name: string }) => <span data-icon={name} /> }));
vi.mock("expo-haptics", () => ({ selectionAsync: vi.fn(async () => undefined), impactAsync: vi.fn(async () => undefined), ImpactFeedbackStyle: { Light: "light" } }));
vi.mock("@/components/screen-container", () => ({ ScreenContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> }));

const { CaptureSessionView } = await import("@/components/shooting-profile/capture-session");
const { captureSessionReducer, createCaptureSession } = await import("@/lib/shooting-profile/capture-session-reducer");

type Controller = React.ComponentProps<typeof CaptureSessionView>["controller"];

function filmReviewState() {
  let state = [{ type: "SELECT_MODE", mode: "basic_1_plus_1" }, { type: "START_COLLECTION" }].reduce((current, action) => captureSessionReducer(current, action as never), createCaptureSession());
  state.slots.forEach((slot, index) => {
    const generation = slot.generation + 1;
    state = captureSessionReducer(state, { type: "SLOT_ACQUIRE_STARTED", slotId: slot.id, requestId: `r${index}`, generation });
    state = captureSessionReducer(state, { type: "SLOT_FILM_ACCEPTED", slotId: slot.id, requestId: `r${index}`, generation });
  });
  return state;
}

function completeState() {
  const review = filmReviewState();
  const saving = captureSessionReducer(review, { type: "SAVE_STARTED" });
  return captureSessionReducer(saving, { type: "SAVE_SUCCEEDED", sessionGeneration: saving.sessionGeneration, profileId: "film-shot-abc-1" });
}

function controller(overrides: Partial<Controller>): Controller {
  return {
    state: filmReviewState(),
    canSave: true,
    selectMode: vi.fn(),
    returnToModeSelect: vi.fn(),
    setShootingHand: vi.fn(),
    startCollection: vi.fn(),
    acquireSlot: vi.fn(),
    retakeSlot: vi.fn(),
    cancelSession: vi.fn(),
    retrySession: vi.fn(),
    save: vi.fn(),
    ...overrides,
  };
}

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

const render = (value: Controller) => act(async () => {
  root.render(<CaptureSessionView completionActionLabel="내 영상 릴 열기" controller={value} onClose={() => {}} onComplete={() => {}} width={375} />);
});
const byLabel = (label: string) => container.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
const toggle = () => container.querySelector('[data-testid="capture-cloud-keep"]') as HTMLElement | null;

describe("film review: 클라우드에도 보관", () => {
  it("shows no switch and promises no upload when the build cannot keep footage in the cloud", async () => {
    const value = controller({});
    await render(value);
    expect(toggle()).toBeNull();
    expect(container.textContent).toContain("어디에도 업로드되지 않습니다");
    await act(async () => { byLabel("내 영상으로 보관")!.click(); });
    expect(value.save).toHaveBeenCalledTimes(1);
    expect((value.save as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeUndefined();
  });

  it("is off by default; turning it on names the destination and the save carries the choice", async () => {
    const value = controller({ cloudKeepAvailable: true, cloudKeepResult: "none" });
    await render(value);
    expect(toggle()).not.toBeNull();
    expect(toggle()!.getAttribute("aria-label")).toBe("클라우드에도 보관");
    expect(toggle()!.getAttribute("aria-pressed")).toBe("false");
    expect(container.textContent).toContain("어디에도 업로드되지 않습니다");

    await act(async () => { toggle()!.click(); });
    expect(toggle()!.getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).not.toContain("어디에도 업로드되지 않습니다");
    expect(container.textContent).toContain("내 계정 전용 비공개 저장 공간");
    expect(container.textContent).toContain("삭제하면 함께 지워집니다");

    await act(async () => { byLabel("내 영상으로 보관")!.click(); });
    expect(value.save).toHaveBeenCalledWith({ cloud: true });
  });

  it("keeps the choice off when the owner never touched it", async () => {
    const value = controller({ cloudKeepAvailable: true, cloudKeepResult: "none" });
    await render(value);
    await act(async () => { byLabel("내 영상으로 보관")!.click(); });
    expect((value.save as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeUndefined();
  });

  it("says exactly where the footage ended up when the session completes", async () => {
    await render(controller({ state: completeState(), cloudKeepAvailable: true, cloudKeepResult: "none" }));
    expect(container.textContent).toContain("원본 영상은 업로드하지 않았고, 이 기기에만 내 영상으로 보관했습니다.");

    await render(controller({ state: completeState(), cloudKeepAvailable: true, cloudKeepResult: "uploaded" }));
    expect(container.textContent).toContain("내 계정 전용 클라우드에도 올렸습니다");
    expect(container.textContent).not.toContain("원본 영상은 업로드하지 않았고");

    await render(controller({ state: completeState(), cloudKeepAvailable: true, cloudKeepResult: "failed" }));
    expect(container.textContent).toContain("클라우드 업로드는 실패했습니다");
    expect(container.textContent).toContain("이 기기에는 내 영상으로 보관");
  });
});
