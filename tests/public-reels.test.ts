import { Timestamp } from "firebase/firestore";
import { describe, expect, it, vi } from "vitest";

import { loadPublicReels, publicReelFromPost, type PublicReelMediaLoader, type PublicReelSource } from "@/lib/feed/public-reels";
import { reelLabel, reelLine } from "@/lib/feed/reel-model";
import { relativeDayLabel } from "@/lib/format/relative-day";
import { buildMotionPacketV1, decodeMotionPacketV1, encodeMotionPacketV1 } from "@/lib/reels/motion-packet-v1";
import type { ReelPost } from "@/lib/reels/social-contract";
import { buildTwoViewRepresentativeProfile } from "@/lib/shooting-profile/two-view-pipeline";
import { syntheticLandmarkSession } from "@/tests/fixtures/synthetic-landmark-sequence";

const session = syntheticLandmarkSession({ mode: "basic_1_plus_1", shootingHand: "right" });
const pipeline = buildTwoViewRepresentativeProfile({
  mode: "basic_1_plus_1",
  shootingHand: "right",
  attempts: [...session.front, ...session.shootingSide].map((sequence) => ({ id: `${sequence.view}-${sequence.takeIndex}`, sequence })),
});
if (pipeline.status !== "complete") throw new Error("fixture must reconstruct");
const packetBytes = encodeMotionPacketV1(buildMotionPacketV1(pipeline.profile, "right"));
const corrupted = new Uint8Array(packetBytes);
corrupted[4] = 9;

const DAY = 24 * 60 * 60 * 1000;
const createdAt = new Date(Date.now() - DAY);
const post = (postId: string, ownerUid: string, overrides: Partial<ReelPost> = {}): ReelPost => ({
  schemaVersion: 1,
  postId,
  ownerUid,
  privacy: "public",
  publicOptIn: true,
  durationMs: 12000,
  video: { objectPath: `reels/${ownerUid}/${postId}/video.mp4`, contentType: "video/mp4" },
  motion: { objectPath: `reels/${ownerUid}/${postId}/motion.v1.bin`, format: "motion_packet_v1" },
  createdAt: Timestamp.fromDate(createdAt),
  updatedAt: Timestamp.fromDate(createdAt),
  ...overrides,
});

