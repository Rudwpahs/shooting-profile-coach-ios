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
import { buildRepresentativeSequence } from "@/lib/shooting-profile/representative-sequence";
import type { RepresentativePose4DV2 } from "@/lib/shooting-profile/types";
import { syntheticDualViewSession } from "@/tests/fixtures/synthetic-dual-view";

const JOINTS = [
  "leftShoulder", "leftElbow", "leftWrist", "rightShoulder", "rightElbow", "rightWrist",
  "leftHip", "leftKnee", "leftAnkle", "rightHip", "rightKnee", "rightAnkle",
] as const;
const ANCHORS = [
  { id: "ready", phase: 0 }, { id: "deepestDip", phase: 0.25 }, { id: "rise", phase: 0.5 },
  { id: "releaseProxy", phase: 0.75 }, { id: "followThrough", phase: 1 },
] as const;
const PACKET_BYTES = 7513;
const FRAME_START = 39;
const FRAME_BYTES = 74;
// Predeclared Euclidean xyz playback budget in template shoulder breadths.
// This is slightly above sqrt(3) / (2 * 4096), the maximum rounding error.
const VISUAL_ERROR_BUDGET_SB = 0.000212;

function makePacket(): MotionPacketV1 {
  return {
    version: 1,
    shootingHand: "right",
    boundary: "representative_phase_fused_4d_estimate_not_actual_3d",
    timeBasis: "normalized_shot_phase",
    units: "template_shoulder_breadths",
    joints: [...JOINTS],
    phaseAnchors: ANCHORS.map((anchor) => ({ ...anchor })),
    frames: Array.from({ length: 101 }, (_, index) => ({
      phase: index / 100,
      joints: Object.fromEntries(JOINTS.map((joint, jointIndex) => [joint, {
        x: Math.sin(index / 9 + jointIndex) / 2,
        y: Math.cos(index / 11 + jointIndex) / 2,
        z: Math.sin(index / 7 - jointIndex) / 3,
      }])) as MotionPacketV1["frames"][number]["joints"],
    })),
  };
}

function encodeUnknown(packet: unknown): Uint8Array {
  return encodeMotionPacketV1(packet as MotionPacketV1);
}

function representativeProfile(): RepresentativePose4DV2 {
  const result = buildRepresentativeSequence(syntheticDualViewSession({ mode: "basic_1_plus_1" }));
  expect(result.status, JSON.stringify(result)).toBe("complete");
  if (result.status !== "complete") throw new Error("Representative fixture must be accepted");
  return result.profile;
}

