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
