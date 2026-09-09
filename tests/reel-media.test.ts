import { describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  bytes: new Map<string, ArrayBuffer>(),
  urls: new Map<string, string>(),
  calls: [] as unknown[][],
}));

vi.mock("firebase/storage", () => ({
  getStorage: (app: unknown) => ({ app }),
  ref: (_storage: unknown, path: string) => ({ path }),
  getBytes: async (reference: { path: string }, maxDownloadSizeBytes?: number) => {
    store.calls.push(["getBytes", reference.path, maxDownloadSizeBytes]);
    const buffer = store.bytes.get(reference.path);
    if (!buffer) throw new Error("storage/object-not-found");
    return buffer;
  },
  getDownloadURL: async (reference: { path: string }) => {
    store.calls.push(["getDownloadURL", reference.path]);
    const url = store.urls.get(reference.path);
    if (!url) throw new Error("storage/unauthorized");
    return url;
  },
}));

const { createReelMediaLoader } = await import("@/lib/reels/reel-media");
const { MOTION_PACKET_V1_BYTES } = await import("@/lib/reels/motion-packet-adapter");

describe("reel media loader", () => {
  it("does nothing without a configured Firebase app", async () => {
    const loader = createReelMediaLoader({ app: null });
    expect(await loader.fetchMotionPacket("reels/owner-1/post00001/motion.v1.bin")).toBeNull();
    expect(await loader.resolveVideoUri("reels/owner-1/post00001/video.mp4")).toBeNull();
    expect(store.calls).toHaveLength(0);
  });

  it("reads a packet with the exact size cap and resolves a video URL, returning null on any failure", async () => {
    store.bytes.set("reels/owner-1/post00001/motion.v1.bin", new Uint8Array([1, 2, 3]).buffer);
    store.urls.set("reels/owner-1/post00001/video.mp4", "https://storage.example.test/signed/video.mp4");
    const loader = createReelMediaLoader({ app: {} as never });
    const packet = await loader.fetchMotionPacket("reels/owner-1/post00001/motion.v1.bin");
    expect(packet).toBeInstanceOf(Uint8Array);
    expect(Array.from(packet ?? [])).toEqual([1, 2, 3]);
    expect(store.calls).toContainEqual(["getBytes", "reels/owner-1/post00001/motion.v1.bin", MOTION_PACKET_V1_BYTES]);
    expect(await loader.resolveVideoUri("reels/owner-1/post00001/video.mp4")).toBe("https://storage.example.test/signed/video.mp4");
    expect(await loader.fetchMotionPacket("reels/owner-1/post00009/motion.v1.bin")).toBeNull();
    expect(await loader.resolveVideoUri("reels/owner-1/post00009/video.mp4")).toBeNull();
  });

  it("refuses references outside the canonical reel object layout before touching storage", async () => {
    const loader = createReelMediaLoader({ app: {} as never });
    const before = store.calls.length;
    expect(await loader.fetchMotionPacket("../users/owner-1/private.bin")).toBeNull();
    expect(await loader.resolveVideoUri("reels/owner-1/post00001/../../secret.mp4")).toBeNull();
    expect(await loader.fetchMotionPacket("reels/owner-1/post00001/video.mp4")).toBeNull();
    expect(store.calls).toHaveLength(before);
  });
});
