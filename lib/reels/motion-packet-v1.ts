import { parseRepresentativePose4D } from "@/lib/shooting-profile/codec";
import {
  PERSISTED_JOINT_NAMES_V2,
  type EvidenceBoundaryV2,
  type PersistedJointNameV2,
  type RepresentativePose4DV2,
  type ShootingHandV2,
} from "@/lib/shooting-profile/types";

export const PERSISTED_MOTION_PACKET_JOINTS_V1 = PERSISTED_JOINT_NAMES_V2;
export type MotionPacketJointV1 = PersistedJointNameV2;

export const CANONICAL_MOTION_PACKET_ANCHORS_V1 = Object.freeze([
  Object.freeze({ id: "ready", phase: 0 }),
  Object.freeze({ id: "deepestDip", phase: 0.25 }),
  Object.freeze({ id: "rise", phase: 0.5 }),
  Object.freeze({ id: "releaseProxy", phase: 0.75 }),
  Object.freeze({ id: "followThrough", phase: 1 }),
] as const);

export const MOTION_PACKET_V1_QUANTIZATION_SCALE = 1 / 4096;
const MAGIC = [0x48, 0x48, 0x4d, 0x50] as const;
const VERSION = 1;
const HEADER_LENGTH = 24;
const JOINT_COUNT = PERSISTED_MOTION_PACKET_JOINTS_V1.length;
const FRAME_COUNT = 101;
const ANCHOR_COUNT = CANONICAL_MOTION_PACKET_ANCHORS_V1.length;
const QUANTIZATION_DENOMINATOR = 4096;
const PHASE_DENOMINATOR = 65535;
const ANCHOR_BYTES = ANCHOR_COUNT * 3;
const FRAME_BYTES = 2 + JOINT_COUNT * 3 * 2;
const PAYLOAD_LENGTH = ANCHOR_BYTES + FRAME_COUNT * FRAME_BYTES;
const TOTAL_LENGTH = HEADER_LENGTH + PAYLOAD_LENGTH;
const PHASE_GRID_TOLERANCE = 1e-6;

type Vector3V1 = { x: number; y: number; z: number };
type MotionPacketFrameV1 = {
  phase: number;
  joints: Record<MotionPacketJointV1, Vector3V1>;
};

export type MotionPacketV1 = {
  version: 1;
  shootingHand: ShootingHandV2;
  boundary: EvidenceBoundaryV2;
  timeBasis: "normalized_shot_phase";
  units: "template_shoulder_breadths";
  joints: readonly MotionPacketJointV1[];
  phaseAnchors: readonly (typeof CANONICAL_MOTION_PACKET_ANCHORS_V1)[number][];
  frames: readonly MotionPacketFrameV1[];
};

function fail(message: string): never {
  throw new Error(`MotionPacketV1 ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} contains unsupported or missing fields`);
  }
}

function assertVector(value: unknown, label: string): asserts value is Vector3V1 {
  if (!isRecord(value)) fail(`${label} must be an object`);
  assertExactKeys(value, ["x", "y", "z"], label);
  if (typeof value.x !== "number" || typeof value.y !== "number" || typeof value.z !== "number"
    || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
    fail(`${label} coordinates must be finite numbers`);
  }
  for (const coordinate of [value.x, value.y, value.z]) {
    if (coordinate < -32768 * MOTION_PACKET_V1_QUANTIZATION_SCALE || coordinate > 32767 * MOTION_PACKET_V1_QUANTIZATION_SCALE) {
      fail(`${label} coordinate is outside int16 range`);
    }
  }
}

