import type { User } from "firebase/auth";

import { PROFILE_EMAIL_REQUIRED, ensureFirebaseProfile } from "@/lib/firebase-private-data";

export type ProfileSyncOutcome =
  | { status: "synced" }
  | { status: "failed"; code: string; message: string };

const EMAIL_REQUIRED_MESSAGE =
  "이 계정에는 이메일 주소가 없어 프로필을 만들 수 없습니다. 이메일로 가입한 계정으로 다시 로그인하세요.";
const GENERIC_MESSAGE = "프로필 동기화에 실패했습니다. 연결을 확인한 뒤 다시 로그인하면 복구를 재시도합니다.";

/** Keeps the user-facing sentence Korean while preserving the SDK detail for support. */
function failureMessage(error: unknown): string {
  const detail = error instanceof Error && error.message ? error.message : "";
  return detail ? `${GENERIC_MESSAGE} (${detail})` : GENERIC_MESSAGE;
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code) return code;
  }
  return "profile_sync_failed";
}

/**
 * Runs the owner-profile upsert and reports the outcome instead of throwing, so a
 * sign-in that succeeded at the auth layer is not rolled back by a profile write
 * failure — and so the caller can show that the session is incomplete rather than
 * presenting it as fully signed in. The upsert is idempotent, so the next sign-in
 * repairs a profile an earlier attempt failed to create.
 */
export async function syncOwnerProfile(user: User): Promise<ProfileSyncOutcome> {
  try {
    await ensureFirebaseProfile(user);
    return { status: "synced" };
  } catch (error) {
    const code = errorCode(error);
    if (code === PROFILE_EMAIL_REQUIRED) {
      return { status: "failed", code, message: EMAIL_REQUIRED_MESSAGE };
    }
    return { status: "failed", code, message: failureMessage(error) };
  }
}
