import { readFileSync } from "node:fs";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";

/**
 * Cloud film shots: the owner's own footage in their private Storage prefix,
 * one Firestore clip document per clip and one head, created in that order.
 * Owner-only everywhere; shapes, sizes and types are enforced by the rules.
 */

const PROJECT_ID = "demo-formpath";
const OWNER = "owner-uid-0001";
const INTRUDER = "intruder-uid-0002";
const SHOT = "film-shot-abc123-1";
const ALL_SLOTS = ["front-0", "front-1", "front-2", "shooting_side-0", "shooting_side-1", "shooting_side-2"];

let testEnv: RulesTestEnvironment;

// Storage upload tasks are thenables, not Promises; adopt them so the assertion helpers accept them.
const succeeds = (operation: PromiseLike<unknown>) => assertSucceeds(Promise.resolve(operation));
const fails = (operation: PromiseLike<unknown>) => assertFails(Promise.resolve(operation));

function common(recordType: string, ownerUid: string = OWNER) {
  return {
    ownerUid,
    schemaVersion: 1,
    recordType,
    boundary: "owner_footage_only_no_pose_analysis_v1",
    dataClass: "owner_private_raw_footage_v1",
    retentionClass: "owner_deleted_v1",
    consentReference: "owner_cloud_footage_consent_v1",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function clipDocument(slotId: string, overrides: Record<string, unknown> = {}, ownerUid: string = OWNER) {
  const [view, take] = slotId.split("-");
  return {
    ...common("film_shot_clip_v1", ownerUid),
    shotId: SHOT,
    slotId,
    view,
    takeIndex: Number(take),
    durationMs: 4433,
    width: 1080,
    height: 1920,
    byteLength: 2_824_524,
    contentType: "video/mp4",
    storagePath: `users/${ownerUid}/filmShots/${SHOT}/${slotId}`,
    ...overrides,
  };
}

function headDocument(clipIds: string[] = ["front-0", "shooting_side-0"], overrides: Record<string, unknown> = {}) {
  return {
    ...common("film_shot_head_v1"),
    status: "complete",
    deletionState: "active",
    shotId: SHOT,
    title: "내 슛폼 1",
    clipIds,
    clipCount: clipIds.length,
    ...overrides,
  };
}

const headRef = (db: Firestore, uid = OWNER) => doc(db, "users", uid, "filmShots", SHOT);
const clipRef = (db: Firestore, slotId: string, uid = OWNER) => doc(db, "users", uid, "filmShots", SHOT, "clips", slotId);
const ownerDb = () => testEnv.authenticatedContext(OWNER).firestore() as unknown as Firestore;
const intruderDb = () => testEnv.authenticatedContext(INTRUDER).firestore() as unknown as Firestore;
const anonymousDb = () => testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
const ownerStorage = () => testEnv.authenticatedContext(OWNER).storage();
const intruderStorage = () => testEnv.authenticatedContext(INTRUDER).storage();
const anonymousStorage = () => testEnv.unauthenticatedContext().storage();
const objectPath = (slotId: string, uid = OWNER) => `users/${uid}/filmShots/${SHOT}/${slotId}`;
const bytes = (length = 1024) => new Uint8Array(length).fill(7);

async function publishShot(db: Firestore, clipIds: string[] = ["front-0", "shooting_side-0"]) {
  for (const slotId of clipIds) {
    await succeeds(ownerStorage().ref(objectPath(slotId)).put(bytes(), { contentType: "video/mp4" }));
    await succeeds(setDoc(clipRef(db, slotId), clipDocument(slotId)));
  }
  await succeeds(setDoc(headRef(db), headDocument(clipIds)));
}

beforeAll(async () => {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (!firestoreHost || !storageHost) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST and FIREBASE_STORAGE_EMULATOR_HOST must both be set. Run this suite through `pnpm test:rules`, which starts both emulators. It must never be skipped or reported as passing without them.",
    );
  }
  const [fHost, fPort] = firestoreHost.split(":");
  const [sHost, sPort] = storageHost.split(":");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: fHost, port: Number(fPort) },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: sHost, port: Number(sPort) },
  });
});

