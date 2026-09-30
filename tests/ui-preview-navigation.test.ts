import { describe, expect, it } from "vitest";

import {
  backUiPreview,
  createUiPreviewNavigation,
  currentUiPreviewRoute,
  openUiPreview,
} from "@/lib/dev/ui-preview-navigation";

describe("interactive UI preview navigation", () => {
  it("starts as an already signed-in Home scene", () => {
    const navigation = createUiPreviewNavigation();

    expect(currentUiPreviewRoute(navigation)).toEqual({ screen: "home", state: "ready" });
  });

  it("opens app-like preview screens and returns to the previous scene", () => {
    const home = createUiPreviewNavigation();
    const profile = openUiPreview(home, { screen: "profile", state: "ready" });
    const analysis = openUiPreview(profile, { screen: "analysis", state: "ready", itemId: "demo-fixture-001" });

    expect(currentUiPreviewRoute(analysis)).toEqual({ screen: "analysis", state: "ready", itemId: "demo-fixture-001" });
    expect(currentUiPreviewRoute(backUiPreview(analysis))).toEqual({ screen: "profile", state: "ready" });
  });

  it("keeps Home stable when back is pressed at the root", () => {
    const home = createUiPreviewNavigation();

    expect(backUiPreview(home)).toEqual(home);
  });
});
