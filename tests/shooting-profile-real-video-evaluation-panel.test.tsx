import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RealVideoEvaluationPanel } from "@/components/shooting-profile/real-video-evaluation-panel";
import { useRealVideoEvaluation } from "@/hooks/use-real-video-evaluation";
import {
  captureSessionReducer,
  createCaptureSession,
  type CaptureSessionAction,
  type CaptureSessionState,
  type CaptureSlotSourceV2,
} from "@/lib/shooting-profile/capture-session-reducer";
import type { CaptureProtocolV2, LandmarkSequenceV2 } from "@/lib/shooting-profile/types";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

type Session = { front: LandmarkSequenceV2[]; shootingSide: LandmarkSequenceV2[] };
type ShareResult = { action: "sharedAction" | "dismissedAction" };
type SharePayload = Readonly<{ url: string; title: string }>;

const CONSENT_RECORD_ID = "local-consent-20260902-001";

function sequenceForSlot(session: Session, slotId: string): LandmarkSequenceV2 {
  const [view, take] = slotId.split("-");
  const pool = view === "front" ? session.front : session.shootingSide;
  const sequence = pool.find((candidate) => candidate.takeIndex === Number(take));
  if (!sequence) throw new Error(`fixture has no ${slotId}`);
  return sequence;
}

function reviewState(
  mode: CaptureProtocolV2,
  session: Session,
  captureSource: CaptureSlotSourceV2 = "camera",
): CaptureSessionState {
  let state = captureSessionReducer(createCaptureSession(mode, "right"), { type: "START_COLLECTION" });
  for (const slot of state.slots) {
    const generation = slot.generation + 1;
    const requestId = `opaque_${slot.id.replace(/[^A-Za-z0-9]/g, "_")}_${generation}`;
    state = captureSessionReducer(state, {
      type: "SLOT_ACQUIRE_STARTED", slotId: slot.id, requestId, generation, captureSource,
    });
    state = captureSessionReducer(state, {
      type: "SLOT_ACCEPTED", slotId: slot.id, requestId, generation, sequence: sequenceForSlot(session, slot.id),
    });
  }
  state = captureSessionReducer(state, { type: "AGGREGATE_STARTED" });
  return captureSessionReducer(state, {
    type: "AGGREGATE_RECAPTURE_REQUIRED",
    sessionGeneration: state.sessionGeneration,
    reason: "다시 촬영하세요.",
    reasonCode: "cross_view_phase_mismatch",
  });
}

type HarnessProps = {
  initialState: CaptureSessionState;
  share: (payload: SharePayload) => Promise<ShareResult>;
  announce: (message: string) => void;
  written?: { json: string; cleaned: boolean }[];
  onControllerReady?: (bump: () => void) => void;
  onDispatchReady?: (dispatch: (action: CaptureSessionAction) => void) => void;
};

function Harness({ initialState, share, announce, written, onControllerReady, onDispatchReady }: HarnessProps) {
  const [state, setState] = useState(initialState);
  const controller = useRealVideoEvaluation({
    enabled: true,
    state,
    consentRecordId: CONSENT_RECORD_ID,
    // The report leaves as a temporary file; this fake records what was written
    // and whether it was cleaned up, without touching a real file system.
    prepareFile: async (json) => {
      const entry = { json, cleaned: false };
      written?.push(entry);
      return {
        uri: `file:///tmp/formpath-derived-evaluation-${written?.length ?? 0}.json`,
        cleanup: async () => { entry.cleaned = true; },
      };
    },
    share,
    announce,
  });
  onControllerReady?.(() => setState((current) => ({
    ...current,
    sessionGeneration: current.sessionGeneration + 1,
  })));
  onDispatchReady?.((action) => setState((current) => captureSessionReducer(current, action)));
  return <RealVideoEvaluationPanel controller={controller} />;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  vi.restoreAllMocks();
});

function render(element: ReactElement): void {
  act(() => {
    root.render(element);
  });
}

function control(label: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (!element) throw new Error(`no control labelled "${label}"`);
  return element;
}

function press(label: string): void {
  act(() => {
    control(label).click();
  });
}

async function pressAndSettle(label: string): Promise<void> {
  await act(async () => {
    control(label).click();
    await Promise.resolve();
  });
}

const CONSENT = "본인 촬영 동의를 확인했음을 표시";
const BUILD = "파생 평가 리포트 생성";
const SHARE = "파생 평가 리포트 공유 또는 저장";

const text = () => container.textContent ?? "";
const disabled = (label: string) => control(label).getAttribute("aria-disabled") === "true";