function assertCanonicalPacket(value: unknown): asserts value is MotionPacketV1 {
  if (!isRecord(value)) fail("must be an object");
  assertExactKeys(value, ["version", "shootingHand", "boundary", "timeBasis", "units", "joints", "phaseAnchors", "frames"], "packet");
  if (value.version !== VERSION) fail("version must be 1");
  if (value.shootingHand !== "left" && value.shootingHand !== "right") fail("shooting hand must be left or right");
  if (value.boundary !== "representative_phase_fused_4d_estimate_not_actual_3d") fail("boundary is not public MotionPacketV1 boundary");
  if (value.timeBasis !== "normalized_shot_phase" || value.units !== "template_shoulder_breadths") fail("time basis or units are not canonical");
  if (!Array.isArray(value.joints) || value.joints.length !== JOINT_COUNT || value.joints.some((joint, index) => joint !== PERSISTED_MOTION_PACKET_JOINTS_V1[index])) fail("joint order is not canonical");
  if (!Array.isArray(value.phaseAnchors) || value.phaseAnchors.length !== ANCHOR_COUNT) fail("phase anchors are not canonical");
  value.phaseAnchors.forEach((anchor, index) => {
    if (!isRecord(anchor)) fail(`phase anchor ${index} must be an object`);
    assertExactKeys(anchor, ["id", "phase"], `phase anchor ${index}`);
    const canonical = CANONICAL_MOTION_PACKET_ANCHORS_V1[index];
    if (anchor.id !== canonical.id || anchor.phase !== canonical.phase) fail("phase anchors are not canonical");
  });
  if (!Array.isArray(value.frames) || value.frames.length !== FRAME_COUNT) fail("frame count must be 101");
  value.frames.forEach((frame, frameIndex) => {
    if (!isRecord(frame)) fail(`frame ${frameIndex} must be an object`);
    assertExactKeys(frame, ["phase", "joints"], `frame ${frameIndex}`);
    if (typeof frame.phase !== "number" || !Number.isFinite(frame.phase) || frame.phase < 0 || frame.phase > 1 || Math.abs(frame.phase - frameIndex / 100) > PHASE_GRID_TOLERANCE) {
      fail(`frame ${frameIndex} phase is not canonical`);
    }
    if (!isRecord(frame.joints)) fail(`frame ${frameIndex} joints must be an object`);
    const joints = frame.joints;
    assertExactKeys(joints, PERSISTED_MOTION_PACKET_JOINTS_V1, `frame ${frameIndex} joints`);
    PERSISTED_MOTION_PACKET_JOINTS_V1.forEach((joint) => assertVector(joints[joint], `frame ${frameIndex} ${joint}`));
  });
}

function quantizeCoordinate(value: number): number {
  const quantized = Math.round(value * QUANTIZATION_DENOMINATOR);
  if (quantized < -32768 || quantized > 32767) fail("coordinate is outside int16 range");
  return quantized;
}

function quantizePhase(value: number): number {
  const quantized = Math.round(value * PHASE_DENOMINATOR);
  if (quantized < 0 || quantized > PHASE_DENOMINATOR) fail("phase is outside uint16 range");
  return quantized;
}

export function encodeMotionPacketV1(packet: MotionPacketV1): Uint8Array {
  assertCanonicalPacket(packet);
  const bytes = new Uint8Array(TOTAL_LENGTH);
  const view = new DataView(bytes.buffer);
  MAGIC.forEach((byte, index) => { view.setUint8(index, byte); });
  view.setUint8(4, VERSION);
  view.setUint8(5, HEADER_LENGTH);
  view.setUint8(6, packet.shootingHand === "left" ? 0 : 1);
  view.setUint8(7, 1);
  view.setUint8(8, JOINT_COUNT);
  view.setUint8(9, 0);
  view.setUint16(10, FRAME_COUNT, true);
  view.setUint8(12, ANCHOR_COUNT);
  view.setUint8(13, 0);
  view.setUint16(14, QUANTIZATION_DENOMINATOR, true);
  view.setUint16(16, PHASE_DENOMINATOR, true);
  view.setUint32(18, PAYLOAD_LENGTH, true);
  view.setUint16(22, 0, true);

  let offset = HEADER_LENGTH;
  CANONICAL_MOTION_PACKET_ANCHORS_V1.forEach((anchor, index) => {
    view.setUint8(offset, index);
    view.setUint16(offset + 1, quantizePhase(anchor.phase), true);
    offset += 3;
  });
  packet.frames.forEach((frame) => {
    view.setUint16(offset, quantizePhase(frame.phase), true);
    offset += 2;
    PERSISTED_MOTION_PACKET_JOINTS_V1.forEach((joint) => {
      const vector = frame.joints[joint];
      view.setInt16(offset, quantizeCoordinate(vector.x), true);
      view.setInt16(offset + 2, quantizeCoordinate(vector.y), true);
      view.setInt16(offset + 4, quantizeCoordinate(vector.z), true);
      offset += 6;
    });
  });
  return bytes;
}

