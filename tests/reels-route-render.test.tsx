import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: () => true };
const params: { start?: string } = {};
const storage = new Map<string, string>();
const filmStorage = { fail: false };

vi.mock("expo-router", () => ({
  useRouter: () => router,
  useLocalSearchParams: () => params,
  // The route registers a focus effect; in jsdom the screen is simply focused.
  useFocusEffect: (effect: () => void | (() => void)) => { void effect; },
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }) }));
vi.mock("@/hooks/use-app-state", () => ({ useAppStateStatus: () => "active" }));
vi.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => false }));
vi.mock("@/lib/firebase-auth", () => ({ useFirebaseAuth: () => ({ user: null, loading: false, configured: true }) }));
vi.mock("@/hooks/use-latest-representative-profile", () => ({ useLatestRepresentativeProfile: () => ({ status: "signed-out" }) }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => {
      if (filmStorage.fail && key.startsWith("hoophub:film-shots:")) throw new Error("storage unavailable");
      return storage.get(key) ?? null;
    },
    setItem: async (key: string, value: string) => { storage.set(key, value); },
    removeItem: async (key: string) => { storage.delete(key); },
  },
}));
vi.mock("@/components/shooting-profile/film-space-viewer", () => ({
  FilmSpaceViewer: ({ clip }: { clip: { slotId: string } }) => <div data-testid="film-space-viewer">film {clip.slotId}</div>,
}));
vi.mock("react-native-svg", () => ({
  default: ({ children }: { children?: React.ReactNode }) => <svg data-testid="skeleton-svg">{children}</svg>,
  Circle: () => <circle />,
  Line: () => <line />,
}));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({ default: ({ name }: { name: string }) => <span data-icon={name} /> }));
vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(async () => undefined),
  impactAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light" },
  NotificationFeedbackType: { Success: "success" },
}));

// react-native-web sizes `useWindowDimensions` from the document element, which jsdom reports as 0×0; the feed
// renders nothing for an empty viewport, so give the route a phone-sized one before it loads.
Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 375 });
Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: 700 });

const { default: ReelsRoute } = await import("@/app/reels");

function seedFilmShot(id: string, title: string) {
  const shot = {
    version: "film_shot_v1",
    id,
    title,
    createdAtMs: Date.UTC(2026, 9, 1),
    clips: [{ slotId: "front-0", view: "front", takeIndex: 0, uri: `blob:https://rudwpahs.github.io/${id}`, durationMs: 4433, width: 512, height: 910 }],
  };
  storage.set(`hoophub:film-shots:v1:shot:${id}`, JSON.stringify(shot));
  storage.set("hoophub:film-shots:v1:index", JSON.stringify([id]));
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  storage.clear();
  filmStorage.fail = false;
  router.back.mockClear();
  router.replace.mockClear();
  delete params.start;
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const byTestId = (id: string) => Array.from(container.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];
const byLabel = (label: string) => container.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
const render = () => act(async () => { root.render(<ReelsRoute />); });
async function settle(probe: () => number) {
  let quiet = 0;
  let last = probe();
  for (let round = 0; round < 40 && quiet < 5; round += 1) {
    await act(async () => { await Promise.resolve(); });
    const next = probe();
    quiet = next === last ? quiet + 1 : 0;
    last = next;
  }
}

describe("reels route deep link to a film shot", () => {
  it("never falls through to another reel when the film store cannot be read: it shows the store failure and recovers on retry", async () => {
    seedFilmShot("film-shot-a-1", "내 슛폼 1");
    filmStorage.fail = true;
    params.start = "film:film-shot-a-1";
    await render();
    await settle(() => byTestId("film-reel-storage-error").length);

    expect(byTestId("film-reel-storage-error")).toHaveLength(1);
    expect(byTestId("reels-feed")).toHaveLength(0);
    expect(byTestId("reel-item-reference")).toHaveLength(0);
    expect(container.textContent).toContain("영상이 삭제된 것은 아닙니다");

    filmStorage.fail = false;
    await act(async () => { byLabel("다시 읽기")!.click(); });
    await settle(() => byTestId("reel-item-film").length);
    expect(byTestId("film-reel-storage-error")).toHaveLength(0);
    expect(byTestId("reel-item-film")).toHaveLength(1);
    expect(byTestId("film-space-viewer")).toHaveLength(1);
  });

  it("tells a shot that is really not on this device apart from a store failure", async () => {
    params.start = "film:film-shot-gone";
    await render();
    await settle(() => byTestId("film-reel-missing").length);
    expect(byTestId("film-reel-missing")).toHaveLength(1);
    expect(byTestId("film-reel-storage-error")).toHaveLength(0);
    expect(byTestId("reels-feed")).toHaveLength(0);
    expect(container.textContent).toContain("이 영상은 이 기기에 없습니다");
    await act(async () => { byLabel("닫기")!.click(); });
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("opens the feed on the film shot once the device list is read", async () => {
    seedFilmShot("film-shot-a-1", "내 슛폼 1");
    params.start = "film:film-shot-a-1";
    await render();
    await settle(() => byTestId("reel-item-film").length);
    expect(byTestId("reels-feed")).toHaveLength(1);
    const active = byTestId("reel-tap").find((node) => node.getAttribute("aria-disabled") !== "true");
    expect(active?.getAttribute("aria-label")).toContain("내 슛폼 1 영상 릴");
  });
});
