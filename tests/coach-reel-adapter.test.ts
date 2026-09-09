import { describe, expect, it } from "vitest";

import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { parseCoachRequestV1, parseCoachResponseForRequest } from "@/lib/coach/contract";
import { buildCoachFeedEvent, parseCoachFeedEventV1 } from "@/lib/coach/feed-event";
import { coachReelFromFeedEvent } from "@/lib/feed/coach-reel-adapter";
import { FIXTURE_EVENT_ID, reelLabCoachChain, reelLabFixtures, representativeFixtureFromMotion } from "@/lib/feed/reel-fixtures";
import { reelLabel, reelLine } from "@/lib/feed/reel-model";

const reference = ANONYMOUS_POSE_REFERENCES[0];
const profile = representativeFixtureFromMotion(reference.motion, "right");
const motion = { source: "representative", profile, shootingHand: "right" } as const;
const chain = reelLabCoachChain(profile, "right");

describe("CoachFeedEventV1 -> CoachReel", () => {
  it("builds the harness coaching moment through the frozen contract, link by link", () => {
    expect(parseCoachRequestV1(chain.request).ok).toBe(true);
    expect(parseCoachResponseForRequest(chain.request, chain.response).status).toBe("ok");
    expect(parseCoachFeedEventV1(chain.event).ok).toBe(true);
    expect(chain.event.eligibility).toMatchObject({ eligible: true, reasons: [] });
    expect(chain.event.event_class).toBe("new_representative_profile");
  });

  it("renders an eligible event as one message and the cue label, with the anchor resolved from the measured observation", () => {
    const reel = coachReelFromFeedEvent({ event: chain.event, request: chain.request, motion });
    expect(reel).not.toBeNull();
    if (!reel) return;
    expect(reel.id).toBe(`coach-${FIXTURE_EVENT_ID}`);
    expect(reel.message).toBe(chain.response.coaching_comment);
    expect(reel.observationLabel).toBe(chain.response.primary_visual_cue?.label ?? null);
    expect(reel.cueAnchor).toEqual({
      kind: "joints",
      observation_id: "obs_release_elbow_lateral_offset_sb",
      label: "릴리스 팔꿈치 정렬",
      joints: ["rightShoulder", "rightElbow"],
      phase_anchor: "releaseProxy",
    });
    expect(reelLine(reel)).toBe(chain.response.coaching_comment);
    expect(reelLabel(reel)).toBe("코치 · 릴리스 팔꿈치 정렬");
    expect(reelLine(reel)).not.toMatch(/[0-9%]/);
  });

  it("yields no reel for an ineligible event, so CoachReel count equals eligible event count", () => {
    const unavailable = buildCoachFeedEvent({
      eventId: FIXTURE_EVENT_ID,
      profileId: "fixture-profile-0001",
      request: chain.request,
      result: { status: "unavailable", reason: "offline", retryable: true, detail: null },
      now: 1,
    });
    expect(coachReelFromFeedEvent({ event: unavailable, request: chain.request, motion })).toBeNull();
    const cooling = buildCoachFeedEvent({
      eventId: FIXTURE_EVENT_ID,
      profileId: "fixture-profile-0001",
      request: chain.request,
      result: { status: "ok", response: chain.response },
      now: 1_800_000_000_000,
      lastEventAtMs: 1_800_000_000_000 - 1000,
    });
    expect(coachReelFromFeedEvent({ event: cooling, request: chain.request, motion })).toBeNull();
  });

  it("refuses an event that does not belong to the request it is shown with", () => {
    const other = { ...chain.request, request_id: "req_ffffffffffffffff" };
    expect(coachReelFromFeedEvent({ event: chain.event, request: other, motion })).toBeNull();
  });

  it("falls back to a text-only cue when the cue names the quality label", () => {
    const failedProfile = { ...profile, quality: { passed: false, reasons: ["uncertainty_exceeds_limit"] } };
    const failed = reelLabCoachChain(failedProfile, "right");
    expect(failed.response.primary_visual_cue).toEqual({ observation_id: "obs_capture_quality", label: "촬영 품질" });
    expect(failed.event.eligibility.eligible).toBe(false);
    const forced = { ...failed.event, eligibility: { eligible: true, reasons: [], cooldown_until_ms: null } };
    const reel = coachReelFromFeedEvent({ event: forced, request: failed.request, motion });
    expect(reel?.cueAnchor).toEqual({ kind: "text_only", observation_id: "obs_capture_quality", label: "촬영 품질" });
    expect(reel?.observationLabel).toBe("촬영 품질");
  });

  it("puts exactly one coach reel in the harness, between the user reel and the reference", () => {
    const items = reelLabFixtures();
    expect(items.map((item) => item.kind)).toEqual(["user", "coach", "reference"]);
    const coach = items[1];
    if (coach.kind !== "coach") throw new Error("fixture");
    expect(coach.message).toBe(chain.response.coaching_comment);
    expect(coach.cueAnchor?.kind).toBe("joints");
  });
});
