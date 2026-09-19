import {
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  type User,
} from "firebase/auth";
import { deleteDoc, doc } from "firebase/firestore";

import { firestore } from "@/lib/firebase";
import {
  listFirebasePrivatePoses,
  removeFirebasePrivatePose,
} from "@/lib/firebase-private-data";
import {
  deleteShootingProfileV2,
  listShootingProfilesV2,
  resumePendingShootingProfileDeletionsV2,
} from "@/lib/firebase-shooting-profiles";

export type AccountDeletionPort = {
  reauthenticate: () => Promise<void>;
  resumePendingV2: () => Promise<void>;
  listV2ProfileIds: () => Promise<string[]>;
  deleteV2Profile: (profileId: string) => Promise<void>;
  listLegacyPoseIds: () => Promise<string[]>;
  deleteLegacyPose: (poseId: string) => Promise<void>;
  deleteLegacyRoot: () => Promise<void>;
  deleteAuthUser: () => Promise<void>;
};

/**
 * Executes account deletion in the only safe order for an owner-bound client:
 * reauthenticate first, erase cloud data, and remove the Auth principal last.
 * Any failure naturally aborts the remaining destructive steps.
 */
export async function runAccountDeletion(port: AccountDeletionPort): Promise<void> {
  await port.reauthenticate();
  await port.resumePendingV2();

  const v2ProfileIds = await port.listV2ProfileIds();
  for (const profileId of v2ProfileIds) {
    await port.deleteV2Profile(profileId);
  }

  const legacyPoseIds = await port.listLegacyPoseIds();
  for (const poseId of legacyPoseIds) {
    await port.deleteLegacyPose(poseId);
  }

  await port.deleteLegacyRoot();
  await port.deleteAuthUser();
}

/**
 * Firebase adapter for the pure deletion orchestrator. Validation and
 * reauthentication happen before the first destructive operation.
 */
export async function deleteFirebaseAccount(user: User, password: string): Promise<void> {
  const email = user.email?.trim();
  if (!email) {
    throw new Error("계정 삭제를 위해 이메일 로그인 계정이 필요합니다.");
  }
  if (!password.trim()) {
    throw new Error("계정 삭제를 위해 현재 비밀번호를 입력하세요.");
  }
  const db = firestore;
  if (!db) {
    throw new Error("Firebase Firestore 연결 설정이 아직 완료되지 않았습니다.");
  }

  const authCredential = EmailAuthProvider.credential(email, password);

  await runAccountDeletion({
    reauthenticate: async () => {
      await reauthenticateWithCredential(user, authCredential);
    },
    resumePendingV2: async () => {
      await resumePendingShootingProfileDeletionsV2(user);
    },
    listV2ProfileIds: async () => {
      const profiles = await listShootingProfilesV2(user);
      return profiles.map((profile) => profile.id);
    },
    deleteV2Profile: async (profileId) => {
      await deleteShootingProfileV2(user, profileId);
    },
    listLegacyPoseIds: async () => {
      const poses = await listFirebasePrivatePoses(user);
      return poses.map((pose) => pose.id);
    },
    deleteLegacyPose: async (poseId) => {
      await removeFirebasePrivatePose(user, poseId);
    },
    deleteLegacyRoot: async () => {
      await deleteDoc(doc(db, "users", user.uid));
    },
    deleteAuthUser: async () => {
      await deleteUser(user);
    },
  });
}
