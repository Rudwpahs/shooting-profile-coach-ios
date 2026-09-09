import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Auth } from "firebase/auth";
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, documentId, query,
  serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch, type Firestore,
} from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createReelSocialPersistence } from "@/lib/reels/social-persistence";

const OWNER = "owner-1";
const VIEWER = "viewer-1";
const POST = "post00001";
let env: RulesTestEnvironment;
const db = (uid: string | null = OWNER) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore()) as unknown as Firestore;
const postRef = (firestore: Firestore) => doc(firestore, "reelPosts", POST);
const savedRef = (firestore: Firestore, uid = VIEWER) => doc(firestore, "users", uid, "savedReels", POST);
const post = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1, postId: POST, ownerUid: OWNER, privacy: "public", publicOptIn: true, durationMs: 12000,
  video: { objectPath: `reels/${OWNER}/${POST}/video.mp4`, contentType: "video/mp4" },
  motion: { objectPath: `reels/${OWNER}/${POST}/motion.v1.bin`, format: "motion_packet_v1" },
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...overrides,
});
const saved = (overrides: Record<string, unknown> = {}) => ({ schemaVersion: 1, postId: POST, timeMs: 1234, savedAt: serverTimestamp(), ...overrides });

beforeAll(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error("FIRESTORE_EMULATOR_HOST required; run via pnpm test:rules");
  const [host, port] = address.split(":");
  env = await initializeTestEnvironment({ projectId: "demo-formpath", firestore: { host, port: Number(port), rules: readFileSync("firestore.rules", "utf8") } });
});
afterEach(async () => { if (env) await env.clearFirestore(); });
afterAll(async () => { if (env) await env.cleanup(); });