describe("MotionPacketV1 canonical binary", () => {
  it.each(["left", "right"] as const)("re-encodes decoded %s packets byte for byte", (shootingHand) => {
    const packet = { ...makePacket(), shootingHand };
    const bytes = encodeMotionPacketV1(packet);
    expect(bytes).toEqual(encodeMotionPacketV1(packet));
    const decoded = decodeMotionPacketV1(bytes);
    expect(decoded.shootingHand).toBe(shootingHand);
    expect(decoded.frames.map((frame) => frame.phase)).toEqual(
      Array.from({ length: 101 }, (_, index) => index / 100),
    );
    expect(encodeMotionPacketV1(decoded)).toEqual(bytes);
  });

  it("pins the interoperable little-endian header, anchors, and joint ordering", () => {
    const packet = makePacket();
    packet.frames[0].joints.leftShoulder = { x: -8, y: 32767 / 4096, z: 1 };
    const bytes = encodeMotionPacketV1(packet);
    expect(bytes).toHaveLength(PACKET_BYTES);
    expect(Array.from(bytes.subarray(0, FRAME_START))).toEqual([
      0x48, 0x48, 0x4d, 0x50, 1, 24, 1, 1, 12, 0, 101, 0, 5, 0,
      0, 0x10, 0xff, 0xff, 0x41, 0x1d, 0, 0, 0, 0,
      0, 0, 0, 1, 0, 0x40, 2, 0, 0x80, 3, 0xff, 0xbf, 4, 0xff, 0xff,
    ]);
    expect(Array.from(bytes.subarray(FRAME_START, FRAME_START + 8))).toEqual([
      0, 0, 0, 0x80, 0xff, 0x7f, 0, 0x10,
    ]);
    const decoded = decodeMotionPacketV1(bytes);
    expect(decoded.joints).toEqual(JOINTS);
    expect(decoded.phaseAnchors).toEqual(ANCHORS);
    expect(PERSISTED_MOTION_PACKET_JOINTS_V1).toEqual(JOINTS);
    expect(CANONICAL_MOTION_PACKET_ANCHORS_V1).toEqual(ANCHORS);
  });

  it("reads only a Uint8Array subarray, respecting its byte offset and length", () => {
    const bytes = encodeMotionPacketV1(makePacket());
    const container = new Uint8Array(PACKET_BYTES + 23).fill(0xee);
    container.set(bytes, 11);
    const window = container.subarray(11, 11 + PACKET_BYTES);
    expect(encodeMotionPacketV1(decodeMotionPacketV1(window))).toEqual(bytes);
    expect(Array.from(container.subarray(0, 11))).toEqual(Array(11).fill(0xee));
  });

  it("preserves every int16 coordinate code when decoding and re-encoding wire input", () => {
    const canonical = encodeMotionPacketV1(makePacket());
    let nextCode = -32768;
    while (nextCode <= 32767) {
      const bytes = canonical.slice();
      const view = new DataView(bytes.buffer);
      for (let frame = 0; frame < 101; frame += 1) {
        for (let coordinate = 0; coordinate < 36; coordinate += 1) {
          if (nextCode > 32767) break;
          view.setInt16(FRAME_START + frame * FRAME_BYTES + 2 + coordinate * 2, nextCode, true);
          nextCode += 1;
        }
      }
      expect(encodeMotionPacketV1(decodeMotionPacketV1(bytes))).toEqual(bytes);
    }
  });

  it("rejects every truncation length and trailing bytes", () => {
    const bytes = encodeMotionPacketV1(makePacket());
    for (let length = 0; length < PACKET_BYTES; length += 1) {
      expect(() => decodeMotionPacketV1(bytes.subarray(0, length)), `length ${length}`).toThrow(/length/);
    }
    expect(() => decodeMotionPacketV1(new Uint8Array([...bytes, 0]))).toThrow(/length/);
  });

  it("rejects changes in every header metadata, count, and reserved byte", () => {
    const bytes = encodeMotionPacketV1(makePacket());
    for (let offset = 0; offset < 24; offset += 1) {
      const invalid = bytes.slice();
      invalid[offset] = offset === 6 ? 2 : invalid[offset] ^ 1;
      expect(() => decodeMotionPacketV1(invalid), `header byte ${offset}`).toThrow(/MotionPacketV1/);
    }
  });

  it("rejects changed anchor IDs, ordering, and phase codes", () => {
    const bytes = encodeMotionPacketV1(makePacket());
    for (let offset = 24; offset < FRAME_START; offset += 1) {
      const invalid = bytes.slice();
      invalid[offset] ^= 1;
      expect(() => decodeMotionPacketV1(invalid), `anchor byte ${offset}`).toThrow(/anchor/);
    }
  });

  it("rejects either adjacent uint16 phase code at every frame", () => {
    const bytes = encodeMotionPacketV1(makePacket());
    for (let index = 0; index < 101; index += 1) {
      const offset = FRAME_START + index * FRAME_BYTES;
      const canonicalCode = new DataView(bytes.buffer).getUint16(offset, true);
      for (const delta of [-1, 1]) {
        const changedCode = canonicalCode + delta;
        if (changedCode < 0 || changedCode > 65535) continue;
        const invalid = bytes.slice();
        new DataView(invalid.buffer).setUint16(offset, changedCode, true);
        expect(() => decodeMotionPacketV1(invalid), `frame ${index}, delta ${delta}`).toThrow(/phase/);
      }
    }
  });

  it.each([null, [], new ArrayBuffer(PACKET_BYTES), new Uint16Array(PACKET_BYTES)])(
    "rejects non-byte input %#", (input) => {
      expect(() => decodeMotionPacketV1(input as unknown as Uint8Array)).toThrow(/Uint8Array/);
    },
  );
});

