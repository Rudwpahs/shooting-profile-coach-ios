import type { User } from "firebase/auth";
import { describe, expect, it } from "vitest";

import { PREVIEW_AUTH_VALUE } from "@/lib/preview/preview-auth";
import { PREVIEW_FLAG_OVERRIDE } from "@/lib/preview/preview-flags";
import { PREVIEW_PROFILE_ID, PREVIEW_PROFILE_IDS, PREVIEW_USER_UID, buildPreviewData, previewUser } from "@/lib/preview/preview-runtime";
import { createPreviewShootingProfileSource } from "@/lib/preview/preview-shooting-profile-source";
import { isOpaqueShootingProfileIdV2 } from "@/lib/firebase-shooting-profile-contract";

const stranger = { uid: "someone-else" } as unknown as User;

describe("preview runtime data", () => {
  it("exposes one deterministic signed-in user and stable opaque preview profile ids", () => {
    expect(PREVIEW_USER_UID).toBe("preview-user");
    expect(previewUser.uid).toBe(PREVIEW_USER_UID);
    expect(PREVIEW_PROFILE_ID).toBe("preview-shot-001");
    expect(PREVIEW_PROFILE_IDS[0]).toBe(PREVIEW_PROFILE_ID);
    expect(PREVIEW_PROFILE_IDS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(PREVIEW_PROFILE_IDS).size).toBe(PREVIEW_PROFILE_IDS.length);
    expect(PREVIEW_PROFILE_IDS.every((id) => isOpaqueShootingProfileIdV2(id))).toBe(true);
  });

  it("derives everything from the synthetic fixtures: no account, no network, no person, no raw video", () => {
    const data = buildPreviewData();
    expect(data.summaries.map((summary) => summary.id)).toEqual([...PREVIEW_PROFILE_IDS]);
    expect(data.summaries[0].createdAt.toDate().getTime()).toBeGreaterThan(data.summaries[1].createdAt.toDate().getTime());
    expect(data.record.profile.quality.passed).toBe(true);
    expect(data.reels[0]).toMatchObject({ kind: "profile", profileId: PREVIEW_PROFILE_ID });
    expect(data.sequenceFor("front", 0)).toBeTruthy();
    expect(data.sequenceFor("shooting_side", 2)).toBeTruthy();
    expect(JSON.stringify(data.summaries)).not.toMatch(/demo-fixture-|https?:|file:|blob:/);
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
  it("lists the preview profiles newest first for the preview user and nothing for anyone else", async () => {
    const source = createPreviewShootingProfileSource(buildPreviewData());
    const list = await source.listShootingProfilesV2(previewUser);
    expect(list.map((summary) => summary.id)).toEqual([...PREVIEW_PROFILE_IDS]);
    expect(await source.listShootingProfilesV2(stranger)).toEqual([]);
    expect(await source.listFirebasePrivatePoses(previewUser)).toEqual([]);
  });

  it("returns the representative record for a known id and null otherwise, with deletion resumption as a no-op", async () => {
    const source = createPreviewShootingProfileSource(buildPreviewData());
    await expect(source.resumePendingShootingProfileDeletionsV2(previewUser)).resolves.toBeUndefined();
    const record = await source.getShootingProfileV2(previewUser, PREVIEW_PROFILE_ID);
    expect(record?.profile.quality.passed).toBe(true);
    expect(record?.shootingHand).toBe("right");
    expect(await source.getShootingProfileV2(previewUser, "unknown-id")).toBeNull();
    expect(await source.getShootingProfileV2(stranger, PREVIEW_PROFILE_ID)).toBeNull();
  });

  it("deletes in memory only and restores the primary preview profile when a capture is saved", async () => {
    const source = createPreviewShootingProfileSource(buildPreviewData());
    await source.deleteShootingProfileV2(previewUser, PREVIEW_PROFILE_IDS[1]);
    expect((await source.listShootingProfilesV2(previewUser)).map((summary) => summary.id)).not.toContain(PREVIEW_PROFILE_IDS[1]);
    await source.deleteShootingProfileV2(previewUser, PREVIEW_PROFILE_ID);
    expect(await source.getShootingProfileV2(previewUser, PREVIEW_PROFILE_ID)).toBeNull();

    const saved = await source.saveShootingProfileV2(previewUser, {} as never);
    expect(saved).toBe(PREVIEW_PROFILE_ID);
    expect(await source.getShootingProfileV2(previewUser, PREVIEW_PROFILE_ID)).not.toBeNull();
    expect((await source.listShootingProfilesV2(previewUser))[0].id).toBe(PREVIEW_PROFILE_ID);
    await expect(source.saveShootingProfileV2(stranger, {} as never)).rejects.toThrow();
    await expect(source.removeFirebasePrivatePose(previewUser, "any")).resolves.toBeUndefined();
  });
});
