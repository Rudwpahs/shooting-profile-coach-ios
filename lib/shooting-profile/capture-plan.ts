import type { CaptureProtocolV2, CaptureSlotV2 } from "@/lib/shooting-profile/types";

export function buildCapturePlan(mode: CaptureProtocolV2): CaptureSlotV2[] {
  const count = mode === "basic_1_plus_1" ? 1 : 3;
  return (["front", "shooting_side"] as const).flatMap((view) =>
    Array.from({ length: count }, (_, takeIndex) => ({
      id: `${view}-${takeIndex}`,
      view,
      takeIndex: takeIndex as 0 | 1 | 2,
      required: true as const,
    })),
  );
}
