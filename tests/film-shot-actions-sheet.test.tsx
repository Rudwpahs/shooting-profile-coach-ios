import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({ default: ({ name }: { name: string }) => <span data-icon={name} /> }));

const { FilmShotActionsSheet } = await import("@/components/profile/film-shot-actions-sheet");

type Props = React.ComponentProps<typeof FilmShotActionsSheet>;

const base = (overrides: Partial<Props> = {}): Props => ({
  target: { id: "film-shot-a-1", title: "내 슛폼 1", onDevice: true, inCloud: false },
  cloudAvailable: false,
  canDownload: true,
  busy: null,
  error: null,
  onClose: vi.fn(),
  onKeepInCloud: vi.fn(),
  onDownload: vi.fn(),
  onDelete: vi.fn(),
  onDeleteCloudOnly: vi.fn(),
  ...overrides,
});

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

const render = (props: Props) => act(async () => { root.render(<FilmShotActionsSheet {...props} />); });
// The sheet is a modal: react-native-web portals it to the document body.
const byLabel = (label: string) => document.body.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
const text = () => document.body.textContent ?? "";

describe("film shot actions sheet", () => {
  it("renders nothing without a target", async () => {
    await render(base({ target: null }));
    expect(document.body.querySelector('[data-testid="film-shot-actions"]')).toBeNull();
  });

  it("for a device-only shot in a build without cloud keeping: says nothing was uploaded and offers only delete", async () => {
    const props = base();
    await render(props);
    expect(text()).toContain("내 슛폼 1");
    expect(text()).toContain("이 기기에만 보관 중");
    expect(byLabel("클라우드에도 보관")).toBeNull();
    expect(byLabel("이 기기로 내려받기")).toBeNull();
    expect(byLabel("클라우드에서만 삭제")).toBeNull();
    // Deleting takes two presses: the first only asks.
    await act(async () => { byLabel("삭제")!.click(); });
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(text()).toContain("되돌릴 수 없습니다");
    await act(async () => { byLabel("삭제 확인")!.click(); });
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it("offers cloud keeping for a device-only shot when the build and owner can use it", async () => {
    const props = base({ cloudAvailable: true });
    await render(props);
    await act(async () => { byLabel("클라우드에도 보관")!.click(); });
    expect(props.onKeepInCloud).toHaveBeenCalledTimes(1);
  });

  it("for a shot kept in both places: says so, can drop only the cloud copy, and warns that delete removes both", async () => {
    const props = base({ cloudAvailable: true, target: { id: "film-shot-a-1", title: "내 슛폼 1", onDevice: true, inCloud: true } });
    await render(props);
    expect(text()).toContain("이 기기와 내 계정 전용 클라우드에 보관 중");
    expect(byLabel("클라우드에도 보관")).toBeNull();
    await act(async () => { byLabel("클라우드에서만 삭제")!.click(); });
    expect(props.onDeleteCloudOnly).toHaveBeenCalledTimes(1);
    await act(async () => { byLabel("삭제")!.click(); });
    expect(text()).toContain("이 기기와 클라우드에서 모두 지워지며");
  });

  it("for a cloud-only shot: offers the download, or says this device cannot hold it", async () => {
    const target = { id: "film-shot-c-3", title: "내 슛폼 3", onDevice: false, inCloud: true };
    const props = base({ cloudAvailable: true, target });
    await render(props);
    expect(text()).toContain("내 계정 전용 클라우드에만 있습니다");
    await act(async () => { byLabel("이 기기로 내려받기")!.click(); });
    expect(props.onDownload).toHaveBeenCalledTimes(1);

    const blocked = base({ cloudAvailable: true, target, canDownload: false });
    await render(blocked);
    expect(byLabel("이 기기로 내려받기")!.getAttribute("aria-disabled")).toBe("true");
    expect(text()).toContain("이 기기에서는 내려받을 수 없습니다");
  });

  it("locks every action while one is running and shows a failure without closing", async () => {
    const props = base({ cloudAvailable: true, busy: "keep", error: "클라우드에 올리지 못했습니다. 이 기기의 영상은 그대로입니다." });
    await render(props);
    expect(byLabel("클라우드에도 보관")!.getAttribute("aria-disabled")).toBe("true");
    expect(byLabel("삭제")!.getAttribute("aria-disabled")).toBe("true");
    expect(text()).toContain("클라우드에 올리지 못했습니다");
    await act(async () => { byLabel("클라우드에도 보관")!.click(); });
    expect(props.onKeepInCloud).not.toHaveBeenCalled();
  });
});
