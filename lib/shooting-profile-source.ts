import type { User } from "firebase/auth";

import {
  listFirebasePrivatePoses as firebaseListPrivatePoses,
  removeFirebasePrivatePose as firebaseRemovePrivatePose,
  type FirebasePrivatePose,
} from "@/lib/firebase-private-data";
import {
  deleteShootingProfileV2 as firebaseDeleteShootingProfileV2,
  getShootingProfileV2 as firebaseGetShootingProfileV2,
  listShootingProfilesV2 as firebaseListShootingProfilesV2,
  resumePendingShootingProfileDeletionsV2 as firebaseResumePendingShootingProfileDeletionsV2,
  saveShootingProfileV2 as firebaseSaveShootingProfileV2,
  type SaveShootingProfileInputV2,
  type ShootingProfileSummaryV2,
  type ShootingProfileViewerRecordV2,
} from "@/lib/firebase-shooting-profiles";

export type { FirebasePrivatePose, SaveShootingProfileInputV2, ShootingProfileSummaryV2, ShootingProfileViewerRecordV2 };

/**
 * Every owner-bound profile read and write the screens perform. Production is
 * Firestore, unchanged. The install-free web preview swaps in a synthetic,
 * in-memory source behind a build-time-foldable gate so the same screens run
 * without an account; nothing else about the app differs.
 */
export type ShootingProfileSource = Readonly<{
  listShootingProfilesV2(user: User): Promise<ShootingProfileSummaryV2[]>;
  getShootingProfileV2(user: User, profileId: string): Promise<ShootingProfileViewerRecordV2 | null>;
  deleteShootingProfileV2(user: User, profileId: string): Promise<void>;
  resumePendingShootingProfileDeletionsV2(user: User): Promise<void>;
  saveShootingProfileV2(user: User, input: SaveShootingProfileInputV2): Promise<string>;
  listFirebasePrivatePoses(user: User): Promise<FirebasePrivatePose[]>;
  removeFirebasePrivatePose(user: User, poseId: string): Promise<void>;
}>;

const firebaseSource: ShootingProfileSource = {
  listShootingProfilesV2: firebaseListShootingProfilesV2,
  getShootingProfileV2: firebaseGetShootingProfileV2,
  deleteShootingProfileV2: firebaseDeleteShootingProfileV2,
  resumePendingShootingProfileDeletionsV2: firebaseResumePendingShootingProfileDeletionsV2,
  saveShootingProfileV2: firebaseSaveShootingProfileV2,
  listFirebasePrivatePoses: firebaseListPrivatePoses,
  removeFirebasePrivatePose: firebaseRemovePrivatePose,
};

function resolveShootingProfileSource(): ShootingProfileSource {
  // Literal gate: Metro inlines the public env var and folds the dead branch, so an ordinary
  // production bundle never contains the preview runtime.
  if (process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const preview = require("@/lib/preview/preview-shooting-profile-source") as typeof import("@/lib/preview/preview-shooting-profile-source");
    return preview.previewShootingProfileSource;
  }
  return firebaseSource;
}

const source = resolveShootingProfileSource();

export const listShootingProfilesV2 = source.listShootingProfilesV2;
export const getShootingProfileV2 = source.getShootingProfileV2;
export const deleteShootingProfileV2 = source.deleteShootingProfileV2;
export const resumePendingShootingProfileDeletionsV2 = source.resumePendingShootingProfileDeletionsV2;
export const saveShootingProfileV2 = source.saveShootingProfileV2;
export const listFirebasePrivatePoses = source.listFirebasePrivatePoses;
export const removeFirebasePrivatePose = source.removeFirebasePrivatePose;
