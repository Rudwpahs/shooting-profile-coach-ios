import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CoachRequestV1 } from "@/lib/coach/contract";
import type { CoachProviderResult } from "@/lib/coach/provider";
import type { UserReel } from "@/lib/feed/reel-model";
import type { RepresentativePose4DV2 } from "@/lib/shooting-profile/types";

// Tells React 19 this is a test environment so act() does not warn on every update.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const push = vi.fn();
const navigate = vi.fn();
const replace = vi.fn();
const authState: { user: { uid: string; email: string } | null; loading: boolean; configured: boolean; profileSync: null } = {
  user: null,
  loading: false,
  configured: true,
  profileSync: null,
};
let latestState: unknown = { status: "signed-out" };
const flags = { captureV2: true, profileV2: true, representative4DViewer: true, realVideoEvaluation: false };

vi.mock("expo-router", () => ({
  useRouter: () => ({ push, navigate, replace, back: vi.fn(), canGoBack: () => true }),
  Redirect: () => null,
  useLocalSearchParams: () => ({}),
}));
vi.mock("expo-haptics", () => ({ impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: "light" } }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("react-native-svg", () => ({
  default: ({ children, ...props }: { children?: React.ReactNode; width?: number; height?: number }) => <svg data-testid="skeleton-svg" width={props.width} height={props.height}>{children}</svg>,
  Circle: () => <circle />,
  Line: () => <line />,
}));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({
  default: ({ name }: { name: string }) => <span data-icon={name} />,
}));
// Home mounts the Motion Lift layer only while paused; the gesture library needs a native runtime, so a stub builder stands in.
vi.mock("react-native-gesture-handler", () => {
  const builder: Record<string, unknown> = new Proxy({}, { get: () => () => builder });
  return { Gesture: { Pan: () => builder }, GestureDetector: ({ children }: { children?: React.ReactNode }) => <>{children}</> };
});
// The coach behind Home is swappable; the tests decide whether it answers or is unavailable.
let coachResult: CoachProviderResult | null = null;
vi.mock("@/lib/feed/home-coach-provider", () => ({
  createHomeCoachProvider: () => ({
    id: "deterministic_v1",
    coach: async (request: CoachRequestV1) => coachResult ?? { status: "ok", response: deterministicCoachResponse(request) },
  }),
}));
// Public reels and the saved-post store enter Home through one dependency object; the tests decide what it holds.
vi.mock("expo-video", () => ({
  useVideoPlayer: () => ({ play: () => undefined, pause: () => undefined, loop: false, muted: false }),
  VideoView: () => <div data-testid="video-view" />,
}));
const publicReelsState = { status: "unavailable" as "unavailable" | "ready", reels: [] as UserReel[], savedPostIds: [] as string[] };
const social = { saveReelMoment: vi.fn(async () => undefined), unsaveReel: vi.fn(async () => undefined) };
vi.mock("@/hooks/use-home-public-reels", () => ({
  useHomePublicReels: () => publicReelsState,
  homeSocialDependencies: () => ({ social, media: { fetchMotionPacket: async () => null, resolveVideoUri: async () => null } }),
}));
vi.mock("@expo/vector-icons/MaterialIcons", () => ({
  default: ({ name }: { name: string }) => <span data-icon={name} />,
}));
vi.mock("@/lib/firebase-auth", () => ({
  useFirebaseAuth: () => ({ ...authState, signIn: vi.fn(), signUp: vi.fn(), logout: vi.fn() }),
}));
vi.mock("@/lib/firebase-private-data", () => ({
  listFirebasePrivatePoses: vi.fn(async () => []),
  removeFirebasePrivatePose: vi.fn(async () => undefined),
}));
vi.mock("@/lib/firebase-shooting-profiles", () => ({
  listShootingProfilesV2: vi.fn(async () => []),
  getShootingProfileV2: vi.fn(async () => null),
  deleteShootingProfileV2: vi.fn(async () => undefined),
  resumePendingShootingProfileDeletionsV2: vi.fn(async () => undefined),
}));
vi.mock("@/hooks/use-latest-representative-profile", () => ({
  useLatestRepresentativeProfile: () => latestState,
}));
vi.mock("@/lib/feature-flags", () => ({ FORMPATH_FLAGS: flags }));
// Native pose capture pulls in expo-modules-core, which has no jsdom runtime.
vi.mock("@/components/private-pose-capture", () => ({ PrivatePoseCapture: () => null }));
vi.mock("@/components/pose-motion-viewer", () => ({ PoseMotionViewer: () => null }));
vi.mock("@/lib/profile-store", () => ({
  useProfile: () => ({ profile: { goal: "consistency" }, ready: true, updateProfile: vi.fn(), clearProfile: vi.fn() }),
}));
vi.mock("@/components/screen-container", () => ({
  ScreenContainer: ({ children, onLayout }: { children?: React.ReactNode; onLayout?: (event: { nativeEvent: { layout: { width: number } } }) => void }) => {
    onLayout?.({ nativeEvent: { layout: { width: 375 } } });
    return <div>{children}</div>;
  },
}));