describe("MotionPacketV1 public input validation", () => {
  it.each([
    ["version", 2], ["shootingHand", "unknown"], ["boundary", "calibrated_multi_view_3d"],
    ["timeBasis", "seconds"], ["units", "meters"],
  ])("rejects unsupported %s", (key, value) => {
    expect(() => encodeUnknown({ ...makePacket(), [key]: value })).toThrow(/MotionPacketV1/);
  });

  it.each(["joints", "phaseAnchors", "frames"] as const)("rejects wrong %s counts and sparse arrays", (key) => {
    const packet = makePacket();
    expect(() => encodeUnknown({ ...packet, [key]: packet[key].slice(1) })).toThrow(/MotionPacketV1/);
    expect(() => encodeUnknown({ ...packet, [key]: [...packet[key], packet[key][0]] })).toThrow(/MotionPacketV1/);
    expect(() => encodeUnknown({ ...packet, [key]: new Array(packet[key].length) })).toThrow(/MotionPacketV1/);
    const sparse = [...packet[key]];
    delete sparse[1];
    expect(() => encodeUnknown({ ...packet, [key]: sparse })).toThrow(/MotionPacketV1/);
    const withExtra = [...packet[key]];
    Object.assign(withExtra, { localUri: "file:///private.mp4" });
    expect(() => encodeUnknown({ ...packet, [key]: withExtra })).toThrow(/MotionPacketV1/);
  });

  it("rejects reordered or duplicate joints and noncanonical anchors", () => {
    const packet = makePacket();
    expect(() => encodeUnknown({ ...packet, joints: [...packet.joints].reverse() })).toThrow(/joint/);
    expect(() => encodeUnknown({ ...packet, joints: packet.joints.map(() => "leftWrist") })).toThrow(/joint/);
    expect(() => encodeUnknown({ ...packet, phaseAnchors: [...packet.phaseAnchors].reverse() })).toThrow(/anchor/);
    expect(() => encodeUnknown({ ...packet, phaseAnchors: packet.phaseAnchors.map((anchor) => ({
      ...anchor, phase: anchor.phase + 1e-12,
    })) })).toThrow(/anchor/);
  });

  it.each([NaN, Infinity, -Infinity, -0.01, 1.01, 0.01 + 1e-12, 655 / 65535])(
    "rejects off-grid input phase %s", (phase) => {
      const packet = makePacket();
      packet.frames[1].phase = phase;
      expect(() => encodeMotionPacketV1(packet)).toThrow(/phase/);
    },
  );

  it.each(["x", "y", "z"] as const)("validates %s finiteness and both int16 boundaries without clamping", (axis) => {
    const packet = makePacket();
    for (const coordinate of [-8, 32767 / 4096]) {
      packet.frames[0].joints.leftShoulder[axis] = coordinate;
      const decoded = decodeMotionPacketV1(encodeMotionPacketV1(packet));
      expect(decoded.frames[0].joints.leftShoulder[axis]).toBe(coordinate);
    }
    for (const coordinate of [NaN, Infinity, -Infinity, -8 - 1e-12, 32767 / 4096 + 1e-12, 8, "0", null]) {
      const invalid = makePacket();
      Object.assign(invalid.frames[0].joints.leftShoulder, { [axis]: coordinate });
      expect(() => encodeMotionPacketV1(invalid)).toThrow(/finite|range/);
    }
  });

  it("rejects missing fields and private or unknown fields at every object boundary", () => {
    const packet = makePacket();
    const boundaries = [packet, packet.phaseAnchors[0], packet.frames[0],
      packet.frames[0].joints, packet.frames[0].joints.leftShoulder];
    for (const target of boundaries) {
      Object.assign(target, { localUri: "file:///private.mp4" });
      expect(() => encodeMotionPacketV1(packet)).toThrow(/unsupported|missing/);
      Reflect.deleteProperty(target, "localUri");
      const key = Object.keys(target)[0];
      const saved = Reflect.get(target, key);
      Reflect.deleteProperty(target, key);
      expect(() => encodeMotionPacketV1(packet)).toThrow(/unsupported|missing/);
      Reflect.set(target, key, saved);
      const privateKey = Symbol("privateEvidence");
      Reflect.set(target, privateKey, "private");
      expect(() => encodeMotionPacketV1(packet)).toThrow(/unsupported|missing/);
      Reflect.deleteProperty(target, privateKey);
    }
  });
});

