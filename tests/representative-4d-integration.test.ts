import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  PERSISTED_OBSERVATION_JOINTS_V2,
  reconstructObservationFramesFromSequencePayloadV2,
  serializeObservationSequenceForCloud,
} from "@/lib/firebase-shooting-profile-contract";
import { buildRepresentativeSequence } from "@/lib/shooting-profile/representative-sequence";
import { syntheticDualViewSession } from "@/tests/fixtures/synthetic-dual-view";

describe("representative 4D release boundary", () => {
  it("builds only a phase-fused estimate from separate front and side shots", () => {
    const session = syntheticDualViewSession({ mode: "basic_1_plus_1" });
    const result = buildRepresentativeSequence(session);

    expect(result.status, JSON.stringify(result)).toBe("complete");
    if (result.status !== "complete") return;
    expect(result.profile.boundary).toBe(
      "representative_phase_fused_4d_estimate_not_actual_3d",
    );
    expect(result.profile.timeBasis).toBe("normalized_shot_phase");
    expect(result.profile.frames).toHaveLength(101);
    expect(result.profile.frames.some((frame) => (
      Object.values(frame.joints).some((joint) => Math.abs(joint.z) > 1e-6)
    ))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("calibrated_multi_view_3d");
  });

  it("persists only the 12 allowlisted source x/y/visibility joints and no raw-media identity", () => {
    const session = syntheticDualViewSession({ mode: "basic_1_plus_1" });
    const sourceAttempt = session.frontAttempts[0];
    const completeSourceAttempt = {
      ...sourceAttempt,
      frames: sourceAttempt.frames.map((frame) => ({
        ...frame,
        sourceLandmarks: Array.from({ length: 33 }, (_, index) => (
          frame.sourceLandmarks[index] ?? { x: 0.5, y: 0.5, visibility: 0 }
        )),
      })),
    };
    const serialized = serializeObservationSequenceForCloud(completeSourceAttempt);
    const decoded = reconstructObservationFramesFromSequencePayloadV2(serialized)[0];

    expect(Object.keys(decoded.joints)).toEqual([...PERSISTED_OBSERVATION_JOINTS_V2]);
    expect(Object.values(decoded.joints).every((joint) => (
      Object.keys(joint).every((key) => key === "x" || key === "y" || key === "visibility")
      && !("z" in joint)
    ))).toBe(true);
    expect(JSON.stringify(serialized)).not.toMatch(
      /sourceTimestampMs|timestampMs|file:\/\/|filename|uri|exif|thumbnail|rawMedia|nose/i,
    );
  });

  it("keeps every V2 capability default-off, preserves V1, and records native resource gates", () => {
    const flags = readFileSync("lib/feature-flags.ts", "utf8");
    const profileRoute = readFileSync("app/(tabs)/profile.tsx", "utf8");
    const moduleConfig = readFileSync("modules/formpath-pose/expo-module.config.json", "utf8");
    const podspec = readFileSync("modules/formpath-pose/FormpathPose.podspec", "utf8");
    const qa = readFileSync("docs/iphone-custom-build-qa.md", "utf8");

    expect(flags).toMatch(/^\s*captureV2:\s*process\.env\.EXPO_PUBLIC_FORMPATH_CAPTURE_V2 === "1",\s*$/m);
    expect(flags).toMatch(/^\s*representative4DViewer:\s*process\.env\.EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D === "1",\s*$/m);
    expect(flags).toMatch(/^\s*profileV2:\s*process\.env\.EXPO_PUBLIC_FORMPATH_PROFILE_V2 === "1",\s*$/m);
    expect(profileRoute).toContain("loadV1");
    expect(profileRoute).toContain("<PrivatePoseCapture");
    expect(moduleConfig).toContain('"podspecPath": "FormpathPose.podspec"');
    expect(podspec).toContain("s.resource_bundles");
    expect(podspec).toContain("MediaPipeTasksVision");
    expect(qa).toContain("PENDING_OWNER_APPROVAL");
    expect(qa).toContain("SHA-256");
  });
});