export function decodeMotionPacketV1(input: Uint8Array): MotionPacketV1 {
  if (!(input instanceof Uint8Array)) fail("input must be Uint8Array");
  if (input.length !== TOTAL_LENGTH) fail(`length is invalid; expected ${TOTAL_LENGTH} bytes`);
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  MAGIC.forEach((byte, index) => { if (view.getUint8(index) !== byte) fail("magic is invalid"); });
  if (view.getUint8(4) !== VERSION) fail("version is invalid");
  if (view.getUint8(5) !== HEADER_LENGTH) fail("header length is invalid");
  const handCode = view.getUint8(6);
  if (handCode !== 0 && handCode !== 1) fail("shooting hand code is invalid");
  if (view.getUint8(7) !== 1) fail("boundary code is invalid");
  if (view.getUint8(8) !== JOINT_COUNT || view.getUint16(10, true) !== FRAME_COUNT || view.getUint8(12) !== ANCHOR_COUNT) fail("canonical counts are invalid");
  if (view.getUint8(9) !== 0 || view.getUint8(13) !== 0 || view.getUint16(22, true) !== 0) fail("reserved header bytes are invalid");
  if (view.getUint16(14, true) !== QUANTIZATION_DENOMINATOR || view.getUint16(16, true) !== PHASE_DENOMINATOR) fail("quantization metadata is invalid");
  if (view.getUint32(18, true) !== PAYLOAD_LENGTH) fail("payload length is invalid");

  let offset = HEADER_LENGTH;
  for (let index = 0; index < ANCHOR_COUNT; index += 1) {
    const canonical = CANONICAL_MOTION_PACKET_ANCHORS_V1[index];
    if (view.getUint8(offset) !== index || view.getUint16(offset + 1, true) !== quantizePhase(canonical.phase)) fail("phase anchor metadata is invalid");
    offset += 3;
  }
  const frames: MotionPacketFrameV1[] = [];
  for (let frameIndex = 0; frameIndex < FRAME_COUNT; frameIndex += 1) {
    const phase = view.getUint16(offset, true) / PHASE_DENOMINATOR;
    offset += 2;
    const joints = {} as Record<MotionPacketJointV1, Vector3V1>;
    PERSISTED_MOTION_PACKET_JOINTS_V1.forEach((joint) => {
      joints[joint] = {
        x: view.getInt16(offset, true) / QUANTIZATION_DENOMINATOR,
        y: view.getInt16(offset + 2, true) / QUANTIZATION_DENOMINATOR,
        z: view.getInt16(offset + 4, true) / QUANTIZATION_DENOMINATOR,
      };
      offset += 6;
    });
    if (Math.abs(phase - frameIndex / 100) > (1 / PHASE_DENOMINATOR)) fail(`frame ${frameIndex} phase is invalid`);
    frames.push({ phase, joints });
  }
  if (offset !== input.length) fail("trailing bytes detected");
  return {
    version: 1,
    shootingHand: handCode === 0 ? "left" : "right",
    boundary: "representative_phase_fused_4d_estimate_not_actual_3d",
    timeBasis: "normalized_shot_phase",
    units: "template_shoulder_breadths",
    joints: [...PERSISTED_MOTION_PACKET_JOINTS_V1],
    phaseAnchors: CANONICAL_MOTION_PACKET_ANCHORS_V1.map((anchor) => ({ ...anchor })),
    frames,
  };
}

export function buildMotionPacketV1(profileInput: RepresentativePose4DV2, shootingHand: ShootingHandV2): MotionPacketV1 {
  const profile = parseRepresentativePose4D(profileInput);
  if (shootingHand !== "left" && shootingHand !== "right") fail("shooting hand must be left or right");
  return {
    version: 1,
    shootingHand,
    boundary: profile.boundary,
    timeBasis: profile.timeBasis,
    units: profile.units,
    joints: [...PERSISTED_MOTION_PACKET_JOINTS_V1],
    phaseAnchors: CANONICAL_MOTION_PACKET_ANCHORS_V1.map((anchor) => ({ ...anchor })),
    frames: profile.frames.map((frame) => ({
      phase: frame.phase,
      joints: Object.fromEntries(PERSISTED_MOTION_PACKET_JOINTS_V1.map((joint) => [joint, { ...frame.joints[joint] }])) as Record<MotionPacketJointV1, Vector3V1>,
    })),
  };
}
