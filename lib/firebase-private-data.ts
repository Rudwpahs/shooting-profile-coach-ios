import type { User } from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc, type Timestamp } from "firebase/firestore";

import { firestore } from "@/lib/firebase";
import type { FirebasePrivatePoseInput } from "@/lib/firebase-private-pose-contract";
import { LEGACY_CLOUD_SAVE_DISABLED as SHARED_LEGACY_CLOUD_SAVE_DISABLED } from "@/shared/const";

export type FirebasePrivatePose = {
  id: string;
  sourceLabel: string;
  poseJson: string;
  qualityJson: string;
  correctedMotionJson?: string;
  correctionJson?: string;
  createdAt?: Timestamp;
};

export const LEGACY_CLOUD_SAVE_DISABLED = SHARED_LEGACY_CLOUD_SAVE_DISABLED;

/**
 * Raised by the single legacy save boundary before any network call.
 *
 * The V1 payload carries data the product policy forbids in cloud storage:
 * all 33 MediaPipe landmarks including the face, native z, per-frame source
 * timestamps, and a label derived from the source video filename. Until a
 * minimised V1 record format is designed and reviewed, the boundary fails
 * closed instead of sanitising an unreviewed payload in place.
 */
export class LegacyCloudSaveDisabledError extends Error {
  readonly code: string = LEGACY_CLOUD_SAVE_DISABLED;

  constructor() {
    super(LEGACY_CLOUD_SAVE_DISABLED);
    this.name = "LegacyCloudSaveDisabledError";
  }
}

function requireFirestore() {
  if (!firestore) throw new Error("Firebase Firestore 연결 설정이 아직 완료되지 않았습니다.");
  return firestore;
}

export async function ensureFirebaseProfile(user: User) {
  await setDoc(doc(requireFirestore(), "users", user.uid), {
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Legacy V1 cloud persistence is disabled. This is the central Firestore write
 * boundary, so it refuses before any Firestore reference is created and before
 * anything leaves the device. Reading and deleting existing legacy documents
 * stays open so an owner can still inspect and remove data they already stored.
 * The matching SQL boundary is `savePersonalPoseAnalysis` in `server/db.ts`.
 */
export async function saveFirebasePrivatePose(
  _user: User,
  _input: FirebasePrivatePoseInput,
): Promise<never> {
  throw new LegacyCloudSaveDisabledError();
}

export async function listFirebasePrivatePoses(user: User): Promise<FirebasePrivatePose[]> {
  const result = await getDocs(query(collection(requireFirestore(), "users", user.uid, "poses"), orderBy("createdAt", "desc")));
  return result.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<FirebasePrivatePose, "id">) }));
}

export async function removeFirebasePrivatePose(user: User, poseId: string) {
  await deleteDoc(doc(requireFirestore(), "users", user.uid, "poses", poseId));
}
