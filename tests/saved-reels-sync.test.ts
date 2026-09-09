import { describe, expect, it, vi } from "vitest";

import type { ReelItem } from "@/lib/feed/reel-model";
import { releaseMomentTimeMs, syncSavedMoment, syncUnsavedMoment, type SavedReelStore } from "@/lib/feed/saved-reels-sync";

const publicReel = (postId = "post00001", durationMs = 12000): ReelItem => ({
  kind: "user",
  id: `post-${postId}`,
  author: "공개 슛폼",
  caption: "공개 게시물 · 영상",
  motion: { source: "public", postId, durationMs, packet: null, video: { uri: "https://storage.example.test/video.mp4" } },
});
const ownReel: ReelItem = {
  kind: "reference",
  id: "reference-cmu",
  label: "MOTION 01",
  attribution: "CMU optical mocap",
  motion: { source: "reference", motion: { id: "cmu", frames: [], boundary: "actual_optical_mocap_3d" }, hand: "right" },
};
const store = () => ({ saveReelMoment: vi.fn(async () => undefined), unsaveReel: vi.fn(async () => undefined) });

describe("saved reels sync", () => {
  it("maps the inspected release still to a time inside the post", () => {
    expect(releaseMomentTimeMs(12000)).toBe(9000);
    expect(releaseMomentTimeMs(1)).toBe(1);
    expect(releaseMomentTimeMs(0)).toBe(0);
    expect(releaseMomentTimeMs(180_000)).toBe(135_000);
  });

  it("persists a public post moment once per post, under the same document, and never throws", async () => {
    const social = store();
    expect(await syncSavedMoment(social, publicReel(), { itemId: "post-post00001", yaw: -22.6 })).toEqual({ persisted: true, postId: "post00001", timeMs: 9000 });
    expect(await syncSavedMoment(social, publicReel(), { itemId: "post-post00001", yaw: 10 })).toEqual({ persisted: true, postId: "post00001", timeMs: 9000 });
    expect(social.saveReelMoment.mock.calls).toEqual([[{ postId: "post00001", timeMs: 9000 }], [{ postId: "post00001", timeMs: 9000 }]]);
    const failing: SavedReelStore = { saveReelMoment: async () => { throw new Error("permission-denied"); }, unsaveReel: async () => undefined };
    expect(await syncSavedMoment(failing, publicReel(), { itemId: "post-post00001", yaw: 0 })).toEqual({ persisted: false, reason: "persistence_failed" });
  });

  it("leaves reels that are not public posts in session state only", async () => {
    const social = store();
    expect(await syncSavedMoment(social, ownReel, { itemId: "reference-cmu", yaw: 0 })).toEqual({ persisted: false, reason: "not_a_post" });
    expect(await syncSavedMoment(null, publicReel(), { itemId: "post-post00001", yaw: 0 })).toEqual({ persisted: false, reason: "not_configured" });
    expect(social.saveReelMoment).not.toHaveBeenCalled();
  });

  it("removes the saved document on unsave and swallows failures", async () => {
    const social = store();
    expect(await syncUnsavedMoment(social, publicReel())).toEqual({ persisted: true, postId: "post00001" });
    expect(social.unsaveReel).toHaveBeenCalledWith("post00001");
    const failing: SavedReelStore = { saveReelMoment: async () => undefined, unsaveReel: async () => { throw new Error("offline"); } };
    expect(await syncUnsavedMoment(failing, publicReel())).toEqual({ persisted: false, reason: "persistence_failed" });
    expect(await syncUnsavedMoment(social, ownReel)).toEqual({ persisted: false, reason: "not_a_post" });
  });
});