describe("reelPosts public metadata rules", () => {
  it("allows explicit-public owner publishing and public reads, including anonymous playback metadata", async () => {
    await assertSucceeds(setDoc(postRef(db()), post()));
    expect((await assertSucceeds(getDoc(postRef(db(null))))).data()?.durationMs).toBe(12000);
    await assertSucceeds(getDoc(postRef(db(VIEWER))));
  });
  it("allows skeleton-only or video-only posts", async () => {
    await assertSucceeds(setDoc(postRef(db()), post({ video: null })));
    await deleteDoc(postRef(db()));
    await assertSucceeds(setDoc(postRef(db()), post({ motion: null })));
  });
  it("denies unsigned and spoofed-owner publishing", async () => {
    await assertFails(setDoc(postRef(db(null)), post()));
    await assertFails(setDoc(postRef(db(VIEWER)), post()));
  });
  it.each([false, null, "true"])("denies publishing without explicit opt-in: %s", async (publicOptIn) => {
    await assertFails(setDoc(postRef(db()), post({ publicOptIn })));
  });
  it("requires the opt-in key and denies initial private publication", async () => {
    const { publicOptIn: omitted, ...withoutOptIn } = post();
    expect(omitted).toBe(true);
    await assertFails(setDoc(postRef(db()), withoutOptIn));
    await assertFails(setDoc(postRef(db()), post({ privacy: "private", publicOptIn: false })));
  });
  it.each(["landmarks", "nativeZ", "mask", "thumbnail", "evidence", "covariance", "profileId", "videoUrl"])("denies extra %s metadata", async (field) => {
    await assertFails(setDoc(postRef(db()), post({ [field]: [] })));
  });
  it("denies nested raw payloads, arbitrary URLs, private paths, and references owned by another user", async () => {
    for (const objectPath of ["https://example.com/a.mp4", "gs://bucket/a.mp4", "users/owner-1/motionProfiles/private", "reels/other-1/post00001/video.mp4", "reels/owner-1/post00002/video.mp4"]) {
      await assertFails(setDoc(postRef(db()), post({ video: { objectPath, contentType: "video/mp4" } })));
    }
    await assertFails(setDoc(postRef(db()), post({ motion: { ...post().motion, payload: [1, 2, 3] } })));
    await assertFails(setDoc(postRef(db()), post({ video: null, motion: null })));
  });
  it("denies identity mismatches, unsupported versions, duration bounds and backdated timestamps", async () => {
    for (const override of [{ postId: "other0001" }, { schemaVersion: 2 }, { durationMs: 0 }, { durationMs: 180001 }, { durationMs: 0.5 }, { createdAt: Timestamp.fromMillis(0) }]) {
      await assertFails(setDoc(postRef(db()), post(override)));
    }
  });
  it("revokes public and saved-source access immediately on private transition, while retaining owner reads", async () => {
    const owner = db(); const viewer = db(VIEWER); const anonymous = db(null);
    await setDoc(postRef(owner), post());
    await setDoc(savedRef(viewer), saved());
    await assertSucceeds(updateDoc(postRef(owner), { privacy: "private", publicOptIn: false, updatedAt: serverTimestamp() }));
    await assertFails(getDoc(postRef(viewer)));
    await assertFails(getDoc(postRef(anonymous)));
    await assertSucceeds(getDoc(postRef(owner)));
    await assertSucceeds(getDoc(savedRef(viewer)));
    await assertFails(setDoc(savedRef(viewer), saved({ timeMs: 2345 })));
    await assertSucceeds(deleteDoc(savedRef(viewer)));
    await assertSucceeds(updateDoc(postRef(owner), { privacy: "public", publicOptIn: true, updatedAt: serverTimestamp() }));
    await assertSucceeds(getDoc(postRef(anonymous)));
  });
  it("denies nonowner privacy updates/deletes and attempts to change immutable owner or media", async () => {
    await setDoc(postRef(db()), post());
    await assertFails(updateDoc(postRef(db(VIEWER)), { privacy: "private", publicOptIn: false, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(postRef(db(VIEWER))));
    await assertFails(updateDoc(postRef(db()), { publicOptIn: false, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(postRef(db()), { durationMs: 15000, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(postRef(db()), { ownerUid: VIEWER, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(postRef(db()), { video: null, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(postRef(db()), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });
  it("allows only bounded public feed queries", async () => {
    const owner = db(); const viewer = db(null);
    await setDoc(postRef(owner), post());
    const posts = collection(viewer, "reelPosts");
    await assertSucceeds(getDocs(query(posts, where("privacy", "==", "public"), orderBy(documentId()), limit(25))));
    await assertFails(getDocs(query(posts, where("privacy", "==", "public"))));
    await assertFails(getDocs(query(posts, where("privacy", "==", "public"), limit(26))));
    await assertFails(getDocs(query(posts, limit(10))));
  });
});

describe("owner-scoped savedReels rules", () => {
  it("permits idempotent saved moments only for the saver, within duration, with server time", async () => {
    await setDoc(postRef(db()), post());
    const viewer = db(VIEWER);
    await assertSucceeds(setDoc(savedRef(viewer), saved()));
    await assertSucceeds(setDoc(savedRef(viewer), saved({ timeMs: 12000 })));
    expect((await getDoc(savedRef(viewer))).data()?.timeMs).toBe(12000);
    expect((await getDocs(query(collection(viewer, "users", VIEWER, "savedReels"), limit(25)))).size).toBe(1);
    await assertFails(getDoc(savedRef(db())));
    await assertFails(getDoc(savedRef(db(null))));
    await assertFails(setDoc(savedRef(db()), saved()));
    await assertFails(setDoc(savedRef(db(null)), saved()));
    await assertFails(deleteDoc(savedRef(db())));
    await assertFails(getDocs(collection(viewer, "users", VIEWER, "savedReels")));
    await assertFails(getDocs(query(collection(viewer, "users", VIEWER, "savedReels"), limit(26))));
  });
  it("denies missing posts, oversized moments, forged timestamps and duplicate payloads", async () => {
    const viewer = db(VIEWER);
    await assertFails(setDoc(savedRef(viewer), saved()));
    await setDoc(postRef(db()), post());
    for (const override of [{ timeMs: -1 }, { timeMs: 12001 }, { timeMs: 1.5 }, { savedAt: Timestamp.fromMillis(0) }, { postId: "other0001" }, { schemaVersion: 2 }, { video: post().video }, { landmarks: [] }, { yaw: 3 }]) {
      await assertFails(setDoc(savedRef(viewer), saved(override)));
    }
  });
  it("allows owner save on a private source and keeps stale saves removable after post deletion", async () => {
    const owner = db(); const viewer = db(VIEWER);
    await setDoc(postRef(owner), post());
    await setDoc(savedRef(viewer), saved());
    await updateDoc(postRef(owner), { privacy: "private", publicOptIn: false, updatedAt: serverTimestamp() });
    await assertSucceeds(setDoc(savedRef(owner, OWNER), saved()));
    await assertSucceeds(deleteDoc(postRef(owner)));
    await assertFails(setDoc(savedRef(viewer), saved()));
    await assertSucceeds(deleteDoc(savedRef(viewer)));
    await assertSucceeds(deleteDoc(savedRef(owner, OWNER)));
  });
  it("denies save and source-delete in one atomic batch", async () => {
    const owner = db();
    await setDoc(postRef(owner), post());
    const batch = writeBatch(owner);
    batch.set(savedRef(owner, OWNER), saved());
    batch.delete(postRef(owner));
    await assertFails(batch.commit());
  });
  it("exercises the real client API through publish, save, revoke, reopen and unsave", async () => {
    const owner = createReelSocialPersistence({ firestore: db(), auth: { currentUser: { uid: OWNER } } as Pick<Auth, "currentUser"> });
    const viewer = createReelSocialPersistence({ firestore: db(VIEWER), auth: { currentUser: { uid: VIEWER } } as Pick<Auth, "currentUser"> });
    await owner.publishReel({ postId: POST, publicOptIn: true, durationMs: 12000, video: post().video, motion: post().motion });
    await viewer.saveReelMoment({ postId: POST, timeMs: 4321 });
    expect((await viewer.resolveSavedReel(POST))?.saved.timeMs).toBe(4321);
    expect((await viewer.listPublicReels({ pageSize: 1 })).items).toHaveLength(1);
    expect((await viewer.listSavedReels()).items).toHaveLength(1);
    await owner.setReelPrivacy({ postId: POST, privacy: "private", publicOptIn: false });
    expect((await viewer.resolveSavedReel(POST))?.post).toBeNull();
    expect((await viewer.listPublicReels()).items).toHaveLength(0);
    await owner.deleteReel(POST);
    await viewer.unsaveReel(POST);
    expect(await viewer.resolveSavedReel(POST)).toBeNull();
  });
});