const shootingProfiles = await import("@/lib/firebase-shooting-profiles");
const { HoopHubTabBar } = await import("@/components/hoophub-tab-bar");
const { default: ExploreScreen } = await import("@/app/(tabs)/explore");
const { default: HomeScreen } = await import("@/app/(tabs)/index");
const { default: ProfileScreen } = await import("@/app/(tabs)/profile");
const { AnalysisDetails, AnalysisEvidence, AnalysisSummaryLine } = await import("@/components/analysis/analysis-layers");
const { MotionGrid } = await import("@/components/profile/motion-grid");
const { buildTwoViewRepresentativeProfile } = await import("@/lib/shooting-profile/two-view-pipeline");
const { deterministicCoachResponse } = await import("@/lib/coach/deterministic-provider");
const { syntheticLandmarkSession } = await import("@/tests/fixtures/synthetic-landmark-sequence");

function syntheticProfile(): RepresentativePose4DV2 {
  const session = syntheticLandmarkSession({ mode: "basic_1_plus_1", shootingHand: "right" });
  const result = buildTwoViewRepresentativeProfile({
    mode: "basic_1_plus_1",
    shootingHand: "right",
    attempts: [...session.front, ...session.shootingSide].map((sequence) => ({ id: `${sequence.view}-${sequence.takeIndex}`, sequence })),
  });
  if (result.status !== "complete") throw new Error("fixture must reconstruct");
  return result.profile;
}
const profile = syntheticProfile();
const summary = (id: string, mode: "basic_1_plus_1" | "high_accuracy_3_plus_3" = "basic_1_plus_1") => ({
  id, mode, shootingHand: "right" as const, confidence: 0.65, createdAt: { toDate: () => new Date(2026, 8, 6) } as never,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  push.mockClear();
  navigate.mockClear();
  authState.user = null;
  authState.loading = false;
  latestState = { status: "signed-out" };
  flags.profileV2 = true;
  flags.representative4DViewer = true;
  vi.mocked(shootingProfiles.listShootingProfilesV2).mockReset().mockImplementation(async () => []);
  vi.mocked(shootingProfiles.getShootingProfileV2).mockReset().mockImplementation(async () => null);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(element: React.ReactElement) {
  await act(async () => root.render(element));
  await act(async () => { await Promise.resolve(); });
}

/** Flushes chained async effects until `probe` stops changing (five quiet rounds). */
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

/** A long press the way react-native-web produces one: press, hold past the delay, release. */
async function longPress(el: HTMLElement) {
  await act(async () => { el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); });
  await act(async () => { vi.advanceTimersByTime(1000); });
  await act(async () => { el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 })); });
}