describe("MotionPacketV1 representative projection", () => {
  it("preserves the representative fixture within the predeclared Euclidean xyz visual budget", () => {
    const profile = representativeProfile();
    const packet = buildMotionPacketV1(profile, "left");
    const decoded = decodeMotionPacketV1(encodeMotionPacketV1(packet));
    let maximumError = 0;
    for (const [index, frame] of profile.frames.entries()) {
      expect(decoded.frames[index].phase).toBe(index / 100);
      for (const joint of JOINTS) {
        const actual = decoded.frames[index].joints[joint];
        const source = frame.joints[joint];
        maximumError = Math.max(maximumError, Math.hypot(
          actual.x - source.x, actual.y - source.y, actual.z - source.z,
        ));
      }
    }
    expect(maximumError).toBeGreaterThan(0);
    expect(maximumError).toBeLessThanOrEqual(VISUAL_ERROR_BUDGET_SB);
    expect(maximumError).toBeLessThanOrEqual(Math.sqrt(3) * MOTION_PACKET_V1_QUANTIZATION_SCALE / 2);
    expect(decoded.shootingHand).toBe("left");
    expect(decoded.phaseAnchors).toEqual(profile.phaseAnchors);
  });

  it("projects only allowlisted public fields, omits private root and uncertainty, and owns its copies", () => {
    const profile = representativeProfile();
    profile.frames[0].root = { x: 0.1, y: 0.2, z: 0.3 };
    const before = structuredClone(profile);
    const packet = buildMotionPacketV1(profile, "right");
    expect(profile).toEqual(before);
    expect(Object.keys(packet).sort()).toEqual([
      "version", "shootingHand", "boundary", "timeBasis", "units", "joints", "phaseAnchors", "frames",
    ].sort());
    for (const frame of packet.frames) {
      expect(Object.keys(frame).sort()).toEqual(["joints", "phase"]);
      expect(Object.keys(frame.joints)).toEqual(JOINTS);
      for (const joint of JOINTS) expect(Object.keys(frame.joints[joint]).sort()).toEqual(["x", "y", "z"]);
    }
    expect(JSON.stringify(packet)).not.toMatch(/root|uncertainty|covariance|quality|mode|captureEvidence|timestamp|uri|nose/i);
    packet.frames[0].joints.leftWrist.x += 1;
    expect(profile).toEqual(before);
  });

  it("rejects invalid private sources and never accepts new evidence fields through projection", () => {
    const profile = representativeProfile();
    expect(() => buildMotionPacketV1({ ...profile, quality: { passed: false, reasons: [] } }, "left")).toThrow();
    expect(() => buildMotionPacketV1({ ...profile, localUri: "file:///private.mp4" } as RepresentativePose4DV2, "left")).toThrow();
    expect(() => buildMotionPacketV1(profile, "unknown" as "left")).toThrow(/shooting hand/);
    profile.frames[0].joints.leftWrist.x = 8;
    expect(() => buildMotionPacketV1(profile, "left")).toThrow(/range/);
  });

  it("normalizes only upstream-accepted canonical phase drift before encoding", () => {
    const profile = representativeProfile();
    profile.frames[1].phase += 5e-13;
    const packet = buildMotionPacketV1(profile, "right");
    expect(packet.frames[1].phase).toBe(0.01);
    expect(() => encodeMotionPacketV1(packet)).not.toThrow();
    profile.frames[1].phase = 0.010001;
    expect(() => buildMotionPacketV1(profile, "right")).toThrow();
  });
});
