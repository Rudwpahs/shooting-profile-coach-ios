import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AccessibilityInfo } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let resolveSystem: (value: boolean) => void = () => undefined;
let emitChange: (value: boolean) => void = () => undefined;
const isReduceMotionEnabled = vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(
  () => new Promise<boolean>((resolve) => { resolveSystem = resolve; }),
);
const addEventListener = vi.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((
  _event: string,
  handler: (value: boolean) => void,
) => {
  emitChange = handler;
  return { remove: vi.fn() };
}) as never);

const { useLiquidReduceMotion } = await import("@/components/ui/liquid/use-liquid-reduce-motion");

const seen: boolean[][] = [];
function Probe({ index, force }: { index: number; force?: boolean }) {
  const value = useLiquidReduceMotion(force);
  (seen[index] ??= []).push(value);
  return null;
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

const probes = () => (
  <>
    <Probe index={0} />
    <Probe index={1} />
    <Probe index={2} force={false} />
    <Probe index={3} force />
  </>
);

describe("useLiquidReduceMotion", () => {
  it("counts an unresolved system setting as reduced, then follows the system live", async () => {
    await act(async () => root.render(probes()));
    expect(seen[0].at(-1)).toBe(true);

    await act(async () => { resolveSystem(false); });
    expect(seen[0].at(-1)).toBe(false);
    expect(seen[1].at(-1)).toBe(false);

    await act(async () => { emitChange(true); });
    expect(seen[0].at(-1)).toBe(true);
    expect(seen[1].at(-1)).toBe(true);

    await act(async () => { emitChange(false); });
    expect(seen[0].at(-1)).toBe(false);
  });

  it("lets a caller force reduction but never override a user who asked for it", async () => {
    await act(async () => root.render(probes()));
    await act(async () => { resolveSystem(false); emitChange(false); });
    expect(seen[2].at(-1)).toBe(false); // `false` follows the system (motion allowed)
    expect(seen[3].at(-1)).toBe(true); // forcing adds reduction

    await act(async () => { emitChange(true); });
    expect(seen[2].at(-1)).toBe(true); // `false` cannot switch the user's Reduce Motion off
    expect(seen[3].at(-1)).toBe(true);
  });

  it("asks the system once and subscribes once, however many surfaces use it", async () => {
    await act(async () => root.render(probes()));
    expect(isReduceMotionEnabled).toHaveBeenCalledTimes(1);
    const subscriptions = addEventListener.mock.calls as unknown as [string, unknown][];
    expect(subscriptions.filter(([event]) => event === "reduceMotionChanged")).toHaveLength(1);
  });
});
