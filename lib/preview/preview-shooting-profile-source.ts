import type { ShootingProfileSource } from "@/lib/shooting-profile-source";

/**
 * The owner's profile store as the install-free preview sees it: empty. The
 * browser runs no pose analysis, so there is never a representative profile to
 * list, open or save; a capture ends as a film shot on the viewer's device
 * instead. Every read is instant, every delete is a no-op, and a save is an
 * error so no caller can mistake footage for an analysis.
 */
export function createPreviewShootingProfileSource(): ShootingProfileSource {
  return {
    async listShootingProfilesV2() {
      return [];
    },
    async getShootingProfileV2() {
      return null;
    },
    async deleteShootingProfileV2() {
      return undefined;
    },
    async resumePendingShootingProfileDeletionsV2() {
      return undefined;
    },
    async saveShootingProfileV2() {
      throw new Error("the install-free preview keeps footage as a film shot and never saves a representative profile");
    },
    async listFirebasePrivatePoses() {
      return [];
    },
    async removeFirebasePrivatePose() {
      return undefined;
    },
  };
}

export const previewShootingProfileSource: ShootingProfileSource = createPreviewShootingProfileSource();
