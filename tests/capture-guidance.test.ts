import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  captureGuidanceForSlot,
  captureProtocolPresentation,
  captureViewGuidance,
  describeCameraYaw,
} from "@/lib/shooting-profile/capture-guidance";
import { buildCapturePlan } from "@/lib/shooting-profile/capture-plan";

describe("capture guidance: protocol data, not layout", () => {
  it("derives the views to present from the capture plan, in plan order, once per view", () => {
    const basic = captureProtocolPresentation("basic_1_plus_1", "right");
    const high = captureProtocolPresentation("high_accuracy_3_plus_3", "left");

    expect(basic.views.map((view) => view.view)).toEqual(["front", "shooting_side"]);
    expect(high.views.map((view) => view.view)).toEqual(["front", "shooting_side"]);
    expect(basic.takesPerView).toBe(1);
    expect(high.takesPerView).toBe(3);
    expect(basic.modeLine).toContain("1");
    expect(high.modeLine).toContain("3");
  });

  it("tells a shooter where to stand and where the camera goes, in one line each, in their own handedness", () => {
    const right = captureViewGuidance("shooting_side", "right");
    const left = captureViewGuidance("shooting_side", "left");

    expect(right.camera).toContain("오른쪽");
    expect(left.camera).toContain("왼쪽");
    for (const guidance of [right, left, captureViewGuidance("front", "right")]) {
      expect(guidance.title.length).toBeGreaterThan(0);
      expect(guidance.stand).not.toContain("\n");
      expect(guidance.camera).not.toContain("\n");
      expect(guidance.stand.length).toBeLessThanOrEqual(40);
      expect(guidance.camera.length).toBeLessThanOrEqual(40);
    }
  });

  it("maps every slot of both protocols to guidance without inventing views", () => {
    for (const mode of ["basic_1_plus_1", "high_accuracy_3_plus_3"] as const) {
      for (const slot of buildCapturePlan(mode)) {
        expect(captureGuidanceForSlot(slot, "right").view).toBe(slot.view);
      }
    }
  });

  it("carries no camera-yaw requirement for the current protocol, and renders yaw only when a protocol declares one", () => {
    for (const mode of ["basic_1_plus_1", "high_accuracy_3_plus_3"] as const) {
      for (const guidance of captureProtocolPresentation(mode, "right").views) {
        expect(guidance.cameraYawDegrees).toBeNull();
        expect(describeCameraYaw(guidance)).toBeNull();
      }
    }
    // The presentation vocabulary already knows oblique views so a future
    // protocol needs configuration, not a new screen; today nothing selects them.
    expect(captureViewGuidance("left_oblique", "right").cameraYawDegrees).toBeNull();
    expect(captureViewGuidance("right_oblique", "right").cameraYawDegrees).toBeNull();
    expect(describeCameraYaw({ ...captureViewGuidance("right_oblique", "right"), cameraYawDegrees: 57.5 })).toBe("카메라 각도 57.5°");
    const source = readFileSync("lib/shooting-profile/capture-guidance.ts", "utf8");
    expect(source).not.toMatch(/45|60|90/);
  });
});
