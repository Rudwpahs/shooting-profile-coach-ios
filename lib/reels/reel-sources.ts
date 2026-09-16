import type { LatestRepresentativeState } from "@/hooks/use-latest-representative-profile";
import type { AnonymousPoseReference } from "@/lib/anonymous-pose-library";
import { profileReelId, referenceReelId, type ReelItem } from "@/lib/reels/reel-model";

/**
 * The Reels Home hands over: my latest representative profile first (only when
 * it is ready to show), then the anonymous references in library order. No
 * network here; everything comes from state Home already resolved.
 */
export function homeReelItems(latest: LatestRepresentativeState, references: readonly AnonymousPoseReference[]): ReelItem[] {
  const items: ReelItem[] = [];
  if (latest.status === "ready") {
    items.push({
      kind: "profile",
      id: profileReelId(latest.summary.id),
      profileId: latest.summary.id,
      profile: latest.record.profile,
      shootingHand: latest.record.shootingHand,
      confidence: latest.record.confidence,
      createdAt: latest.summary.createdAt.toDate(),
    });
  }
  for (const reference of references) {
    items.push({ kind: "reference", id: referenceReelId(reference.id), reference });
  }
  return items;
}
