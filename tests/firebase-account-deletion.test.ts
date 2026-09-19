import { describe, expect, it, vi } from "vitest";

import { runAccountDeletion, type AccountDeletionPort } from "@/lib/firebase-account-deletion";

function makePort(overrides: Partial<AccountDeletionPort> = {}) {
  const calls: string[] = [];
  const port: AccountDeletionPort = {
    reauthenticate: async () => { calls.push("reauth"); },
    resumePendingV2: async () => { calls.push("resume-v2"); },
    listV2ProfileIds: async () => { calls.push("list-v2"); return ["p1"]; },
    deleteV2Profile: async (profileId) => { calls.push(`delete-v2:${profileId}`); },
    listLegacyPoseIds: async () => { calls.push("list-legacy"); return ["l1"]; },
    deleteLegacyPose: async (poseId) => { calls.push(`delete-legacy:${poseId}`); },
    deleteLegacyRoot: async () => { calls.push("delete-root"); },
    deleteAuthUser: async () => { calls.push("delete-auth"); },
    ...overrides,
  };
  return { calls, port };
}

describe("runAccountDeletion", () => {
  it("reauthenticates before cloud deletion and deletes auth last", async () => {
    const { calls, port } = makePort();

    await runAccountDeletion(port);

    expect(calls).toEqual([
      "reauth",
      "resume-v2",
      "list-v2",
      "delete-v2:p1",
      "list-legacy",
      "delete-legacy:l1",
      "delete-root",
      "delete-auth",
    ]);
  });

  it("stops before touching cloud data when reauthentication fails", async () => {
    const { calls, port } = makePort({
      reauthenticate: async () => { calls.push("reauth"); throw new Error("reauth-failed"); },
    });

    await expect(runAccountDeletion(port)).rejects.toThrow("reauth-failed");
    expect(calls).toEqual(["reauth"]);
  });

  it("never deletes auth when a cloud deletion fails", async () => {
    const deleteAuthUser = vi.fn(async () => undefined);
    const { calls, port } = makePort({
      deleteV2Profile: async (profileId) => {
        calls.push(`delete-v2:${profileId}`);
        throw new Error("cloud-failed");
      },
      deleteAuthUser,
    });

    await expect(runAccountDeletion(port)).rejects.toThrow("cloud-failed");
    expect(deleteAuthUser).not.toHaveBeenCalled();
    expect(calls).not.toContain("list-legacy");
    expect(calls).not.toContain("delete-root");
  });

  it("deletes an otherwise empty account after reauth and root cleanup", async () => {
    const { calls, port } = makePort({
      listV2ProfileIds: async () => { calls.push("list-v2"); return []; },
      listLegacyPoseIds: async () => { calls.push("list-legacy"); return []; },
    });

    await runAccountDeletion(port);

    expect(calls).toEqual([
      "reauth",
      "resume-v2",
      "list-v2",
      "list-legacy",
      "delete-root",
      "delete-auth",
    ]);
  });

  it("processes multiple stored records in the exact list order", async () => {
    const { calls, port } = makePort({
      listV2ProfileIds: async () => { calls.push("list-v2"); return ["p3", "p1", "p2"]; },
      listLegacyPoseIds: async () => { calls.push("list-legacy"); return ["l2", "l1"]; },
    });

    await runAccountDeletion(port);

    expect(calls).toEqual([
      "reauth",
      "resume-v2",
      "list-v2",
      "delete-v2:p3",
      "delete-v2:p1",
      "delete-v2:p2",
      "list-legacy",
      "delete-legacy:l2",
      "delete-legacy:l1",
      "delete-root",
      "delete-auth",
    ]);
  });
});
