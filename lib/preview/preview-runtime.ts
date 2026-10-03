import type { User } from "firebase/auth";

/**
 * PREVIEW RUNTIME. The install-free web preview runs the real app with one
 * synthetic signed-in user and no stored representative profile: what it can
 * show is the anonymous optical-mocap reference and whatever footage the
 * viewer keeps on their own device as film shots. No account, no network, no
 * recording, no person. Loaded only behind the preview-build gate.
 */

export const PREVIEW_USER_UID = "preview-user";

export const previewUser = Object.freeze({
  uid: PREVIEW_USER_UID,
  displayName: "미리보기",
  email: null,
  emailVerified: false,
  isAnonymous: true,
  phoneNumber: null,
  photoURL: null,
  providerId: "preview",
  tenantId: null,
  metadata: {},
  providerData: [],
  refreshToken: "",
}) as unknown as User;
