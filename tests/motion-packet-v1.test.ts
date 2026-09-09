import { describe, expect, it } from "vitest";

import {
  CANONICAL_MOTION_PACKET_ANCHORS_V1,
  MOTION_PACKET_V1_QUANTIZATION_SCALE,
  PERSISTED_MOTION_PACKET_JOINTS_V1,
  buildMotionPacketV1,
  decodeMotionPacketV1,
  encodeMotionPacketV1,
  type MotionPacketV1,
} from "@/lib/reels/motion-packet-v1";
import type { RepresentativePose4DV2 } from "@/lib/shooting-profile/types";

const phases = Array.from({ length: 101 }, (_, index) => index / 100);
const PHASE_TOLERANCE = 1 / 65535 / 2;

function makePacket(): MotionPacketV1 {
  return {
    version: 1,
    shootingHand: "right",
    boundary: "representative_phase_fused_4d_estimate_not_actual_3d",
    timeBasis: "normalized_shot_phase",
    units: "template_shoulder_breadths",
    joints: [...PERSISTED_MOTION_PACKET_JOINTS_V1],
    phaseAnchors: CANONICAL_MOTION_PACKET_ANCHORS_V1.map((anchor) => ({ ...anchor })),
    frames: phases.map((phase, frameIndex) => ({
      phase,
      joints: Object.fromEntries(
        PERSISTED_MOTION_PACKET_JOINTS_V1.map((joint, jointIndex) => [joint, {
          x: Math.sin(frameIndex / 9 + jointIndex) / 2,
          y: Math.cos(frameIndex / 11 + jointIndex) / 2,
          z: (jointIndex - 6) / 20,
        }]),
      ) as MotionPacketV1["frames"][number]["joints"],
    })),
  };
}

describe("MotionPacketV1", () => {
  it("round-trips a canonical packet deterministically", () => {
    const packet = makePacket();
    const first = encodeMotionPacketV1(packet);
    const second = encodeMotionPacketV1(packet);

    expect(Array.from(first)).toEqual(Array.from(second));
    const decoded = decodeMotionPacketV1(first);
    expect(decoded.version).toBe(packet.version);
    expect(decoded.shootingHand).toBe(packet.shootingHand);
    expect(decoded.boundary).toBe(packet.boundary);
    expect(decoded.timeBasis).toBe(packet.timeBasis);
    expect(decoded.units).toBe(packet.units);
    expect(decoded.joints).toEqual(packet.joints);
    expect(decoded.phaseAnchors).toEqual(packet.phaseAnchors);
    expect(decoded.frames).toHaveLength(packet.frames.length);
    decoded.frames.forEach((frame, index) => {
      expect(Math.abs(frame.phase - packet.frames[index].phase)).toBeLessThanOrEqual(PHASE_TOLERANCE);
    });
  });

  it("preserves hand, phase anchors, and canonical joint order", () => {
    const decoded = decodeMotionPacketV1(encodeMotionPacketV1(makePacket()));

    expect(decoded.shootingHand).toBe("right");
    expect(decoded.joints).toEqual(PERSISTED_MOTION_PACKET_JOINTS_V1);
    expect(decoded.phaseAnchors).toEqual(CANONICAL_MOTION_PACKET_ANCHORS_V1);
    expect(decoded.frames).toHaveLength(101);
  });

  it("keeps decoded coordinates within half a quantization step", () => {
    const packet = makePacket();
    const decoded = decodeMotionPacketV1(encodeMotionPacketV1(packet));
    const tolerance = MOTION_PACKET_V1_QUANTIZATION_SCALE / 2;

    for (const [index, frame] of packet.frames.entries()) {
      for (const joint of packet.joints) {
        expect(Math.abs(decoded.frames[index].joints[joint].x - frame.joints[joint].x)).toBeLessThanOrEqual(tolerance);
        expect(Math.abs(decoded.frames[index].joints[joint].y - frame.joints[joint].y)).toBeLessThanOrEqual(tolerance);
        expect(Math.abs(decoded.frames[index].joints[joint].z - frame.joints[joint].z)).toBeLessThanOrEqual(tolerance);
      }
    }
  });

  it("rejects truncation, trailing bytes, bad header, and non-canonical metadata", () => {
    const encoded = encodeMotionPacketV1(makePacket());

    expect(() => decodeMotionPacketV1(encoded.slice(0, -1))).toThrow(/length|truncated/i);
    expect(() => decodeMotionPacketV1(new Uint8Array([...encoded, 0]))).toThrow(/length|trailing/i);

    const badMagic = encoded.slice();
    badMagic[0] ^= 0xff;
    expect(() => decodeMotionPacketV1(badMagic)).toThrow(/magic/i);

    const badVersion = encoded.slice();
    badVersion[4] = 2;
    expect(() => decodeMotionPacketV1(badVersion)).toThrow(/version/i);

    const badHand = encoded.slice();
    badHand[6] = 9;
    expect(() => decodeMotionPacketV1(badHand)).toThrow(/shooting hand/i);
  });

  it("builds a public packet without private uncertainty or capture evidence", () => {
    const profile = makePacket();
    const decoded = buildMotionPacketV1(({
      schemaVersion: 2,
      boundary: profile.boundary,
      mode: "basic_1_plus_1",
      timeBasis: profile.timeBasis,
      units: profile.units,
      frames: profile.frames.map((frame) => ({
        phase: frame.phase,
        joints: frame.joints,
        uncertainty: Object.fromEntries(profile.joints.map((joint) => [joint, {
          model: "heuristic_v1",
          covariance: [0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number],
          directionalConeDegrees: 1,
        }])),
      })),
      phaseAnchors: profile.phaseAnchors,
      quality: { passed: true, reasons: [] },
    } as unknown) as RepresentativePose4DV2, "left");

    expect(decoded.shootingHand).toBe("left");
    expect(decoded).not.toHaveProperty("uncertainty");
    expect(decoded).not.toHaveProperty("captureEvidence");
    expect(JSON.stringify(decoded)).not.toMatch(/covariance|captureEvidence|requestedTimestampMs/i);
  });
});
