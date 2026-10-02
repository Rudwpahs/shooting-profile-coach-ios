import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Text } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GlassSurface } from "@/components/glass/glass-surface.web";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const originalCss = Object.getOwnPropertyDescriptor(globalThis, "CSS");
let container: HTMLDivElement;
let root: Root;
// react-native-web warns once per process, so the spy must be in place before the first render here.
const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeEach(() => {
  Object.defineProperty(globalThis, "CSS", { configurable: true, value: { supports: () => true } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  warn.mockClear();
  error.mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  if (originalCss) Object.defineProperty(globalThis, "CSS", originalCss);
  else Reflect.deleteProperty(globalThis, "CSS");
});

describe("GlassSurface web tint", () => {
  it("is decorative, non-interactive and hidden from assistive technology without the deprecated pointerEvents prop", async () => {
    await act(async () => {
      root.render(
        <GlassSurface variant="bar" testID="glass">
          <Text>Hoop Hub</Text>
        </GlassSurface>,
      );
    });
    const surface = container.querySelector('[data-testid="glass"]') as HTMLElement;
    expect(surface).not.toBeNull();
    // Enhanced after mount: the tint is the first child, the content follows.
    expect(surface.childElementCount).toBe(2);
    const tint = surface.firstElementChild as HTMLElement;
    expect(tint.getAttribute("aria-hidden")).toBe("true");
    expect(getComputedStyle(tint).pointerEvents).toBe("none");
    expect(getComputedStyle(tint).position).toBe("absolute");
    expect(tint.textContent).toBe("");

    const messages = [...warn.mock.calls, ...error.mock.calls].map((call) => call.map(String).join(" "));
    expect(messages.filter((message) => /pointerEvents/.test(message))).toEqual([]);
  });
});
