import type { User } from "firebase/auth";

import { PREVIEW_PROFILE_ID, PREVIEW_USER_UID, buildPreviewData, type PreviewData } from "@/lib/preview/preview-runtime";
import type { ShootingProfileSource } from "@/lib/shooting-profile-source";

/**
 * In-memory stand-in for the owner's profile store. Listing is instant (the
 * library's summaries); a record is built through the real pipeline the
 * first time its id is opened, so a long grid fills tile by tile instead of
 * blocking. Deletion hides a preview profile for this page session; saving a
 * capture brings the primary preview profile back and returns its id, so the
 * capture flow ends on a real, pre-rendered analysis route. Nothing is
 * persisted anywhere.
 */
export function createPreviewShootingProfileSource(data: PreviewData): ShootingProfileSource {
  const hidden = new Set<string>();
  const owned = (user: User | null | undefined): boolean => user?.uid === PREVIEW_USER_UID;
  // Yield to the event loop before a build so the screen that asked can paint first.
  const yieldFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  return {
    async listShootingProfilesV2(user) {
      if (!owned(user)) return [];
      return data.summaries.filter((summary) => !hidden.has(summary.id));
    },
    async getShootingProfileV2(user, profileId) {
      if (!owned(user) || hidden.has(profileId)) return null;
      if (!data.summaries.some((summary) => summary.id === profileId)) return null;
      await yieldFrame();
      return data.recordFor(profileId);
    },
    async deleteShootingProfileV2(user, profileId) {
      if (owned(user)) hidden.add(profileId);
    },
    async resumePendingShootingProfileDeletionsV2() {
      return undefined;
    },
    async saveShootingProfileV2(user) {
      if (!owned(user)) throw new Error("signed-in preview owner is required");
      hidden.delete(PREVIEW_PROFILE_ID);
      return PREVIEW_PROFILE_ID;
    },
    async listFirebasePrivatePoses() {
      return [];
    },
    async removeFirebasePrivatePose() {
      return undefined;
    },
  };
}

export const previewShootingProfileSource: ShootingProfileSource = createPreviewShootingProfileSource(buildPreviewData());
