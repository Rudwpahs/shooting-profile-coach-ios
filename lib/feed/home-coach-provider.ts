import { createAuthenticatedCoachTransport } from "@/lib/coach/authenticated-transport";
import { createDeterministicCoachProvider } from "@/lib/coach/deterministic-provider";
import { unavailable, type CoachProvider } from "@/lib/coach/provider";
import { RemoteCoachProvider } from "@/lib/coach/remote-provider";
import { firebaseAuth } from "@/lib/firebase";

/**
 * Which Coach answers Home. The remote FormPath Coach is used only when its
 * URL is configured at build time, through the authenticated transport that
 * sends the current Firebase user's ID token (no service key ever ships in
 * the app); otherwise the deterministic provider answers with fixed wording
 * over the same measured observations. There is no silent fallback from a
 * failing remote service to the deterministic one: an unavailable coach
 * means no CoachReel, so an outage or a bad endpoint is never dressed up.
 */
export type HomeCoachProviderOptions = {
  coachUrl?: string | null;
  getIdToken?: () => Promise<string | null>;
};

// Expo inlines EXPO_PUBLIC_* only when read as this literal expression.
const CONFIGURED_COACH_URL = process.env.EXPO_PUBLIC_FORMPATH_COACH_URL ?? null;

async function currentUserIdToken(): Promise<string | null> {
  const user = firebaseAuth?.currentUser;
  return user ? user.getIdToken() : null;
}

/** A remote endpoint that cannot be used (not HTTPS, has credentials or a query) answers unavailable, never deterministic. */
function unusableRemoteProvider(): CoachProvider {
  return {
    id: "remote_formpath_coach_v1",
    coach: async () => unavailable("not_configured", false, "coach endpoint invalid"),
  };
}

export function createHomeCoachProvider(options: HomeCoachProviderOptions = {}): CoachProvider {
  const url = (options.coachUrl === undefined ? CONFIGURED_COACH_URL : options.coachUrl)?.trim();
  if (!url) return createDeterministicCoachProvider();
  try {
    const transport = createAuthenticatedCoachTransport({ endpoint: url, getIdToken: options.getIdToken ?? currentUserIdToken });
    return new RemoteCoachProvider({ url, transport });
  } catch {
    return unusableRemoteProvider();
  }
}
