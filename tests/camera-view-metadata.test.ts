import { describe, expect, it } from "vitest";

import {
  cameraYawSeparationDegrees,
  resolveLegacyCameraViewMetadata,
  validateCameraViewMetadata,
} from "@/lib/shooting-profile/camera-view-metadata";

describe("camera view metadata", () => {
  it("maps the legacy semantic views to deterministic shooter-centric yaw", () => {
    expect(resolveLegacyCameraViewMetadata("front", "right")).toEqual({
      semanticView: "front",
      yawDegrees: 0,
      yawSource: "legacy_semantic_view",
    });
    expect(resolveLegacyCameraViewMetadata("front", "left")).toEqual({
      semanticView: "front",
      yawDegrees: 0,
      yawSource: "legacy_semantic_view",
    });
    expect(resolveLegacyCameraViewMetadata("shooting_side", "right")).toEqual({
      semanticView: "shooting_side",
      yawDegrees: 90,
      yawSource: "legacy_semantic_view",
    });
    expect(resolveLegacyCameraViewMetadata("shooting_side", "left")).toEqual({
      semanticView: "shooting_side",
      yawDegrees: -90,
      yawSource: "legacy_semantic_view",
    });
  });

  it("accepts explicit oblique metadata without silently snapping its measured yaw", () => {
    expect(validateCameraViewMetadata({
      semanticView: "shooting_oblique",
      yawDegrees: 57.5,
      yawSource: "estimated",
    })).toEqual({
      semanticView: "shooting_oblique",
      yawDegrees: 57.5,
      yawSource: "estimated",
    });
  });

  it("rejects non-finite or out-of-range yaw", () => {
    expect(() => validateCameraViewMetadata({
      semanticView: "shooting_oblique",
      yawDegrees: Number.NaN,
      yawSource: "estimated",
    })).toThrow();
    expect(() => validateCameraViewMetadata({
      semanticView: "shooting_oblique",
      yawDegrees: 181,
      yawSource: "capture_instruction",
    })).toThrow();
  });

  it("computes the shortest absolute angular separation across wrap-around", () => {
    expect(cameraYawSeparationDegrees(0, 60)).toBe(60);
    expect(cameraYawSeparationDegrees(-45, 45)).toBe(90);
    expect(cameraYawSeparationDegrees(170, -170)).toBe(20);
  });
});