afterEach(async () => {
  if (!testEnv) return;
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

describe("cloud film shot objects (storage.rules)", () => {
  it("lets the owner create, read and delete a bounded video object under their own prefix, once", async () => {
    const ref = ownerStorage().ref(objectPath("front-0"));
    await succeeds(ref.put(bytes(), { contentType: "video/mp4" }));
    await succeeds(ref.getDownloadURL());
    // No overwrite: a second create of the same object is refused.
    await fails(ref.put(bytes(2048), { contentType: "video/mp4" }));
    await succeeds(ownerStorage().ref(objectPath("shooting_side-0")).put(bytes(), { contentType: "video/quicktime" }));
    await succeeds(ref.delete());
  });

  it("refuses the wrong content type, an empty object, a foreign slot id and a bad shot id", async () => {
    await fails(ownerStorage().ref(objectPath("front-0")).put(bytes(), { contentType: "image/png" }));
    await fails(ownerStorage().ref(objectPath("front-0")).put(new Uint8Array(0), { contentType: "video/mp4" }));
    await fails(ownerStorage().ref(objectPath("sideways-0")).put(bytes(), { contentType: "video/mp4" }));
    await fails(ownerStorage().ref(`users/${OWNER}/filmShots/bad shot/front-0`).put(bytes(), { contentType: "video/mp4" }));
    await fails(ownerStorage().ref(`users/${OWNER}/other/front-0`).put(bytes(), { contentType: "video/mp4" }));
  });

  it("keeps every other account and anonymous visitors out of the owner's prefix", async () => {
    await succeeds(ownerStorage().ref(objectPath("front-0")).put(bytes(), { contentType: "video/mp4" }));
    await fails(intruderStorage().ref(objectPath("front-0")).getDownloadURL());
    await fails(intruderStorage().ref(objectPath("front-0")).delete());
    await fails(intruderStorage().ref(objectPath("shooting_side-0")).put(bytes(), { contentType: "video/mp4" }));
    await fails(intruderStorage().ref(`users/${OWNER}/filmShots/${SHOT}`).listAll());
    await fails(anonymousStorage().ref(objectPath("front-0")).getDownloadURL());
    await fails(anonymousStorage().ref(objectPath("front-1")).put(bytes(), { contentType: "video/mp4" }));
  });
});

describe("cloud film shot documents (firestore.rules)", () => {
  it("publishes clip documents then the head, and the owner can read and list", async () => {
    const db = ownerDb();
    await publishShot(db);
    await succeeds(getDoc(headRef(db)));
    await succeeds(getDoc(clipRef(db, "front-0")));
    await succeeds(getDocs(collection(db, "users", OWNER, "filmShots")));
    await succeeds(getDocs(collection(db, "users", OWNER, "filmShots", SHOT, "clips")));
  });

  it("refuses a head before its clips, a head naming a missing clip, and a clip under a published head", async () => {
    const db = ownerDb();
    await fails(setDoc(headRef(db), headDocument()));
    await succeeds(setDoc(clipRef(db, "front-0"), clipDocument("front-0")));
    await fails(setDoc(headRef(db), headDocument(["front-0", "shooting_side-0"])));
    await succeeds(setDoc(headRef(db), headDocument(["front-0"])));
    await fails(setDoc(clipRef(db, "shooting_side-0"), clipDocument("shooting_side-0")));
  });

  it("refuses every drift in a clip document", async () => {
    const db = ownerDb();
    await fails(setDoc(clipRef(db, "front-0"), clipDocument("front-0", { storagePath: `users/${OWNER}/filmShots/${SHOT}/front-1` })));
    await fails(setDoc(clipRef(db, "front-0"), clipDocument("front-0", { storagePath: `users/${INTRUDER}/filmShots/${SHOT}/front-0` })));
    await fails(setDoc(clipRef(db, "front-0"), clipDocument("front-0", { view: "shooting_side" })));
    await fails(setDoc(clipRef(db, "front-0"), clipDocument("front-0", { takeIndex: 1 })));
    await fails(setDoc(clipRef(db, "front-0"), clipDocument("front-0", { durationMs: 100 })));
    await fails(setDoc(clipRef(db, "front-0"), clipDocument("front-0", { byteLength: 64 * 1024 * 1024 + 1 })));
    await fails(setDoc(clipRef(db, "front-0"), clipDocument("front-0", { contentType: "image/png" })));
    await fails(setDoc(clipRef(db, "front-0"), clipDocument("front-0", { fileName: "a.mp4" })));
    await fails(setDoc(clipRef(db, "front-0"), clipDocument("front-0", { ownerUid: INTRUDER })));
    await fails(setDoc(clipRef(db, "front-0"), clipDocument("front-0", { createdAt: new Date() })));
    await fails(setDoc(clipRef(db, "front-0"), clipDocument("front-1")));
    await succeeds(setDoc(clipRef(db, "front-0"), clipDocument("front-0")));
    await fails(updateDoc(clipRef(db, "front-0"), { durationMs: 5000 }));
  });

  it("refuses every drift in a head document", async () => {
    const db = ownerDb();
    await succeeds(setDoc(clipRef(db, "front-0"), clipDocument("front-0")));
    await fails(setDoc(headRef(db), headDocument(["front-0"], { title: "shot.mp4" })));
    await fails(setDoc(headRef(db), headDocument(["front-0"], { title: "x".repeat(25) })));
    await fails(setDoc(headRef(db), headDocument(["front-0", "front-0"])));
    await fails(setDoc(headRef(db), headDocument(["front-0"], { clipCount: 2 })));
    await fails(setDoc(headRef(db), headDocument(["front-9"])));
    await fails(setDoc(headRef(db), headDocument(["front-0"], { deletionState: "in_progress" })));
    await fails(setDoc(headRef(db), headDocument(["front-0"], { status: "pending" })));
    await fails(setDoc(headRef(db), headDocument(["front-0"], { ownerUid: INTRUDER })));
    await fails(setDoc(headRef(db), headDocument(["front-0"], { fileName: "a.mp4" })));
    await fails(setDoc(headRef(db), headDocument(["front-0"], { createdAt: new Date() })));
    await succeeds(setDoc(headRef(db), headDocument(["front-0"])));
    await fails(updateDoc(headRef(db), { title: "다른 이름", updatedAt: serverTimestamp() }));
  });

  it("keeps every other account and anonymous visitors out of the owner's documents", async () => {
    await publishShot(ownerDb());
    const intruder = intruderDb();
    await fails(getDoc(headRef(intruder)));
    await fails(getDocs(collection(intruder, "users", OWNER, "filmShots")));
    await fails(setDoc(clipRef(intruder, "front-1"), clipDocument("front-1")));
    await fails(setDoc(doc(intruder, "users", INTRUDER, "filmShots", SHOT), headDocument(["front-0"], { ownerUid: INTRUDER })));
    await fails(deleteDoc(headRef(intruder)));
    await fails(getDoc(headRef(anonymousDb())));
  });

  it("deletes in order: transition, then clips, then the head; never the head first", async () => {
    const db = ownerDb();
    await publishShot(db);
    await fails(deleteDoc(headRef(db)));
    await fails(deleteDoc(clipRef(db, "front-0")));
    await fails(updateDoc(headRef(db), { deletionState: "in_progress" }));
    await succeeds(updateDoc(headRef(db), { deletionState: "in_progress", updatedAt: serverTimestamp() }));
    await fails(updateDoc(headRef(db), { deletionState: "active", updatedAt: serverTimestamp() }));
    await fails(deleteDoc(headRef(db)));
    for (const slotId of ["front-0", "shooting_side-0"]) {
      await succeeds(ownerStorage().ref(objectPath(slotId)).delete());
      await succeeds(deleteDoc(clipRef(db, slotId)));
    }
    await succeeds(deleteDoc(headRef(db)));
    for (const slotId of ALL_SLOTS) await fails(getDoc(clipRef(intruderDb(), slotId)));
  });
});
