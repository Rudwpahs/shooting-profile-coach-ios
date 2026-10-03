import { existsSync, readFileSync } from "node:fs";

import type { User } from "firebase/auth";
import { describe, expect, it } from "vitest";

import { PREVIEW_AUTH_VALUE } from "@/lib/preview/preview-auth";
import { PREVIEW_FLAG_OVERRIDE } from "@/lib/preview/preview-flags";
import { PREVIEW_USER_UID, previewUser } from "@/lib/preview/preview-runtime";
import { createPreviewShootingProfileSource } from "@/lib/preview/preview-shooting-profile-source";

const stranger = { uid: "someone-else" } as unknown as User;

describe("preview runtime data", () => {
  it("exposes one deterministic signed-in user and no synthetic shot library", () => {
    expect(PREVIEW_USER_UID).toBe("preview-user");
    expect(previewUser.uid).toBe(PREVIEW_USER_UID);
    expect(previewUser.email).toBeNull();
    const runtime = readFileSync("lib/preview/preview-runtime.ts", "utf8");
    expect(runtime).not.toMatch(/preview-shot|PREVIEW_SHOT|PREVIEW_PROFILE_ID|syntheticLandmarkSession|@\/tests\/|buildUiDemoFixtures|reels/);
    expect(existsSync("lib/preview/preview-shot-library.ts")).toBe(false);
    expect(existsSync("lib/preview/preview-explore-motions.ts")).toBe(false);
  });

  it("signs the preview in without Firebase and refuses account mutation", async () => {
    expect(PREVIEW_AUTH_VALUE.user?.uid).toBe(PREVIEW_USER_UID);
    expect(PREVIEW_AUTH_VALUE.loading).toBe(false);
    expect(PREVIEW_AUTH_VALUE.configured).toBe(true);
    await expect(PREVIEW_AUTH_VALUE.signIn("a@b.c", "x")).resolves.toBeUndefined();
    await expect(PREVIEW_AUTH_VALUE.signUp("a@b.c", "x")).resolves.toBeUndefined();
    await expect(PREVIEW_AUTH_VALUE.logout()).resolves.toBeUndefined();
    await expect(PREVIEW_AUTH_VALUE.deleteAccount("x")).rejects.toThrow();
  });

  it("enables the viewer, profile, capture and shot inspection surfaces for the preview build only", () => {
    expect(PREVIEW_FLAG_OVERRIDE.flags).toEqual({ captureV2: true, profileV2: true, representative4DViewer: true });
    expect(PREVIEW_FLAG_OVERRIDE.shotInspectionV1).toBe(true);
  });
});

describe("preview shooting profile source", () => {
  it("holds no representative profile: lists nothing, finds nothing, deletes nothing and refuses to save one", async () => {
    const source = createPreviewShootingProfileSource();
    expect(await source.listShootingProfilesV2(previewUser)).toEqual([]);
    expect(await source.listShootingProfilesV2(stranger)).toEqual([]);
    await expect(source.resumePendingShootingProfileDeletionsV2(previewUser)).resolves.toBeUndefined();
    expect(await source.getShootingProfileV2(previewUser, "preview-shot-001")).toBeNull();
    await expect(source.deleteShootingProfileV2(previewUser, "preview-shot-001")).resolves.toBeUndefined();
    // The browser runs no pose analysis, so there is never a profile to save; footage becomes a film shot instead.
    await expect(source.saveShootingProfileV2(previewUser, {} as never)).rejects.toThrow(/film|footage|영상/i);
    await expect(source.saveShootingProfileV2(stranger, {} as never)).rejects.toThrow();
    expect(await source.listFirebasePrivatePoses(previewUser)).toEqual([]);
    await expect(source.removeFirebasePrivatePose(previewUser, "any")).resolves.toBeUndefined();
  });
});