describe("real-video evaluation panel interaction", () => {
  it("renders a disabled build action until consent is confirmed by a real tap", async () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    render(<Harness
      announce={vi.fn()}
      initialState={reviewState("basic_1_plus_1", session)}
      share={vi.fn(async () => ({ action: "dismissedAction" as const }))}
    />);

    expect(text()).toContain("아직 리포트를 만들지 않았습니다");
    expect(control(CONSENT).getAttribute("aria-checked")).toBe("false");
    expect(disabled(BUILD)).toBe(true);
    expect(disabled(SHARE)).toBe(true);

    press(CONSENT);
    expect(control(CONSENT).getAttribute("aria-checked")).toBe("true");
    expect(disabled(BUILD)).toBe(false);
    expect(disabled(SHARE)).toBe(true);
  });

  it("builds once for consecutive taps and announces the result to VoiceOver", async () => {
    const announce = vi.fn();
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    render(<Harness
      announce={announce}
      initialState={reviewState("basic_1_plus_1", session)}
      share={vi.fn(async () => ({ action: "sharedAction" as const }))}
    />);
    press(CONSENT);

    // Three taps land before the first build settles; only one build may run.
    await act(async () => {
      control(BUILD).click();
      control(BUILD).click();
      control(BUILD).click();
      await Promise.resolve();
    });

    // A genuine front/side pair reconstructs, so the report's own pipeline is
    // complete even though the capture session itself ended in recapture.
    expect(text()).toContain("파생 리포트 준비됨");
    expect(text()).toContain("complete");
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0][0]).toContain("파생 리포트 준비됨");
    expect(disabled(SHARE)).toBe(false);
  });

  it("shows a busy build action and blocks a second build while one is in flight", async () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    render(<Harness
      announce={vi.fn()}
      initialState={reviewState("basic_1_plus_1", session)}
      share={vi.fn(async () => ({ action: "sharedAction" as const }))}
    />);
    press(CONSENT);

    act(() => {
      control(BUILD).click();
    });
    expect(text()).toContain("파생 리포트를 만드는 중입니다");
    expect(control(BUILD).getAttribute("aria-busy")).toBe("true");
    expect(disabled(BUILD)).toBe(true);
    expect(disabled(CONSENT)).toBe(true);

    await act(async () => {
      await Promise.resolve();
    });
    expect(text()).toContain("파생 리포트 준비됨");
    expect(control(BUILD).getAttribute("aria-busy")).toBe("false");
  });

  it("keeps a dismissed share separate from a successful one and from a failure", async () => {
    const announce = vi.fn();
    const written: { json: string; cleaned: boolean }[] = [];
    const share = vi.fn<(payload: SharePayload) => Promise<ShareResult>>();
    share.mockResolvedValueOnce({ action: "dismissedAction" });
    share.mockResolvedValueOnce({ action: "sharedAction" });
    share.mockRejectedValueOnce(new Error("share sheet unavailable"));

    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    render(<Harness
      announce={announce}
      initialState={reviewState("basic_1_plus_1", session)}
      share={share}
      written={written}
    />);
    press(CONSENT);
    await pressAndSettle(BUILD);

    await pressAndSettle(SHARE);
    expect(text()).toContain("공유를 취소했습니다");

    await pressAndSettle(SHARE);
    expect(text()).toContain("공유 시트로 전달했습니다");

    await pressAndSettle(SHARE);
    expect(text()).toContain("공유 시트를 열지 못했습니다");

    expect(share).toHaveBeenCalledTimes(3);
    expect(share.mock.calls[0][0].url).toMatch(/formpath-derived-evaluation-\d+\.json$/);
    // Every attempt writes its own temporary file and removes it afterwards.
    expect(written).toHaveLength(3);
    expect(written.every((entry) => entry.cleaned)).toBe(true);
    expect(written[0].json).toContain("two_view_evaluation_report_v1");
    expect(written[0].json).not.toMatch(/sourceLandmarks|timestampMs|file:\/\//);
    expect(announce.mock.calls.map((call) => call[0]).join("\n")).toContain("공유를 취소했습니다");
  });

  it("reports the excluded origin instead of building when the clip came from the library", async () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    render(<Harness
      announce={vi.fn()}
      initialState={reviewState("basic_1_plus_1", session, "library")}
      share={vi.fn(async () => ({ action: "sharedAction" as const }))}
    />);

    expect(text()).toContain("이 앱에서 직접 촬영한 클립만 사용합니다");
    press(CONSENT);
    expect(disabled(BUILD)).toBe(true);
  });

  it("stops sharing a report that no longer describes the clips in the session", async () => {
    // RETAKE_SLOT does not advance sessionGeneration, so a report built from the
    // previous pair must be invalidated by the attempt set itself; otherwise the
    // owner could export evidence describing clips the session no longer holds.
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    let dispatch: (action: CaptureSessionAction) => void = () => {};
    render(<Harness
      announce={vi.fn()}
      initialState={reviewState("basic_1_plus_1", session)}
      onDispatchReady={(fn) => { dispatch = fn; }}
      share={vi.fn(async () => ({ action: "sharedAction" as const }))}
    />);
    press(CONSENT);
    await pressAndSettle(BUILD);
    expect(disabled(SHARE)).toBe(false);

    act(() => dispatch({ type: "RETAKE_SLOT", slotId: "shooting_side-0" }));

    expect(text()).toContain("아직 리포트를 만들지 않았습니다");
    expect(disabled(SHARE)).toBe(true);
    expect(disabled(BUILD)).toBe(true);
  });

  it("clears a built report when the capture session generation advances", async () => {
    const session = syntheticLandmarkSession({ mode: "basic_1_plus_1" });
    let bumpGeneration = () => {};
    render(<Harness
      announce={vi.fn()}
      initialState={reviewState("basic_1_plus_1", session)}
      onControllerReady={(bump) => { bumpGeneration = bump; }}
      share={vi.fn(async () => ({ action: "sharedAction" as const }))}
    />);
    press(CONSENT);
    await pressAndSettle(BUILD);
    expect(text()).toContain("파생 리포트 준비됨");

    act(() => bumpGeneration());

    expect(text()).toContain("아직 리포트를 만들지 않았습니다");
    expect(control(CONSENT).getAttribute("aria-checked")).toBe("false");
    expect(disabled(BUILD)).toBe(true);
    expect(disabled(SHARE)).toBe(true);
  });
});
