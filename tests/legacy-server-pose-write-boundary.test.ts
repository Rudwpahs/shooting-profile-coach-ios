import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { LEGACY_CLOUD_SAVE_DISABLED } from "../shared/const";

describe("legacy V1 pose SQL write boundary", () => {
  it("refuses to persist a legacy pose analysis without touching the database", async () => {
    const { savePersonalPoseAnalysis } = await import("../server/db");
    await expect(
      savePersonalPoseAnalysis({
        userId: 1,
        sourceLabel: "IMG_4821",
        poseSpace: "monocular_relative_pose",
        status: "candidate",
        poseJson: JSON.stringify({ frames: [{ timestampMs: 0, landmarks: [{ x: 0, y: 0, z: 0.4 }] }] }),
        qualityJson: JSON.stringify({ passed: true }),
      }),
    ).rejects.toThrowError(LEGACY_CLOUD_SAVE_DISABLED);
  });

  it("keeps the shared refusal code identical on both cloud boundaries", async () => {
    const { LEGACY_CLOUD_SAVE_DISABLED: firebaseCode } = await import("@/lib/firebase-private-data");
    expect(firebaseCode).toBe(LEGACY_CLOUD_SAVE_DISABLED);
    expect(LEGACY_CLOUD_SAVE_DISABLED).toBe("legacy_cloud_save_disabled");
  });

  it("no longer exposes a tRPC procedure that accepts a legacy pose payload", () => {
    const routers = readFileSync("server/routers.ts", "utf8");
    expect(routers).not.toContain("poseJson: z.string()");
    expect(routers).not.toContain("qualityJson: z.string()");
    expect(routers).not.toContain("db.savePersonalPoseAnalysis");
    expect(routers).toContain("LEGACY_CLOUD_SAVE_DISABLED");
  });
});

/**
 * Structural guard. The repository has no React Native render-test setup, so the
 * capture component's wiring cannot be exercised behaviourally here; this pins
 * the two properties that keep a refused save from being shown as a success.
 */
describe("legacy capture screen wiring", () => {
  const capture = readFileSync("components/private-pose-capture.tsx", "utf8");

  it("routes every save failure through the shared outcome mapper and returns early", () => {
    expect(capture).toContain("describeLegacySaveFailure");
    const guardIndex = capture.indexOf("if (saveFailure !== null)");
    const completeIndex = capture.indexOf('setState("complete")');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(completeIndex).toBeGreaterThan(guardIndex);
    expect(capture.slice(guardIndex, completeIndex)).toContain("return;");
  });

  it("never derives a stored label from the source video filename", () => {
    expect(capture).not.toContain("asset.fileName");
    expect(capture).not.toContain("fileName");
  });
});
