import type { Auth } from "firebase/auth";
import { Timestamp, type Firestore } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createReelSocialPersistence } from "@/lib/reels/social-persistence";

const sdk = vi.hoisted(() => ({ writes: [] as unknown[], reads: [] as unknown[], txSets: [] as unknown[], documents: new Map<string, unknown>(), getDocs: vi.fn(), failure: null as unknown }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  const read = async (ref: { path: string }) => {
    sdk.reads.push(ref.path);
    if (sdk.failure) throw sdk.failure;
    return { id: ref.path.split("/").at(-1), exists: () => sdk.documents.has(ref.path), data: () => sdk.documents.get(ref.path) };
  };
  return {
    ...actual,
    doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    setDoc: async (ref: unknown, data: unknown) => { sdk.writes.push({ ref, data }); },
    deleteDoc: async (ref: unknown) => { sdk.writes.push({ delete: ref }); },
    getDocFromServer: read,
    getDocsFromServer: sdk.getDocs,
    query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
    where: (...args: unknown[]) => ({ where: args }),
    orderBy: (...args: unknown[]) => ({ orderBy: args }),
    documentId: () => "__name__",
    limit: (count: number) => ({ limit: count }),
    startAfter: (cursor: string) => ({ startAfter: cursor }),
    serverTimestamp: () => "SERVER_TIMESTAMP",
    runTransaction: async (_db: unknown, callback: (tx: unknown) => Promise<unknown>) => callback({ get: read, set: (ref: unknown, data: unknown) => sdk.txSets.push({ ref, data }), update: (ref: unknown, data: unknown) => sdk.txSets.push({ ref, data }) }),
  };
});

const publish = { postId: "post00001", publicOptIn: true, durationMs: 12000, video: { objectPath: "reels/owner-1/post00001/video.mp4", contentType: "video/mp4" }, motion: null };
const stored = () => ({ ...publish, schemaVersion: 1, ownerUid: "owner-1", privacy: "public", createdAt: Timestamp.fromMillis(1000), updatedAt: Timestamp.fromMillis(1000) });
let auth: { currentUser: { uid: string } | null };
const api = () => createReelSocialPersistence({ firestore: {} as Firestore, auth: auth as Pick<Auth, "currentUser"> });

beforeEach(() => {
  auth = { currentUser: { uid: "owner-1" } };
  sdk.writes.length = 0; sdk.reads.length = 0; sdk.txSets.length = 0; sdk.documents.clear(); sdk.failure = null; sdk.getDocs.mockReset();
  sdk.getDocs.mockResolvedValue({ docs: [] });
});