describe("publicReelFromPost", () => {
  it("is a user reel named by the post, dated honestly, and never by a person or a storage path", () => {
    const reel = publicReelFromPost(post("post00001", "owner-1"), { packet: null, videoUri: "https://storage.example.test/video.mp4" });
    expect(reel).toMatchObject({ kind: "user", id: "post-post00001", author: "공개 슛폼", meta: relativeDayLabel(createdAt), caption: "공개 게시물 · 영상" });
    expect(reel.motion).toEqual({ source: "public", postId: "post00001", durationMs: 12000, packet: null, video: { uri: "https://storage.example.test/video.mp4" } });
    expect(reelLabel(reel)).toBe(`공개 슛폼 · ${relativeDayLabel(createdAt)}`);
    expect(reelLine(reel)).toBe("공개 게시물 · 영상");
    expect(JSON.stringify(reel)).not.toMatch(/owner-1|objectPath|ownerUid|reels\//);
  });

  it("states the boundary when a packet is present and says so when no media is ready", () => {
    const packet = decodeMotionPacketV1(packetBytes);
    expect(publicReelFromPost(post("post00001", "owner-1"), { packet, videoUri: null }).caption).toBe("공개 게시물 · 4D 추정 · 실측 3D 아님");
    expect(publicReelFromPost(post("post00001", "owner-1"), { packet: null, videoUri: null }).caption).toBe("공개 게시물 · 미디어 준비 중");
  });
});

describe("loadPublicReels", () => {
  const posts = [
    post("post00001", "owner-1"),
    post("post00002", "owner-2", { video: null }),
    post("post00003", "owner-3", { motion: null }),
    post("post00004", "me-0001", {}),
  ];
  const source = (items: ReelPost[] = posts, fail = false): PublicReelSource => ({
    listPublicReels: vi.fn(async () => {
      if (fail) throw new Error("permission-denied");
      return { items, nextAfterPostId: null };
    }),
  });
  const media = (): PublicReelMediaLoader & { fetchMotionPacket: ReturnType<typeof vi.fn>; resolveVideoUri: ReturnType<typeof vi.fn> } => ({
    fetchMotionPacket: vi.fn(async (objectPath: string) => (objectPath.includes("post00001") ? packetBytes : objectPath.includes("post00002") ? corrupted : null)),
    resolveVideoUri: vi.fn(async (objectPath: string) => (objectPath.includes("post00003") ? null : `https://storage.example.test/${objectPath}`)),
  });

  it("goes metadata -> video ref -> motion ref -> decode -> reel, degrading per post and never failing the list", async () => {
    const loader = media();
    const reels = await loadPublicReels({ source: source(), media: loader, excludeOwnerUid: "me-0001", pageSize: 20 });
    expect(reels.map((reel) => reel.id)).toEqual(["post-post00001", "post-post00002", "post-post00003"]);
    const [full, packetBroken, videoBroken] = reels;
    expect(full.motion).toMatchObject({ source: "public", video: { uri: "https://storage.example.test/reels/owner-1/post00001/video.mp4" } });
    expect(full.motion.source === "public" && full.motion.packet).not.toBeNull();
    expect(full.caption).toBe("공개 게시물 · 4D 추정 · 실측 3D 아님");
    // A corrupt packet loses only Motion Lift; the reel stays.
    expect(packetBroken.motion).toMatchObject({ source: "public", packet: null, video: null });
    expect(packetBroken.caption).toBe("공개 게시물 · 미디어 준비 중");
    // A video the store will not serve loses only the video; the reel stays.
    expect(videoBroken.motion).toMatchObject({ source: "public", packet: null, video: null });
  });

  it("asks storage only for the references each post declares", async () => {
    const loader = media();
    await loadPublicReels({ source: source(), media: loader, excludeOwnerUid: null, pageSize: 20 });
    expect(loader.fetchMotionPacket.mock.calls.map((call) => call[0])).toEqual([
      "reels/owner-1/post00001/motion.v1.bin",
      "reels/owner-2/post00002/motion.v1.bin",
      "reels/me-0001/post00004/motion.v1.bin",
    ]);
    expect(loader.resolveVideoUri.mock.calls.map((call) => call[0])).toEqual([
      "reels/owner-1/post00001/video.mp4",
      "reels/owner-3/post00003/video.mp4",
      "reels/me-0001/post00004/video.mp4",
    ]);
  });

  it("keeps my own posts out of the public list and yields nothing when the list itself fails", async () => {
    expect((await loadPublicReels({ source: source(), media: media(), excludeOwnerUid: "me-0001", pageSize: 20 })).some((reel) => reel.id === "post-post00004")).toBe(false);
    expect(await loadPublicReels({ source: source(posts, true), media: media(), excludeOwnerUid: null, pageSize: 20 })).toEqual([]);
    expect(await loadPublicReels({ source: source([]), media: media(), excludeOwnerUid: null, pageSize: 20 })).toEqual([]);
  });

  it("survives a media loader that throws", async () => {
    const throwing: PublicReelMediaLoader = {
      fetchMotionPacket: async () => { throw new Error("storage/unauthorized"); },
      resolveVideoUri: async () => { throw new Error("storage/unauthorized"); },
    };
    const reels = await loadPublicReels({ source: source(), media: throwing, excludeOwnerUid: null, pageSize: 20 });
    expect(reels).toHaveLength(4);
    expect(reels.every((reel) => reel.motion.source === "public" && reel.motion.packet === null && reel.motion.video === null)).toBe(true);
  });
});
