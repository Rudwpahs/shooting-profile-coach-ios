import { decodeMotionPacketV1, type MotionPacketV1 } from "@/lib/reels/motion-packet-v1";
import type { PersistedJointMapV2 } from "@/lib/shooting-profile/types";

/**
 * MotionPacket V1 -> the skeleton renderer.
 *
 * The public packet is decoded by the Codex codec; this adapter only turns a
 * decoded packet into the frame-and-anchor shape the existing SVG skeleton
 * already draws, and it never throws into the feed: anything that is not a
 * valid packet becomes `null`, which the Reel treats as "Motion Lift
 * unavailable" while the video keeps playing. No second renderer, no engine.
 */
export const MOTION_PACKET_V1_BYTES = 7513;

export type MotionPacketSequence = {
  frames: readonly { phase: number; joints: PersistedJointMapV2 }[];
  phaseAnchors: readonly { id: string; phase: number }[];
};

export function decodeMotionPacketOrNull(input: Uint8Array | ArrayBuffer | null | undefined): MotionPacketV1 | null {
  if (input === null || input === undefined) return null;
  const bytes = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : null;
  if (!bytes) return null;
  try {
    return decodeMotionPacketV1(bytes);
  } catch {
    return null;
  }
}

export function skeletonSequenceFromMotionPacket(packet: MotionPacketV1): MotionPacketSequence {
  return {
    frames: packet.frames.map((frame) => ({ phase: frame.phase, joints: { ...frame.joints } })),
    phaseAnchors: packet.phaseAnchors.map((anchor) => ({ id: anchor.id, phase: anchor.phase })),
  };
}
