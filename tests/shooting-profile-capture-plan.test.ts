import { describe, expect, it } from "vitest";

import { buildCapturePlan } from "@/lib/shooting-profile/capture-plan";

describe("buildCapturePlan", () => {
  it("creates the required front and shooting-side slots for basic mode", () => {
    expect(buildCapturePlan("basic_1_plus_1")).toEqual([
      { id: "front-0", view: "front", takeIndex: 0, required: true },
      { id: "shooting_side-0", view: "shooting_side", takeIndex: 0, required: true },
    ]);
  });

  it("creates three front slots before three shooting-side slots for high accuracy mode", () => {
    expect(buildCapturePlan("high_accuracy_3_plus_3")).toEqual([
      { id: "front-0", view: "front", takeIndex: 0, required: true },
      { id: "front-1", view: "front", takeIndex: 1, required: true },
      { id: "front-2", view: "front", takeIndex: 2, required: true },
      { id: "shooting_side-0", view: "shooting_side", takeIndex: 0, required: true },
      { id: "shooting_side-1", view: "shooting_side", takeIndex: 1, required: true },
      { id: "shooting_side-2", view: "shooting_side", takeIndex: 2, required: true },
    ]);
  });
});
