import { describe, expect, it } from "vitest";

import {
  createPreviewSessionState,
  previewSessionReducer,
} from "@/lib/preview/preview-session-state";

describe("preview session runtime", () => {
  it("adds one captured representative without mutating the canonical session", () => {
    const initial = createPreviewSessionState();
    const next = previewSessionReducer(initial, { type: "capture-complete" });

    expect(next.representatives).toHaveLength(initial.representatives.length + 1);
    expect(next.representatives).not.toBe(initial.representatives);
    expect(initial.representatives.every((item) => item.id.startsWith("preview_fixture_"))).toBe(true);
    expect(next.representatives.at(0)?.id).toMatch(/^preview_fixture_capture_/);
  });

  it("resets back to a fresh canonical synthetic session", () => {
    const initial = createPreviewSessionState();
    const captured = previewSessionReducer(initial, { type: "capture-complete" });
    const reset = previewSessionReducer(captured, { type: "reset" });

    expect(reset.representatives).toHaveLength(initial.representatives.length);
    expect(reset.representatives.map((item) => item.id)).toEqual(initial.representatives.map((item) => item.id));
    expect(reset).not.toBe(initial);
  });
});
