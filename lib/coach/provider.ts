import type { CoachProviderIdV1, CoachRequestV1, CoachResponseV1 } from "@/lib/coach/contract";

/**
 * The one boundary the app calls for coaching. Whether the deterministic
 * provider or the remote FormPath Coach service is behind it, the UI sees
 * the same four outcomes and never has to care which one answered.
 *
 * Every outcome is typed so a failure can be shown honestly and the Reel,
 * Motion Lift and Save keep working without a reply.
 */
export const COACH_UNAVAILABLE_REASONS = [
  "not_configured",
  "offline",
  "timeout",
  "http_error",
  "schema_invalid",
  "grounding_invalid",
  "provider_error",
] as const;
export type CoachUnavailableReason = (typeof COACH_UNAVAILABLE_REASONS)[number];

export type CoachProviderResult =
  | { status: "ok"; response: CoachResponseV1 }
  | { status: "unavailable"; reason: CoachUnavailableReason; retryable: boolean; detail: string | null }
  | { status: "cancelled" }
  /** A newer request was issued before this one answered; the answer belongs to the past. */
  | { status: "stale"; superseded_by: string };

export type CoachProviderOptions = {
  signal?: AbortSignal;
};

export interface CoachProvider {
  readonly id: CoachProviderIdV1;
  coach(request: CoachRequestV1, options?: CoachProviderOptions): Promise<CoachProviderResult>;
}

export const CANCELLED: CoachProviderResult = Object.freeze({ status: "cancelled" as const });

export function unavailable(reason: CoachUnavailableReason, retryable: boolean, detail: string | null = null): CoachProviderResult {
  return { status: "unavailable", reason, retryable, detail };
}

export function isUsableCoachResult(result: CoachProviderResult): result is Extract<CoachProviderResult, { status: "ok" }> {
  return result.status === "ok";
}