describe("social SDK boundary", () => {
  it("writes minimal explicit-public metadata with server timestamps", async () => {
    await api().publishReel(publish);
    expect(sdk.writes).toEqual([{ ref: { path: "reelPosts/post00001" }, data: { ...publish, schemaVersion: 1, ownerUid: "owner-1", privacy: "public", createdAt: "SERVER_TIMESTAMP", updatedAt: "SERVER_TIMESTAMP" } }]);
  });
  it("refuses unauthenticated, unconfigured and invalid writes before SDK I/O", async () => {
    auth.currentUser = null;
    await expect(api().publishReel(publish)).rejects.toThrow("unauthenticated");
    auth.currentUser = { uid: "owner-1" };
    await expect(createReelSocialPersistence({ firestore: null, auth: null }).publishReel(publish)).rejects.toThrow("not_configured");
    await expect(api().publishReel({ ...publish, mask: [] })).rejects.toThrow();
    await expect(api().saveReelMoment({ postId: "../secret", timeMs: 0 })).rejects.toThrow();
    expect(sdk.writes).toEqual([]); expect(sdk.reads).toEqual([]);
  });
  it("saves idempotently to the same owner/post path after checking the source duration", async () => {
    sdk.documents.set("reelPosts/post00001", stored());
    auth.currentUser = { uid: "viewer-1" };
    await api().saveReelMoment({ postId: "post00001", timeMs: 1234 });
    await api().saveReelMoment({ postId: "post00001", timeMs: 5678 });
    expect(sdk.txSets).toEqual([1234, 5678].map(timeMs => ({ ref: { path: "users/viewer-1/savedReels/post00001" }, data: { schemaVersion: 1, postId: "post00001", timeMs, savedAt: "SERVER_TIMESTAMP" } })));
    expect(sdk.reads).toEqual(["reelPosts/post00001", "reelPosts/post00001"]);
  });
  it("refuses saving deleted, private, malformed, or out-of-duration posts", async () => {
    await expect(api().saveReelMoment({ postId: "post00001", timeMs: 0 })).rejects.toThrow("post_unavailable");
    sdk.documents.set("reelPosts/post00001", { ...stored(), privacy: "private", publicOptIn: false });
    auth.currentUser = { uid: "viewer-1" };
    await expect(api().saveReelMoment({ postId: "post00001", timeMs: 0 })).rejects.toThrow("post_unavailable");
    sdk.documents.set("reelPosts/post00001", stored());
    await expect(api().saveReelMoment({ postId: "post00001", timeMs: 12001 })).rejects.toThrow("moment_out_of_range");
    sdk.documents.set("reelPosts/post00001", { ...stored(), landmarks: [] });
    await expect(api().saveReelMoment({ postId: "post00001", timeMs: 0 })).rejects.toThrow();
    expect(sdk.txSets).toEqual([]);
  });
  it("revokes and restores public privacy only with matching opt-in and owner identity", async () => {
    sdk.documents.set("reelPosts/post00001", stored());
    await api().setReelPrivacy({ postId: "post00001", privacy: "private", publicOptIn: false });
    expect(sdk.txSets).toEqual([{ ref: { path: "reelPosts/post00001" }, data: { privacy: "private", publicOptIn: false, updatedAt: "SERVER_TIMESTAMP" } }]);
    await expect(api().setReelPrivacy({ postId: "post00001", privacy: "public", publicOptIn: false })).rejects.toThrow();
    auth.currentUser = { uid: "viewer-1" };
    await expect(api().setReelPrivacy({ postId: "post00001", privacy: "private", publicOptIn: false })).rejects.toThrow("not_owner");
    expect(sdk.txSets).toHaveLength(1);
  });
  it("uses bounded server list queries with a validated document cursor", async () => {
    await api().listPublicReels({ pageSize: 3, afterPostId: "post00001" });
    expect(sdk.getDocs).toHaveBeenCalledWith({ ref: { path: "reelPosts" }, constraints: [{ where: ["privacy", "==", "public"] }, { orderBy: ["__name__"] }, { startAfter: "post00001" }, { limit: 3 }] });
    await api().listSavedReels({ pageSize: 5 });
    expect(sdk.getDocs).toHaveBeenLastCalledWith({ ref: { path: "users/owner-1/savedReels" }, constraints: [{ orderBy: ["__name__"] }, { limit: 5 }] });
    for (const pageSize of [0, 26, 1.5, Infinity]) await expect(api().listPublicReels({ pageSize })).rejects.toThrow();
    await expect(api().listSavedReels({ afterPostId: "../private" })).rejects.toThrow();
    expect(sdk.getDocs).toHaveBeenCalledTimes(2);
  });
  it("rechecks source access on reopening saved moments and never returns cached private content", async () => {
    sdk.documents.set("users/owner-1/savedReels/post00001", { schemaVersion: 1, postId: "post00001", timeMs: 1234, savedAt: Timestamp.fromMillis(2000) });
    sdk.documents.set("reelPosts/post00001", stored());
    expect((await api().resolveSavedReel("post00001"))?.post?.durationMs).toBe(12000);
    sdk.documents.delete("reelPosts/post00001");
    expect((await api().resolveSavedReel("post00001"))?.post).toBeNull();
    sdk.documents.set("reelPosts/post00001", { ...stored(), ownerUid: "other-1", privacy: "private", publicOptIn: false, video: { objectPath: "reels/other-1/post00001/video.mp4", contentType: "video/mp4" } });
    expect((await api().resolveSavedReel("post00001"))?.post).toBeNull();
    sdk.failure = { code: "permission-denied" };
    expect(await api().getReel("post00001")).toBeNull();
    sdk.failure = new Error("unavailable");
    await expect(api().getReel("post00001")).rejects.toThrow("unavailable");
  });
  it("deletes only owned posts and lets owners unsave without requiring a surviving source", async () => {
    sdk.documents.set("reelPosts/post00001", stored());
    auth.currentUser = { uid: "viewer-1" };
    await expect(api().deleteReel("post00001")).rejects.toThrow("not_owner");
    expect(sdk.writes).toEqual([]);
    auth.currentUser = { uid: "owner-1" };
    await api().deleteReel("post00001");
    sdk.documents.delete("reelPosts/post00001");
    await api().unsaveReel("post00001");
    expect(sdk.writes).toEqual([{ delete: { path: "reelPosts/post00001" } }, { delete: { path: "users/owner-1/savedReels/post00001" } }]);
  });
});
