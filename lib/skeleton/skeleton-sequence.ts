import type { PersistedJointMapV2 } from "@/lib/shooting-profile/types";

/**
 * The least a skeleton renderer needs: joints per frame and the named phase
 * anchors. The private representative profile satisfies it structurally, and
 * so does a decoded public MotionPacket, which is how one renderer serves
 * both without the public feed ever touching private evidence.
 */
export type SkeletonFrameLike = { joints: PersistedJointMapV2 };

export type SkeletonPhaseAnchorLike = { id: string; phase: number };

export type SkeletonSequenceLike = {
  frames: readonly SkeletonFrameLike[];
  phaseAnchors: readonly SkeletonPhaseAnchorLike[];
};
