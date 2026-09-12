import type { CaptureViewV2, ShootingHandV2 } from "@/lib/shooting-profile/types";

const FRONT_CRITICAL_LANDMARK_INDICES = [
  11,
  12,
  15,
  16,
  23,
  24,
  25,
  26,
  27,
  28,
] as const;

const LOWER_BODY_CRITICAL_LANDMARK_INDICES = [23, 24, 25, 26, 27, 28] as const;

export function getRequiredShootingArmLandmarks(
  shootingHand: ShootingHandV2,
): readonly number[] {
  return shootingHand === "right" ? [12, 14, 16] : [11, 13, 15];
}

export function getCriticalLandmarkIndices(
  view: CaptureViewV2,
  shootingHand: ShootingHandV2,
): readonly number[] {
  if (view === "front") return FRONT_CRITICAL_LANDMARK_INDICES;

  return [
    ...getRequiredShootingArmLandmarks(shootingHand),
    ...LOWER_BODY_CRITICAL_LANDMARK_INDICES,
  ];
}
