import type { User } from "firebase/auth";

import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { buildUiDemoFixtures, type UiDemoFixtures } from "@/lib/dev/ui-demo-fixtures";
import type { ShootingProfileSummaryV2 } from "@/lib/firebase-shooting-profiles";
import type { LocalFilmViewV1 } from "@/lib/film-space/types";
import {
  PREVIEW_SHOT_ARCHETYPES,
  PREVIEW_SHOT_IDS,
  buildPreviewShotRecord,
  findPreviewShotArchetype,
  previewShotSummary,
  type PreviewShotRecordV1,
} from "@/lib/preview/preview-shot-library";
import { profileReelId, referenceReelId, type ReelItem } from "@/lib/reels/reel-model";
import type { LandmarkSequenceV2, RepresentativePose4DV2 } from "@/lib/shooting-profile/types";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

/**
 * PREVIEW RUNTIME DATA. The install-free web preview runs the real app with
 * one synthetic signed-in user and the preview shot library: representative
 * profiles generated from the synthetic landmark session the test-suite uses,
 * one deterministic style per archetype. No account, no network, no
 * recording, no person. Loaded only behind the preview-build gate.
 */

export const PREVIEW_USER_UID = "preview-user";
/** The primary preview profile: the capture flow saves into it and Home shows it as the latest. */
export const PREVIEW_PROFILE_ID = PREVIEW_SHOT_IDS[0];
export const PREVIEW_PROFILE_IDS: readonly string[] = PREVIEW_SHOT_IDS;

export const previewUser = Object.freeze({
  uid: PREVIEW_USER_UID,
  displayName: "미리보기",
  email: null,
  emailVerified: false,
  isAnonymous: true,
  phoneNumber: null,
  photoURL: null,
  providerId: "preview",
  tenantId: null,
  metadata: {},
  providerData: [],
  refreshToken: "",
}) as unknown as User;

export type PreviewData = Readonly<{
  fixtures: UiDemoFixtures;
  /** Every preview profile, newest first. Instant: no pipeline run. */
  summaries: readonly ShootingProfileSummaryV2[];
  /** The primary preview profile's record (built on first access). */
  record: PreviewShotRecordV1;
  profile: RepresentativePose4DV2;
  recaptureProfile: RepresentativePose4DV2;
  reels: readonly ReelItem[];
  /** The record for any preview profile id, built through the real pipeline on first access. */
  recordFor(profileId: string): PreviewShotRecordV1 | null;
  /** The synthetic sequence that stands in for an accepted clip of this view and take. */
  sequenceFor(view: LocalFilmViewV1, takeIndex: number): LandmarkSequenceV2 | null;
}>;

let cached: PreviewData | null = null;

export function buildPreviewData(): PreviewData {
  if (cached) return cached;
  const summaries = Object.freeze(PREVIEW_SHOT_ARCHETYPES.map(previewShotSummary));
  const primary = PREVIEW_SHOT_ARCHETYPES[0];
  let fixtures: UiDemoFixtures | null = null;
  let sequences: Map<string, LandmarkSequenceV2> | null = null;
  let reels: readonly ReelItem[] | null = null;

  const recordFor = (profileId: string): PreviewShotRecordV1 | null => {
    const entry = findPreviewShotArchetype(profileId);
    return entry ? buildPreviewShotRecord(entry) : null;
  };
  const demoFixtures = () => {
    if (!fixtures) fixtures = buildUiDemoFixtures();
    return fixtures;
  };

  cached = Object.freeze({
    get fixtures() {
      return demoFixtures();
    },
    summaries,
    get record() {
      return buildPreviewShotRecord(primary);
    },
    get profile() {
      return buildPreviewShotRecord(primary).profile;
    },
    get recaptureProfile() {
      return demoFixtures().recaptureProfile;
    },
    get reels() {
      if (!reels) {
        const record = buildPreviewShotRecord(primary);
        reels = Object.freeze([
          {
            kind: "profile" as const,
            id: profileReelId(primary.id),
            profileId: primary.id,
            profile: record.profile,
            shootingHand: record.shootingHand,
            confidence: record.confidence,
            createdAt: summaries[0].createdAt.toDate(),
          },
          ...ANONYMOUS_POSE_REFERENCES.map((reference): ReelItem => ({ kind: "reference", id: referenceReelId(reference.id), reference })),
        ]);
      }
      return reels;
    },
    recordFor,
    sequenceFor: (view, takeIndex) => {
      if (!sequences) {
        sequences = new Map();
        const session = syntheticLandmarkSession({ mode: "high_accuracy_3_plus_3", shootingHand: "right" });
        for (const sequence of [...session.front, ...session.shootingSide]) {
          sequences.set(`${sequence.view}-${sequence.takeIndex}`, sequence);
        }
      }
      return sequences.get(`${view}-${takeIndex}`) ?? null;
    },
  });
  return cached;
}
