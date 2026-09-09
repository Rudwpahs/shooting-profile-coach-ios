import { useEffect, useRef, useState } from "react";

import type { LatestRepresentativeState } from "@/hooks/use-latest-representative-profile";
import type { CoachRequestV1 } from "@/lib/coach/contract";
import type { CoachProvider, CoachProviderResult } from "@/lib/coach/provider";
import { buildHomeCoachRequest, homeCoachReel, opaqueId } from "@/lib/feed/home-coach";
import { createHomeCoachProvider } from "@/lib/feed/home-coach-provider";
import type { CoachReel } from "@/lib/feed/reel-model";
import type { UserShotProfile } from "@/lib/recommendation";

export type HomeCoachState = {
  /** `skipped` covers every way there is no coaching moment: unavailable, cancelled, stale, ineligible. */
  status: "idle" | "pending" | "ready" | "skipped";
  reel: CoachReel | null;
  result: CoachProviderResult | null;
};

const IDLE: HomeCoachState = { status: "idle", reel: null, result: null };

/**
 * One coaching moment for the latest representative profile. Asks the
 * provider once per profile (and again if the goal or skill changes), aborts
 * on change or unmount, and never lets an older answer land after a newer
 * request. The cooldown clock is per session until saved posts exist.
 */
export function useHomeCoachReel(
  latest: LatestRepresentativeState,
  userProfile: Pick<UserShotProfile, "skillLevel" | "goal">,
  provider: CoachProvider = defaultProvider(),
): HomeCoachState {
  const [state, setState] = useState<HomeCoachState>(IDLE);
  const profileId = latest.status === "ready" ? latest.summary.id : null;
  const { goal, skillLevel } = userProfile;
  const latestRef = useRef(latest);
  latestRef.current = latest;

  useEffect(() => {
    const current = latestRef.current;
    if (profileId === null || current.status !== "ready") {
      setState(IDLE);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setState({ status: "pending", reel: null, result: null });

    let request: CoachRequestV1;
    try {
      request = buildHomeCoachRequest({ latest: current, userProfile: { skillLevel, goal }, requestId: opaqueId("req") });
    } catch {
      setState({ status: "skipped", reel: null, result: null });
      return;
    }
    const motion = { source: "representative", profile: current.record.profile, shootingHand: current.record.shootingHand } as const;

    provider.coach(request, { signal: controller.signal }).then((result) => {
      if (!active) return;
      const { reel } = homeCoachReel({ request, result, eventId: opaqueId("evt"), profileId, now: Date.now(), lastEventAtMs: null, motion });
      setState({ status: reel ? "ready" : "skipped", reel, result });
    }).catch(() => {
      if (active) setState({ status: "skipped", reel: null, result: null });
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [goal, profileId, provider, skillLevel]);

  return state;
}

let shared: CoachProvider | null = null;
function defaultProvider(): CoachProvider {
  shared ??= createHomeCoachProvider();
  return shared;
}
