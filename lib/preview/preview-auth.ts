import type { FirebaseAuthContextValue } from "@/lib/firebase-auth";
import { previewUser } from "@/lib/preview/preview-runtime";

/**
 * The preview is always signed in as the synthetic preview user. Sign-in and
 * sign-out are accepted and ignored; account deletion is refused because
 * there is no account.
 */
export const PREVIEW_AUTH_VALUE: FirebaseAuthContextValue = Object.freeze({
  user: previewUser,
  loading: false,
  configured: true,
  signIn: async () => undefined,
  signUp: async () => undefined,
  deleteAccount: async () => {
    throw new Error("미리보기 계정은 삭제할 수 없습니다.");
  },
  logout: async () => undefined,
});
