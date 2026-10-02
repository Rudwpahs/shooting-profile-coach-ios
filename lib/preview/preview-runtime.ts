import type { User } from "firebase/auth";

import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import { buildUiDemoFixtures, type UiDemoFixtures } from "@/lib/dev/ui-demo-fixtures";
import type { ShootingProfileSummaryV2, ShootingProfileViewerRecordV2 } from "@/lib/firebase-shooting-profiles";
import type { LocalFilmViewV1 } from "@/lib/film-space/types";
import { profileReelId, referenceReelId, type ReelItem } from "@/lib/reels/reel-model";
import type { LandmarkSequenceV2, RepresentativePose4DV2 } from "@/lib/shooting-profile/types";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

/**
 * PREVIEW RUNTIME DATA. The install-free web preview runs the real app with
 * one synthetic signed-in user and representative profiles derived from the
 * synthetic landmark session the test-suite uses: no account, no network, no
 * recording, no person. Loaded only behind the preview-build gate.
 */

export const PREVIEW_USER_UID = "preview-user";
export const PREVIEW_PROFILE_ID = "preview-shot-001";
export const PREVIEW_PROFILE_IDS: readonly string[] = Object.freeze([
  "preview-shot-001",
  "preview-shot-002",
  "preview-shot-003",
]);

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
  summaries: readonly ShootingProfileSummaryV2[];
  record: NonNullable<ShootingProfileViewerRecordV2>;
  profile: RepresentativePose4DV2;
  recaptureProfile: RepresentativePose4DV2;
  reels: readonly ReelItem[];
  /** The synthetic sequence that stands in for an accepted clip of this view and take. */
  sequenceFor(view: LocalFilmViewV1, takeIndex: number): LandmarkSequenceV2 | null;
}>;

let cached: PreviewData | null = null;

export function buildPreviewData(): PreviewData {
  if (cached) return cached;
  const fixtures = buildUiDemoFixtures();
  const summaries = fixtures.summaries.slice(0, PREVIEW_PROFILE_IDS.length).map((summary, index) => ({
    ...summary,
    id: PREVIEW_PROFILE_IDS[index],
  }));
  const primary = summaries[0];
  const reels: ReelItem[] = [
    {
      kind: "profile",
      id: profileReelId(primary.id),
      profileId: primary.id,
      profile: fixtures.profile,
      shootingHand: "right",
      confidence: fixtures.record.confidence,
      createdAt: primary.createdAt.toDate(),
    },
    ...ANONYMOUS_POSE_REFERENCES.map((reference): ReelItem => ({ kind: "reference", id: referenceReelId(reference.id), reference })),
  ];

  const session = syntheticLandmarkSession({ mode: "high_accuracy_3_plus_3", shootingHand: "right" });
  const sequences = new Map<string, LandmarkSequenceV2>();
  for (const sequence of [...session.front, ...session.shootingSide]) {
    sequences.set(`${sequence.view}-${sequence.takeIndex}`, sequence);
  }

  cached = Object.freeze({
    fixtures,
    summaries,
    record: fixtures.record,
    profile: fixtures.profile,
    recaptureProfile: fixtures.recaptureProfile,
    reels,
    sequenceFor: (view, takeIndex) => sequences.get(`${view}-${takeIndex}`) ?? null,
  });
  return cached;
}
