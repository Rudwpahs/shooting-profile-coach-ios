import { resolveCoachCueAnchor, type CoachRequestV1 } from "@/lib/coach/contract";
import type { CoachFeedEventV1 } from "@/lib/coach/feed-event";
import type { CoachReel, ReelMotion } from "@/lib/feed/reel-model";

/**
 * The one adapter from the frozen C2 contract to the CoachReel view model.
 *
 * Home renders a CoachReel only from an eligible `CoachFeedEventV1`; an
 * ineligible event yields nothing, so the count of CoachReels is exactly the
 * count of eligible events. The message is the one line the provider
 * returned and the cue is resolved from the observation the app measured,
 * never from prose.
 */
export type CoachReelFromEventInput = {
  event: CoachFeedEventV1;
  /** The request the event was built from; needed to resolve where the cue lives. */
  request: CoachRequestV1;
  motion: ReelMotion;
};

export function coachReelFromFeedEvent({ event, request, motion }: CoachReelFromEventInput): CoachReel | null {
  if (!event.eligibility.eligible || event.message === null || event.request_id !== request.request_id) return null;
  const cueAnchor = event.cue ? resolveCoachCueAnchor(request, event.cue) : null;
  return {
    kind: "coach",
    id: `coach-${event.event_id}`,
    message: event.message,
    observationLabel: cueAnchor?.label ?? null,
    cueAnchor,
    motion,
  };
}
