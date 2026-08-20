import type { User } from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc, type Timestamp } from "firebase/firestore";

import { firestore } from "@/lib/firebase";

export type FirebasePrivatePose = {
  id: string;
  sourceLabel: string;
  poseJson: string;
  qualityJson: string;
  createdAt?: Timestamp;
};

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

export async function saveFirebasePrivatePose(user: User, input: Omit<FirebasePrivatePose, "id" | "createdAt">) {
  const poseRef = doc(collection(requireFirestore(), "users", user.uid, "poses"));
  await setDoc(poseRef, { ...input, createdAt: serverTimestamp(), boundary: "monocular_relative_pose_not_metric_3d" });
  return poseRef.id;
}

export async function listFirebasePrivatePoses(user: User): Promise<FirebasePrivatePose[]> {
  const result = await getDocs(query(collection(requireFirestore(), "users", user.uid, "poses"), orderBy("createdAt", "desc")));
  return result.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<FirebasePrivatePose, "id">) }));
}

export async function removeFirebasePrivatePose(user: User, poseId: string) {
  await deleteDoc(doc(requireFirestore(), "users", user.uid, "poses", poseId));
}
