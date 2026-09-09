import type { LatestRepresentativeState } from "@/hooks/use-latest-representative-profile";
import type { AnonymousPoseReference } from "@/lib/anonymous-pose-library";
import type { CoachReel, ReelItem, ReferenceReel, UserReel } from "@/lib/feed/reel-model";
import { relativeDayLabel } from "@/lib/format/relative-day";
import { representativeConfidence, type SkeletonConfidence } from "@/lib/skeleton/representative-confidence";

/**
 * What Home shows, decided without a renderer: my latest representative
 * loop first, the coaching moment right after it when one is eligible, then
 * the anonymous references. No coaching moment can lead the feed, and none
 * exists without my reel; when the coach is unavailable the feed is simply
 * the reels.
 */
export const HOME_STATUS_LINES: Readonly<Record<Exclude<LatestRepresentativeState["status"], "ready">, string>> = Object.freeze({
  "signed-out": "로그인 후 촬영",
  disabled: "대표 슛폼 저장이 꺼져 있습니다",
  loading: "내 슛폼을 불러오는 중",
  empty: "첫 슛폼을 촬영해 보세요",
  error: "내 슛폼을 불러오지 못했습니다",
});

/** One honest line while there is no reel of mine; nothing once there is. */
export function homeStatusLine(latest: LatestRepresentativeState): string | null {
  return latest.status === "ready" ? null : HOME_STATUS_LINES[latest.status];
}

const BAND_CAPTION: Readonly<Record<SkeletonConfidence, string>> = Object.freeze({
  high: "High · 4D 추정 · 실측 3D 아님",
  basic: "Basic · 4D 추정 · 실측 3D 아님",
  recapture: "재촬영 필요 · 4D 추정 · 실측 3D 아님",
});

export function userReelFromLatest(latest: LatestRepresentativeState): UserReel | null {
  if (latest.status !== "ready") return null;
  return {
    kind: "user",
    id: `user-${latest.summary.id}`,
    author: "내 슛폼",
    meta: relativeDayLabel(latest.summary.createdAt.toDate()),
    caption: BAND_CAPTION[representativeConfidence(latest.record.profile)],
    motion: { source: "representative", profile: latest.record.profile, shootingHand: latest.record.shootingHand },
  };
}

export function referenceReels(references: readonly AnonymousPoseReference[]): ReferenceReel[] {
  return references.map((reference) => ({
    kind: "reference",
    id: `reference-${reference.id}`,
    label: reference.shortLabel,
    attribution: reference.modelBoundary === "actual_optical_mocap_3d" ? "CMU optical mocap" : "calibrated multi-view",
    motion: { source: "reference", motion: reference.motion, hand: "right" },
  }));
}

/** The coaching moment goes right after the first user reel; without one it is not shown. */
export function insertCoachReel(items: readonly ReelItem[], coach: CoachReel | null): ReelItem[] {
  if (!coach) return [...items];
  const index = items.findIndex((item) => item.kind === "user");
  if (index < 0) return [...items];
  return [...items.slice(0, index + 1), coach, ...items.slice(index + 1)];
}

export type HomeFeedInput = {
  own: UserReel | null;
  coach: CoachReel | null;
  references: readonly ReferenceReel[];
};

export function buildHomeFeed({ own, coach, references }: HomeFeedInput): ReelItem[] {
  return insertCoachReel([...(own ? [own] : []), ...references], coach);
}
