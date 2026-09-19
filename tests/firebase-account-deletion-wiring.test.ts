import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const credential = vi.fn((email: string, password: string) => ({ email, password }));
const reauthenticateWithCredential = vi.fn(async () => { calls.push("reauth"); });
const deleteUser = vi.fn(async () => { calls.push("delete-auth"); });
const deleteDoc = vi.fn(async () => { calls.push("delete-root"); });
const doc = vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }));
const resumePendingShootingProfileDeletionsV2 = vi.fn(async () => { calls.push("resume-v2"); });
const listShootingProfilesV2 = vi.fn(async () => { calls.push("list-v2"); return [{ id: "p1" }, { id: "p2" }]; });
const deleteShootingProfileV2 = vi.fn(async (_user: unknown, profileId: string) => { calls.push(`delete-v2:${profileId}`); });
const listFirebasePrivatePoses = vi.fn(async () => { calls.push("list-legacy"); return [{ id: "l1" }]; });
const removeFirebasePrivatePose = vi.fn(async (_user: unknown, poseId: string) => { calls.push(`delete-legacy:${poseId}`); });

vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential },
  deleteUser,
  reauthenticateWithCredential,
}));
vi.mock("firebase/firestore", () => ({ deleteDoc, doc }));
vi.mock("@/lib/firebase", () => ({ firestore: { id: "fake-firestore" } }));
vi.mock("@/lib/firebase-private-data", () => ({
  listFirebasePrivatePoses,
  removeFirebasePrivatePose,
}));
vi.mock("@/lib/firebase-shooting-profiles", () => ({
  deleteShootingProfileV2,
  listShootingProfilesV2,
  resumePendingShootingProfileDeletionsV2,
}));

const { deleteFirebaseAccount } = await import("@/lib/firebase-account-deletion");

function user(email: string | null = "owner@example.com") {
  return { uid: "owner-uid", email } as never;
}

describe("deleteFirebaseAccount adapter", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
  });

  it("reauthenticates, deletes all owner data, deletes legacy root, then deletes auth", async () => {
    await deleteFirebaseAccount(user(), "current-password");

    expect(credential).toHaveBeenCalledWith("owner@example.com", "current-password");
    expect(reauthenticateWithCredential).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "owner-uid" }),
      { email: "owner@example.com", password: "current-password" },
    );
    expect(doc).toHaveBeenCalledWith({ id: "fake-firestore" }, "users", "owner-uid");
    expect(calls).toEqual([
      "reauth",
      "resume-v2",
      "list-v2",
      "delete-v2:p1",
      "delete-v2:p2",
      "list-legacy",
      "delete-legacy:l1",
      "delete-root",
      "delete-auth",
    ]);
  });

  it("rejects a missing email before reauthentication or destructive work", async () => {
    await expect(deleteFirebaseAccount(user(null), "current-password")).rejects.toThrow();
    expect(credential).not.toHaveBeenCalled();
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("rejects a blank password before reauthentication or destructive work", async () => {
    await expect(deleteFirebaseAccount(user(), "   ")).rejects.toThrow();
    expect(credential).not.toHaveBeenCalled();
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});

describe("Firebase Auth deletion wiring", () => {
  const authSource = readFileSync("lib/firebase-auth.tsx", "utf8");

  it("exposes deleteAccount through the auth context", () => {
    expect(authSource).toContain("deleteAccount: (password: string) => Promise<void>");
    expect(authSource).toContain("deleteFirebaseAccount");
  });

  it("deletes the currently authenticated Firebase user instead of signing out", () => {
    const start = authSource.indexOf("const deleteAccount = useCallback");
    expect(start).toBeGreaterThan(-1);
    const end = authSource.indexOf("const logout = useCallback", start);
    const handler = authSource.slice(start, end);
    expect(handler).toContain("requireAuth().currentUser");
    expect(handler).toContain("await deleteFirebaseAccount");
    expect(handler).not.toContain("signOut");
  });
});
