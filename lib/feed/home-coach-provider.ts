import { createDeterministicCoachProvider } from "@/lib/coach/deterministic-provider";
import type { CoachProvider } from "@/lib/coach/provider";
import { RemoteCoachProvider } from "@/lib/coach/remote-provider";

/**
 * Which Coach answers Home. The remote FormPath Coach is used only when its
 * URL is configured at build time; otherwise the deterministic provider
 * answers with fixed wording over the same measured observations. There is
 * no silent fallback from a failing remote service to the deterministic one:
 * an unavailable coach means no CoachReel, so an outage is never dressed up.
 */
export type HomeCoachProviderOptions = {
  coachUrl?: string | null;
};

// Expo inlines EXPO_PUBLIC_* only when read as this literal expression.
const CONFIGURED_COACH_URL = process.env.EXPO_PUBLIC_FORMPATH_COACH_URL ?? null;

export function createHomeCoachProvider(options: HomeCoachProviderOptions = { coachUrl: CONFIGURED_COACH_URL }): CoachProvider {
  const url = options.coachUrl?.trim();
  return url ? new RemoteCoachProvider({ url }) : createDeterministicCoachProvider();
}
