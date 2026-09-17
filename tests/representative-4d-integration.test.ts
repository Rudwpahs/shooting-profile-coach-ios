import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("representative 4D release boundary", () => {
  it("keeps native pose intake private and app-side", () => {
    const hook = read("hooks/use-shooting-profile-capture.ts");
    expect(hook).toContain("detectPoseSequenceV2");
    expect(hook).not.toMatch(/fetch\(|axios|trpc|server/i);
  });

  it("does not upload raw videos or original landmark sequences", () => {
    const save = read("lib/firebase-shooting-profiles.ts");
    expect(save).not.toMatch(/videoUri|filename|sourceLandmarks|normalizedAttempts/);
  });

  it("keeps every V2 capability default-off, preserves V1, and records native resource gates", () => {
    const flags = readFileSync("lib/feature-flags.ts", "utf8");
    const profileRoute = readFileSync("components/profile/owner-profile-tab.tsx", "utf8");
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
