import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  StyleSheet: { create: <T>(styles: T) => styles, hairlineWidth: 1 },
  AccessibilityInfo: {},
  AppState: {},
  Animated: { View: () => null },
  View: () => null,
}));
vi.mock("react-native-svg", () => ({ default: () => null, Circle: () => null, Line: () => null }));
vi.mock("@expo/vector-icons/MaterialCommunityIcons", () => ({ default: () => null }));
vi.mock("expo-haptics", () => ({ selectionAsync: async () => undefined }));

const { decodeMotionPacketOrNull, skeletonSequenceFromMotionPacket, MOTION_PACKET_V1_BYTES } = await import("@/lib/reels/motion-packet-adapter");
const { buildMotionPacketV1, encodeMotionPacketV1 } = await import("@/lib/reels/motion-packet-v1");
const { buildReelStageFit } = await import("@/components/feed/reel-stage-fit");
const { representativeGlyph } = await import("@/components/skeleton/representative-glyph");
const { buildTwoViewRepresentativeProfile } = await import("@/lib/shooting-profile/two-view-pipeline");
const { syntheticLandmarkSession } = await import("@/tests/fixtures/synthetic-landmark-sequence");

const session = syntheticLandmarkSession({ mode: "basic_1_plus_1", shootingHand: "right" });
const pipeline = buildTwoViewRepresentativeProfile({
  mode: "basic_1_plus_1",
  shootingHand: "right",
  attempts: [...session.front, ...session.shootingSide].map((sequence) => ({ id: `${sequence.view}-${sequence.takeIndex}`, sequence })),
});
if (pipeline.status !== "complete") throw new Error("fixture must reconstruct");
const profile = pipeline.profile;
const bytes = encodeMotionPacketV1(buildMotionPacketV1(profile, "right"));

describe("MotionPacket V1 -> skeleton sequence", () => {
  it("decodes an encoded packet into a 101-frame sequence with the canonical anchors, within quantization of the private frames", () => {
    expect(bytes.length).toBe(MOTION_PACKET_V1_BYTES);
    const packet = decodeMotionPacketOrNull(bytes);
    expect(packet).not.toBeNull();
    if (!packet) return;
    expect(packet.shootingHand).toBe("right");
    const sequence = skeletonSequenceFromMotionPacket(packet);
    expect(sequence.frames).toHaveLength(101);
    expect(sequence.phaseAnchors.map((anchor) => anchor.id)).toEqual(["ready", "deepestDip", "rise", "releaseProxy", "followThrough"]);
    expect(sequence.frames[75].phase).toBeCloseTo(0.75, 9);
    for (const joint of ["rightWrist", "leftAnkle", "rightHip"] as const) {
      for (const axis of ["x", "y", "z"] as const) {
        expect(Math.abs(sequence.frames[75].joints[joint][axis] - profile.frames[75].joints[joint][axis])).toBeLessThanOrEqual(1 / 4096 + 1e-9);
      }
    }
  });

  it("returns null for anything that is not a valid packet, never throwing into the feed", () => {
    expect(decodeMotionPacketOrNull(null)).toBeNull();
    expect(decodeMotionPacketOrNull(undefined)).toBeNull();
    expect(decodeMotionPacketOrNull(new Uint8Array(10))).toBeNull();
    expect(decodeMotionPacketOrNull(bytes.slice(0, 100))).toBeNull();
    const flipped = new Uint8Array(bytes);
    flipped[0] ^= 0xff;
    expect(decodeMotionPacketOrNull(flipped)).toBeNull();
    expect(decodeMotionPacketOrNull("not bytes" as never)).toBeNull();
    expect(decodeMotionPacketOrNull(bytes.buffer.slice(0) as ArrayBuffer)).not.toBeNull();
  });

  it("feeds the existing skeleton renderer: a packet frame draws where the private frame draws", () => {
    const packet = decodeMotionPacketOrNull(bytes);
    if (!packet) throw new Error("fixture");
    const sequence = skeletonSequenceFromMotionPacket(packet);
    const fromPacket = representativeGlyph(sequence.frames[75], "oblique", "right");
    const fromProfile = representativeGlyph(profile.frames[75], "oblique", "right");
    expect(Object.keys(fromPacket.points).sort()).toEqual(Object.keys(fromProfile.points).sort());
    for (const joint of Object.keys(fromProfile.points)) {
      expect(Math.abs(fromPacket.points[joint].x - fromProfile.points[joint].x)).toBeLessThan(0.005);
      expect(Math.abs(fromPacket.points[joint].y - fromProfile.points[joint].y)).toBeLessThan(0.005);
    }
    expect(JSON.stringify(sequence)).not.toMatch(/uncertainty|covariance|quality|mode|root/);
  });

  it("gives a public reel a liftable fit only when it carries a packet", () => {
    const packet = decodeMotionPacketOrNull(bytes);
    if (!packet) throw new Error("fixture");
    const withPacket = buildReelStageFit({
      kind: "user", id: "post-post00001", author: "공개 슛폼", caption: "공개 게시물",
      motion: { source: "public", postId: "post00001", durationMs: 12000, packet, video: null },
    });
    expect(withPacket).not.toBeNull();
    expect(withPacket?.baseYaw).toBe(-45);
    expect(withPacket?.confidence).toBe("basic");
    expect(withPacket?.glyphAtYaw(30).points.rightWrist).toBeDefined();
    const videoOnly = buildReelStageFit({
      kind: "user", id: "post-post00002", author: "공개 슛폼", caption: "공개 게시물",
      motion: { source: "public", postId: "post00002", durationMs: 12000, packet: null, video: { uri: "https://storage.example.test/v.mp4" } },
    });
    expect(videoOnly).toBeNull();
  });
});
