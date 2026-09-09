import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import type { CoachRequestV1, CoachResponseV1 } from "@/lib/coach/contract";
import { deterministicCoachResponse } from "@/lib/coach/deterministic-provider";
import { buildCoachFeedEvent, type CoachFeedEventV1 } from "@/lib/coach/feed-event";
import { buildCoachRequest } from "@/lib/coach/representative-profile-adapter";
import { coachReelFromFeedEvent } from "@/lib/feed/coach-reel-adapter";
import type { ReelItem } from "@/lib/feed/reel-model";
import { interpolatePoseFrame, type PoseMotion, type Vector3 } from "@/lib/pose-motion";
import {
  PERSISTED_JOINT_NAMES_V2,
  type CaptureProtocolV2,
  type JointUncertaintyV2,
  type PersistedJointMapV2,
  type PersistedJointNameV2,
  type RepresentativePose4DV2,
  type RepresentativePoseFrameV2,
  type ShootingHandV2,
} from "@/lib/shooting-profile/types";

/**
 * Typed fixtures for the Reel harness and its tests.
 *
 * The representative profile below is derived from the audited CMU reference
 * motion so the harness has a schema-shaped `RepresentativePose4DV2` without
 * touching capture, the pipeline or persistence. It is a UI fixture: it never
 * claims to be a measured profile, it lives only behind the dev route, and it
 * keeps the boundary literal the product uses everywhere else.
 *
 * The coaching moment goes through the frozen C2 contract end to end:
 * profile → `buildCoachRequest` → deterministic Coach → `buildCoachFeedEvent`
 * → `coachReelFromFeedEvent`. No fixture text is invented for the coach.
 */
const FRAME_COUNT = 101;
/** Narrow enough for a medium band under the Basic cap, so the fixture yields an eligible coaching moment. */
const FIXTURE_CONE_DEGREES = 8;
const FIXTURE_COVARIANCE: JointUncertaintyV2["covariance"] = [0.01, 0, 0, 0.01, 0, 0.01];
const PHASE_ANCHORS = [
  { id: "ready", phase: 0 },
  { id: "deepestDip", phase: 0.25 },
  { id: "rise", phase: 0.5 },
  { id: "releaseProxy", phase: 0.75 },
  { id: "followThrough", phase: 1 },
] as const;
/** Fixed so the fixture event is deterministic; the harness is not a clock. */
export const FIXTURE_NOW_MS = 1_800_000_000_000;
export const FIXTURE_REQUEST_ID = "req_fixture0000000001";
export const FIXTURE_EVENT_ID = "evt_fixture0000000001";
export const FIXTURE_PROFILE_ID = "fixture-profile-0001";

function midpoint(a: Vector3, b: Vector3): Vector3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function distance(a: Vector3, b: Vector3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Pelvis-centred joints in shoulder-breadth units, the frame the viewer expects. */
function fixtureFrame(motion: PoseMotion, phase: number, breadth: number): RepresentativePoseFrameV2 {
  const source = interpolatePoseFrame(motion, phase).joints;
  const pelvis = midpoint(source.leftHip, source.rightHip);
  const joints = Object.fromEntries(PERSISTED_JOINT_NAMES_V2.map((joint) => {
    const point = source[joint];
    return [joint, {
      x: (point.x - pelvis.x) / breadth,
      y: (point.y - pelvis.y) / breadth,
      z: (point.z - pelvis.z) / breadth,
    }];
  })) as PersistedJointMapV2;
  const uncertainty = Object.fromEntries(PERSISTED_JOINT_NAMES_V2.map((joint) => [
    joint,
    { model: "heuristic_v1", covariance: [...FIXTURE_COVARIANCE], directionalConeDegrees: FIXTURE_CONE_DEGREES },
  ])) as Record<PersistedJointNameV2, JointUncertaintyV2>;
  return { phase, joints, uncertainty };
}

export function representativeFixtureFromMotion(
  motion: PoseMotion,
  shootingHand: ShootingHandV2,
  mode: CaptureProtocolV2 = "basic_1_plus_1",
): RepresentativePose4DV2 {
  const ready = interpolatePoseFrame(motion, 0).joints;
  const breadth = Math.max(1e-6, distance(ready.leftShoulder, ready.rightShoulder));
  const frames = Array.from({ length: FRAME_COUNT }, (_, index) => fixtureFrame(motion, index / (FRAME_COUNT - 1), breadth));
  return {
    schemaVersion: 2,
    boundary: "representative_phase_fused_4d_estimate_not_actual_3d",
    mode,
    timeBasis: "normalized_shot_phase",
    units: "template_shoulder_breadths",
    frames,
    phaseAnchors: PHASE_ANCHORS.map((anchor) => ({ ...anchor })),
    quality: { passed: true, reasons: [] },
  };
}

/** The frozen-contract chain the harness coach reel is built from, exposed so tests can pin each link. */
export type ReelLabCoachChain = {
  request: CoachRequestV1;
  response: CoachResponseV1;
  event: CoachFeedEventV1;
};

export function reelLabCoachChain(profile: RepresentativePose4DV2, shootingHand: ShootingHandV2): ReelLabCoachChain {
  const request = buildCoachRequest({
    profile,
    shootingHand,
    requestId: FIXTURE_REQUEST_ID,
    locale: "ko",
    player: { skillLevel: "developing", trainingGoal: "consistency" },
    action: "jump_shot",
  });
  const response = deterministicCoachResponse(request);
  const event = buildCoachFeedEvent({
    eventId: FIXTURE_EVENT_ID,
    profileId: FIXTURE_PROFILE_ID,
    request,
    result: { status: "ok", response },
    now: FIXTURE_NOW_MS,
  });
  return { request, response, event };
}

/**
 * The three Reel families the harness shows: own loop, coaching moment,
 * anonymous reference. The shooting hand is the one the reference motion is
 * audited for. The coaching moment exists only if the frozen feed event is
 * eligible, exactly as Home will behave.
 */
export function reelLabFixtures(): ReelItem[] {
  const reference = ANONYMOUS_POSE_REFERENCES[0];
  const shootingHand: ShootingHandV2 = "right";
  const profile = representativeFixtureFromMotion(reference.motion, shootingHand);
  const motion = { source: "representative", profile, shootingHand } as const;
  const { request, event } = reelLabCoachChain(profile, shootingHand);
  const coach = coachReelFromFeedEvent({ event, request, motion });
  return [
    {
      kind: "user",
      id: "fixture-user-reel",
      author: "내 슛폼",
      caption: "오늘 대표 슛폼 · 픽스처",
      motion,
    },
    ...(coach ? [coach] : []),
    {
      kind: "reference",
      id: `fixture-reference-${reference.id}`,
      label: reference.shortLabel,
      attribution: "CMU optical mocap",
      motion: { source: "reference", motion: reference.motion, hand: shootingHand },
    },
  ];
}
