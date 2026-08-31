import { beforeEach, describe, expect, it, vi } from "vitest";

const setDoc = vi.fn(async () => undefined);
const deleteDoc = vi.fn(async () => undefined);
const getDocs = vi.fn(async () => ({ docs: [] as { id: string; data: () => unknown }[] }));
const doc = vi.fn(() => ({ id: "generated-id" }));
const collection = vi.fn(() => ({}));
const query = vi.fn(() => ({}));
const orderBy = vi.fn(() => ({}));
const serverTimestamp = vi.fn(() => "server-timestamp");

vi.mock("firebase/firestore", () => ({
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
}));

vi.mock("@/lib/firebase", () => ({ firestore: { id: "fake-firestore" } }));

const {
  LEGACY_CLOUD_SAVE_DISABLED,
  LegacyCloudSaveDisabledError,
  ensureFirebaseProfile,
  listFirebasePrivatePoses,
  removeFirebasePrivatePose,
  saveFirebasePrivatePose,
} = await import("@/lib/firebase-private-data");

const owner = { uid: "owner-uid", email: "owner@example.com", displayName: null } as never;

const legacyInput = {
  sourceLabel: "IMG_4821",
  poseJson: JSON.stringify({ frames: [{ timestampMs: 0, landmarks: [{ x: 0, y: 0, z: 0.4 }] }] }),
  qualityJson: JSON.stringify({ passed: true }),
};

describe("legacy V1 private pose cloud write boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses the legacy save with a typed error instead of writing", async () => {
    await expect(saveFirebasePrivatePose(owner, legacyInput)).rejects.toBeInstanceOf(
      LegacyCloudSaveDisabledError,
    );
  });

  it("exposes a stable machine-readable code on the refusal", async () => {
    expect(LEGACY_CLOUD_SAVE_DISABLED).toBe("legacy_cloud_save_disabled");
    const failure = await saveFirebasePrivatePose(owner, legacyInput).catch((error: unknown) => error);
    expect((failure as { code?: string }).code).toBe("legacy_cloud_save_disabled");
    expect(failure).toBeInstanceOf(LegacyCloudSaveDisabledError);
  });

  it("performs no Firestore work at all before refusing", async () => {
    await saveFirebasePrivatePose(owner, legacyInput).catch(() => undefined);
    expect(setDoc).not.toHaveBeenCalled();
    expect(doc).not.toHaveBeenCalled();
    expect(collection).not.toHaveBeenCalled();
    expect(serverTimestamp).not.toHaveBeenCalled();
  });

  it("refuses every legacy payload shape, including one carrying no forbidden fields", async () => {
    await expect(
      saveFirebasePrivatePose(owner, { sourceLabel: "x", poseJson: "{}", qualityJson: "{}" }),
    ).rejects.toBeInstanceOf(LegacyCloudSaveDisabledError);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("still lets the owner list existing legacy documents", async () => {
    await listFirebasePrivatePoses(owner);
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it("still lets the owner delete an existing legacy document", async () => {
    await removeFirebasePrivatePose(owner, "legacy-doc-id");
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it("keeps the owner profile upsert working", async () => {
    await ensureFirebaseProfile(owner);
    expect(setDoc).toHaveBeenCalledTimes(1);
  });
});
