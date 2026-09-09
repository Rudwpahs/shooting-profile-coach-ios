import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import { parseReelPost, parsePublishReelInput, parseSavedReel, parseSaveReelInput } from "@/lib/reels/social-contract";

const input = () => ({
  postId: "post00001", publicOptIn: true, durationMs: 12_000,
  video: { objectPath: "reels/owner-1/post00001/video.mp4", contentType: "video/mp4" },
  motion: { objectPath: "reels/owner-1/post00001/motion.v1.bin", format: "motion_packet_v1" },
});
const post = () => ({ ...input(), ownerUid: "owner-1", schemaVersion: 1, privacy: "public", createdAt: Timestamp.fromMillis(1000), updatedAt: Timestamp.fromMillis(1000) });

describe("social metadata privacy contract", () => {
  it("admits only owner/post-bound video and versioned motion object references", () => {
    expect(parsePublishReelInput("owner-1", input())).toEqual(input());
    expect(parsePublishReelInput("owner-1", { ...input(), video: null }).motion?.format).toBe("motion_packet_v1");
    expect(parseReelPost("post00001", post()).ownerUid).toBe("owner-1");
  });

  it.each([undefined, false, "true"])("requires explicit public opt-in: %s", (publicOptIn) => {
    expect(() => parsePublishReelInput("owner-1", { ...input(), publicOptIn })).toThrow();
  });

  it.each(["https://example.com/video.mp4", "gs://bucket/video.mp4", "file:///private.mov", "reels/other/post00001/video.mp4", "reels/owner-1/post00002/video.mp4", "reels/owner-1/post00001/../video.mp4"])("rejects foreign or arbitrary media reference %s", (objectPath) => {
    expect(() => parsePublishReelInput("owner-1", { ...input(), video: { ...input().video, objectPath } })).toThrow();
  });

  it.each(["landmarks", "mask", "thumbnail", "evidence", "covariance", "profileId", "caption", "videoUrl"])("rejects undeclared %s instead of silently dropping it", (field) => {
    expect(() => parsePublishReelInput("owner-1", { ...input(), [field]: [] })).toThrow();
    expect(() => parseReelPost("post00001", { ...post(), [field]: [] })).toThrow();
  });

  it("rejects extra nested metadata, no playable reference, and bad bounds", () => {
    expect(() => parsePublishReelInput("owner-1", { ...input(), motion: { ...input().motion, landmarks: [] } })).toThrow();
    expect(() => parsePublishReelInput("owner-1", { ...input(), video: null, motion: null })).toThrow();
    for (const durationMs of [0, -1, 180001, 1.5, Infinity, NaN]) {
      expect(() => parsePublishReelInput("owner-1", { ...input(), durationMs })).toThrow();
    }
    expect(() => parsePublishReelInput("owner/1", input())).toThrow();
    expect(() => parsePublishReelInput("owner-1", { ...input(), postId: "../secret" })).toThrow();
  });

  it("rejects inconsistent privacy, document identity, and uncommitted timestamps", () => {
    expect(() => parseReelPost("other0001", post())).toThrow();
    expect(() => parseReelPost("post00001", { ...post(), privacy: "private" })).toThrow();
    expect(() => parseReelPost("post00001", { ...post(), createdAt: null })).toThrow();
    expect(parseReelPost("post00001", { ...post(), privacy: "private", publicOptIn: false }).privacy).toBe("private");
  });

  it("saves one bounded playback moment with no copy of public or private media data", () => {
    expect(parseSaveReelInput({ postId: "post00001", timeMs: 0 })).toEqual({ postId: "post00001", timeMs: 0 });
    const saved = { schemaVersion: 1, postId: "post00001", timeMs: 11999, savedAt: Timestamp.fromMillis(2000) };
    expect(parseSavedReel("post00001", saved).timeMs).toBe(11999);
    expect(() => parseSavedReel("other0001", saved)).toThrow();
    expect(() => parseSavedReel("post00001", { ...saved, video: input().video })).toThrow();
    for (const timeMs of [-1, 180001, 0.2, NaN, Infinity]) expect(() => parseSaveReelInput({ postId: "post00001", timeMs })).toThrow();
  });
});
