import type { LatestRepresentativeState } from "@/hooks/use-latest-representative-profile";
import type { CoachLocaleV1, CoachRequestV1 } from "@/lib/coach/contract";
import { buildCoachFeedEvent, type CoachFeedEventV1 } from "@/lib/coach/feed-event";
import type { CoachProviderResult } from "@/lib/coach/provider";
import { buildCoachRequest } from "@/lib/coach/representative-profile-adapter";
import { coachReelFromFeedEvent } from "@/lib/feed/coach-reel-adapter";
import type { CoachReel, ReelMotion } from "@/lib/feed/reel-model";
import type { UserShotProfile } from "@/lib/recommendation";

/**
 * The Home coaching chain over the frozen C2 contract: the latest
 * representative profile becomes a request through the adapter, the reply
 * becomes a feed event, and only an eligible event becomes a CoachReel.
 * Nothing here reads a model's prose to decide anything.
 */
type ReadyLatest = Extract<LatestRepresentativeState, { status: "ready" }>;

/** Opaque, client-minted ids: they correlate a reply or an event and carry nothing else. */
export function opaqueId(prefix: "req" | "evt"): string {
  let hex = "";
  while (hex.length < 16) hex += Math.floor(Math.random() * 16).toString(16);
  return `${prefix}_${hex}`;
}

export type BuildHomeCoachRequestInput = {
  latest: ReadyLatest;
  userProfile: Pick<UserShotProfile, "skillLevel" | "goal">;
  requestId: string;
  locale?: CoachLocaleV1;
};

export function buildHomeCoachRequest({ latest, userProfile, requestId, locale = "ko" }: BuildHomeCoachRequestInput): CoachRequestV1 {
  return buildCoachRequest({
    profile: latest.record.profile,
    shootingHand: latest.record.shootingHand,
    requestId,
    locale,
    player: { skillLevel: userProfile.skillLevel, trainingGoal: userProfile.goal },
    action: "unknown",
  });
}

export type HomeCoachReelInput = {
  request: CoachRequestV1;
  result: CoachProviderResult;
  eventId: string;
  profileId: string;
  now: number;
  lastEventAtMs: number | null;
  motion: ReelMotion;
};

export function homeCoachReel(input: HomeCoachReelInput): { event: CoachFeedEventV1; reel: CoachReel | null } {
  const event = buildCoachFeedEvent({
    eventId: input.eventId,
    profileId: input.profileId,
    request: input.request,
    result: input.result,
    now: input.now,
    lastEventAtMs: input.lastEventAtMs,
  });
  return { event, reel: coachReelFromFeedEvent({ event, request: input.request, motion: input.motion }) };
}
