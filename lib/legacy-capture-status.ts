import { LEGACY_CLOUD_SAVE_DISABLED } from "@/lib/firebase-private-data";

export type LegacyCaptureOutcome = {
  state: "blocked" | "error";
  detail: string;
};

const BLOCKED_DETAIL =
  "분석은 이 기기에서 끝났습니다. 다만 기존 분석의 클라우드 저장은 현재 사용할 수 없어 이번 결과는 저장되지 않았습니다.";

function hasLegacyDisabledCode(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === LEGACY_CLOUD_SAVE_DISABLED;
}

/**
 * Maps a legacy save rejection onto what the user is told. A disabled cloud
 * write is reported as blocked with its own copy, never as a completed save.
 */
export function describeLegacySaveFailure(error: unknown): LegacyCaptureOutcome {
  if (hasLegacyDisabledCode(error)) {
    return { state: "blocked", detail: BLOCKED_DETAIL };
  }
  if (error instanceof Error && error.message) {
    return { state: "error", detail: error.message };
  }
  return { state: "error", detail: "영상 분석을 완료하지 못했습니다. 잠시 후 다시 시도하세요." };
}