const byRole = (role: string) => Array.from(container.querySelectorAll(`[role="${role}"]`)) as HTMLElement[];
const byLabel = (label: string) => container.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
const labelsContaining = (fragment: string) => Array.from(container.querySelectorAll("[aria-label]")).filter((el) => (el.getAttribute("aria-label") ?? "").includes(fragment)) as HTMLElement[];
const click = async (el: HTMLElement | null) => {
  expect(el).not.toBeNull();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};

describe("bottom bar", () => {
  it("renders icon-only tabs with the selected state and a labelled capture action", async () => {
    const state = { index: 1, routes: [{ key: "a", name: "index" }, { key: "b", name: "explore" }, { key: "c", name: "profile" }] };
    await render(<HoopHubTabBar state={state as never} navigation={{ navigate } as never} descriptors={{} as never} insets={{ top: 0, bottom: 0, left: 0, right: 0 }} />);

    const tabs = byRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual(["홈", "탐색", "프로필"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(container.textContent).toBe("");

    await click(byLabel("슛폼 촬영"));
    expect(push).toHaveBeenCalledWith("/private-capture");
    await click(tabs[2]);
    expect(navigate).toHaveBeenCalledWith("profile");
  });
});

describe("explore", () => {
  it("shows one tile per shot phase of the anonymous reference and switches views", async () => {
    await render(<ExploreScreen />);

    const tiles = labelsContaining("위상 열기");
    expect(tiles).toHaveLength(5);
    expect(tiles.every((tile) => tile.getAttribute("aria-label")?.startsWith("MOTION 01"))).toBe(true);
    expect(container.querySelectorAll('[data-testid="skeleton-svg"]').length).toBeGreaterThanOrEqual(5);
    expect(container.textContent).toContain("MOTION 01 · CMU optical mocap");
    expect(container.textContent).not.toMatch(/Curry|Paul George/);

    expect(byLabel("사선 시점")?.getAttribute("aria-selected")).toBe("true");
    await click(byLabel("측면 시점"));
    expect(byLabel("측면 시점")?.getAttribute("aria-selected")).toBe("true");
    await click(tiles[0]);
    expect(push).toHaveBeenCalledWith("/library");
  });
});

describe("profile", () => {
  it("signed out: keeps the skeleton frame, dashes, one goal line and the account form; no email identity", async () => {
    await render(<ProfileScreen />);

    expect(byLabel("로그인 후 촬영")).not.toBeNull();
    expect(container.textContent).toContain("목표 · 일관성");
    expect(container.textContent).toContain("—");
    expect(byLabel("이메일")).not.toBeNull();
    expect(byLabel("비밀번호")).not.toBeNull();
    expect(byLabel("계정 로그인")).not.toBeNull();
    expect(container.textContent).not.toMatch(/PRIVATE VAULT|@/);
  });

  it("loading: announces the account check and shows no records", async () => {
    authState.loading = true;
    await render(<ProfileScreen />);
    expect(container.textContent).toContain("계정 상태를 확인하는 중");
    expect(labelsContaining("위상 결합 4D 추정")).toHaveLength(0);
  });

  it("signed in with nothing saved: intentional empty hero and grid line, account panel hidden until asked", async () => {
    authState.user = { uid: "owner-1", email: "owner@example.com" };
    await render(<ProfileScreen />);

    expect(byLabel("첫 슛폼을 촬영해 보세요")).not.toBeNull();
    expect(container.textContent).toContain("첫 슛폼을 촬영하면 여기에 쌓입니다");
    expect(container.textContent).not.toContain("owner@example.com");
    await click(byLabel("계정"));
    expect(container.textContent).toContain("owner@example.com");
    expect(byLabel("계정 로그아웃")).not.toBeNull();
  });

  it("signed in with records: fetches each tile's full record exactly once", async () => {
    authState.user = { uid: "owner-1", email: "owner@example.com" };
    vi.mocked(shootingProfiles.listShootingProfilesV2).mockImplementation(async () => [summary("abc123"), summary("def456"), summary("ghi789")]);
    // Each read resolves only when the test says so, so React renders between
    // reads the way it does behind real Firestore latency.
    const pending: (() => void)[] = [];
    vi.mocked(shootingProfiles.getShootingProfileV2).mockImplementation(() => new Promise((resolve) => {
      pending.push(() => resolve({ profile, shootingHand: "right", confidence: 0.65 }));
    }));
    await render(<ProfileScreen />);
    await settle(() => pending.length);
    for (let guard = 0; guard < 12 && pending.length > 0; guard += 1) {
      const resolveNext = pending.shift()!;
      await act(async () => { resolveNext(); });
      await settle(() => pending.length);
    }

    expect(labelsContaining("위상 결합 4D 추정 · 실측 3D 아님")).toHaveLength(3);
    expect(vi.mocked(shootingProfiles.getShootingProfileV2).mock.calls.map(([, id]) => id)).toEqual(["abc123", "def456", "ghi789"]);
  });

  it("representative viewer off: tiles stay visible but disabled, with the reason in the label", async () => {
    flags.representative4DViewer = false;
    authState.user = { uid: "owner-1", email: "owner@example.com" };
    vi.mocked(shootingProfiles.listShootingProfilesV2).mockImplementation(async () => [summary("abc123")]);
    vi.mocked(shootingProfiles.getShootingProfileV2).mockImplementation(async () => ({ profile, shootingHand: "right", confidence: 0.65 }));
    await render(<ProfileScreen />);
    await settle(() => vi.mocked(shootingProfiles.getShootingProfileV2).mock.calls.length);

    const tile = labelsContaining("대표 뷰어 꺼짐")[0];
    expect(tile?.getAttribute("aria-disabled")).toBe("true");
    await click(tile);
    expect(push).not.toHaveBeenCalled();
  });

  it("profile persistence off: no list read, no grid, an intentional empty hero", async () => {
    flags.profileV2 = false;
    authState.user = { uid: "owner-1", email: "owner@example.com" };
    await render(<ProfileScreen />);

    expect(vi.mocked(shootingProfiles.listShootingProfilesV2)).not.toHaveBeenCalled();
    expect(labelsContaining("위상 결합 4D 추정")).toHaveLength(0);
    expect(byLabel("첫 슛폼을 촬영해 보세요")).not.toBeNull();
  });
});

describe("motion grid", () => {
  it("labels every tile with mode, date, band and the boundary, and marks a deleting tile busy", async () => {
    const records = [summary("abc123"), summary("def456", "high_accuracy_3_plus_3")];
    await render(<MotionGrid canOpen deletingProfileId="def456" error={null} glyphs={{ abc123: { profile, shootingHand: "right", confidence: 0.65 } }} loading={false} onDelete={vi.fn()} onOpen={vi.fn()} records={records} width={375} />);

    const tiles = labelsContaining("위상 결합 4D 추정 · 실측 3D 아님");
    expect(tiles).toHaveLength(2);
    expect(tiles[0].getAttribute("aria-label")).toContain("대표 스냅샷 추정 · 반복성 측정 아님");
    expect(tiles[1].getAttribute("aria-label")).toContain("3회 반복 대표 슛폼");
    expect(tiles[1].getAttribute("aria-busy")).toBe("true");
    expect(tiles[1].getAttribute("aria-disabled")).toBe("true");
    expect(container.textContent).toContain("삭제 중");
    expect(container.textContent).toContain("길게 눌러 삭제");
    expect(container.textContent).not.toMatch(/\d+%/);
  });

  it("shows the empty and error states as single lines", async () => {
    await render(<MotionGrid canOpen deletingProfileId={null} error={null} glyphs={{}} loading={false} onDelete={vi.fn()} onOpen={vi.fn()} records={[]} width={375} />);
    expect(container.textContent).toContain("첫 슛폼을 촬영하면 여기에 쌓입니다");
    await render(<MotionGrid canOpen deletingProfileId={null} error="연결 오류" glyphs={{}} loading={false} onDelete={vi.fn()} onOpen={vi.fn()} records={[]} width={375} />);
    expect(container.querySelector('[aria-live="assertive"]')?.textContent).toBe("연결 오류");
  });

  it("offers one delete at a time: a long press on another tile is ignored while a delete is in flight", async () => {
    vi.useFakeTimers();
    try {
      const onDelete = vi.fn();
      const records = [summary("abc123"), summary("def456")];
      const grid = (deletingProfileId: string | null) => (
        <MotionGrid canOpen deletingProfileId={deletingProfileId} error={null} glyphs={{}} loading={false} onDelete={onDelete} onOpen={vi.fn()} records={records} width={375} />
      );

      await render(grid(null));
      await longPress(labelsContaining("대표 스냅샷")[0]);
      expect(onDelete).toHaveBeenCalledWith("abc123");

      await render(grid("def456"));
      await longPress(labelsContaining("대표 스냅샷")[0]);
      expect(onDelete).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("home", () => {
  const ready = () => {
    authState.user = { uid: "owner-1", email: "owner@example.com" };
    latestState = {
      status: "ready",
      summary: { id: "abc123def456", mode: "basic_1_plus_1", shootingHand: "right", confidence: 0.65, createdAt: { toDate: () => new Date() } },
      record: { profile, shootingHand: "right", confidence: 0.65 },
    };
  };
  const tap = () => container.querySelector('[data-testid="reel-tap"]') as HTMLElement | null;
  const feedCount = () => tap()?.getAttribute("aria-valuetext") ?? "";
  const activeKind = () => (container.querySelector('[data-testid^="reel-item-"]')?.getAttribute("data-testid") ?? "").replace("reel-item-", "");

  it("signed out: one status line, one capture action, and the reference reel playing full height", async () => {
    coachResult = null;
    await render(<HomeScreen />);
    await settle(() => container.innerHTML.length);

    expect(byLabel("슛폼 촬영")).not.toBeNull();
    expect(container.textContent).toContain("로그인 후 촬영");
    expect(activeKind()).toBe("reference");
    expect(feedCount()).toBe("1 / 1");
    expect(tap()?.getAttribute("aria-label")).toContain("MOTION 01 참조 릴, 1/1, 재생 중");
    await click(byLabel("MOTION 01 참조 모션 열기"));
    expect(push).toHaveBeenCalledWith("/library");
    expect(container.textContent).not.toMatch(/Curry|Paul George|TODAY|NEXT UP|목표 ·/);
    expect(container.querySelector('[data-testid="reel-chrome"]')?.textContent).not.toMatch(/\d+\s*%|코치/);
  });

  it("ready: my reel leads with honest recency and band, the coaching moment follows, then the reference", async () => {
    coachResult = null;
    ready();
    await render(<HomeScreen />);
    await settle(() => container.innerHTML.length);

    expect(activeKind()).toBe("user");
    expect(container.textContent).toContain("내 슛폼 · 오늘");
    expect(container.textContent).toContain("Basic · 4D 추정 · 실측 3D 아님");
    expect(container.textContent).not.toContain("로그인 후 촬영");
    expect(feedCount()).toBe("1 / 3");
    expect(byLabel("내 슛폼 프로필 열기")).not.toBeNull();
    expect(byLabel("저장")).not.toBeNull();
    await click(byLabel("내 대표 슛폼 분석 열기"));
    expect(push).toHaveBeenCalledWith("/private-analysis/abc123def456");
    // The default reel carries no analysis: no coach text, no percentages on its chrome.
    expect(container.querySelector('[data-testid="reel-chrome"]')?.textContent).not.toMatch(/\d+\s*%|코치/);
  });

  it("ready while the coach is unavailable: the coaching moment is skipped and the feed is simply the reels", async () => {
    coachResult = { status: "unavailable", reason: "offline", retryable: true, detail: null };
    ready();
    await render(<HomeScreen />);
    await settle(() => container.innerHTML.length);

    expect(activeKind()).toBe("user");
    expect(feedCount()).toBe("1 / 2");
    expect(container.textContent).not.toContain("코치");
  });

  it("ready with the representative viewer off: no analysis action (the route would only redirect), profile action kept", async () => {
    coachResult = null;
    flags.representative4DViewer = false;
    ready();
    await render(<HomeScreen />);
    await settle(() => container.innerHTML.length);

    expect(byLabel("내 대표 슛폼 분석 열기")).toBeNull();
    expect(byLabel("내 슛폼 프로필 열기")).not.toBeNull();
  });

  it("every other state keeps the feed video-first with one honest line", async () => {
    coachResult = null;
    for (const [state, line] of [["loading", "내 슛폼을 불러오는 중"], ["empty", "첫 슛폼을 촬영해 보세요"], ["error", "내 슛폼을 불러오지 못했습니다"]] as const) {
      authState.user = { uid: "owner-1", email: "owner@example.com" };
      latestState = { status: state };
      await render(<HomeScreen />);
      await settle(() => container.innerHTML.length);
      expect(container.textContent, state).toContain(line);
      expect(activeKind(), state).toBe("reference");
      expect(feedCount(), state).toBe("1 / 1");
    }
  });

  it("public reels from the backend follow my reel and the coaching moment; saving my own reel stays session-only", async () => {
    coachResult = null;
    ready();
    publicReelsState.status = "ready";
    publicReelsState.reels = [
      { kind: "user", id: "post-post00001", author: "공개 슛폼", meta: "어제", caption: "공개 게시물 · 영상", motion: { source: "public", postId: "post00001", durationMs: 12000, packet: null, video: { uri: "https://storage.example.test/video.mp4" } } },
      { kind: "user", id: "post-post00002", author: "공개 슛폼", meta: "어제", caption: "공개 게시물 · 미디어 준비 중", motion: { source: "public", postId: "post00002", durationMs: 8000, packet: null, video: null } },
    ];
    publicReelsState.savedPostIds = ["post00002"];
    social.saveReelMoment.mockClear();
    try {
      await render(<HomeScreen />);
      await settle(() => container.innerHTML.length);
      expect(activeKind()).toBe("user");
      expect(feedCount()).toBe("1 / 5");
      expect(container.textContent).toContain("내 슛폼 · 오늘");
      await click(byLabel("저장"));
      expect(byLabel("저장 취소")).not.toBeNull();
      expect(social.saveReelMoment).not.toHaveBeenCalled();
    } finally {
      publicReelsState.status = "unavailable";
      publicReelsState.reels = [];
      publicReelsState.savedPostIds = [];
    }
  });
});

describe("analysis layers", () => {
  it("keeps the percentage and evidence behind disclosures and distinguishes a retake result", async () => {
    await render(
      <>
        <AnalysisSummaryLine profile={profile} />
        <AnalysisDetails confidence={0.65} profile={profile} shootingHand="right" />
        <AnalysisEvidence profile={profile} />
      </>,
    );

    expect(container.textContent).toContain("Basic · 대표 스냅샷");
    expect(container.textContent).toContain("가장 불확실한 관절");
    expect(container.textContent).not.toContain("65%");
    await click(byLabel("자세히 펼치기"));
    expect(container.textContent).toContain("65%");
    expect(byLabel("자세히 접기")?.getAttribute("aria-expanded")).toBe("true");
    await click(byLabel("위상 · 각도 · 증거 펼치기"));
    expect(labelsContaining("최대 콘")).toHaveLength(12);
    expect(container.textContent).toContain("위상 결합 4D 추정 · 실측 3D 아님");

    await render(<AnalysisSummaryLine profile={{ ...profile, quality: { passed: false, reasons: ["x"] } }} />);
    expect(container.textContent).toContain("재촬영 필요");
  });
});
