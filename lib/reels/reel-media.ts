import type { FirebaseApp } from "firebase/app";
import { getBytes, getDownloadURL, getStorage, ref } from "firebase/storage";

import { MOTION_PACKET_V1_BYTES } from "@/lib/reels/motion-packet-adapter";

/**
 * The object-storage boundary for public reel media. A post carries exact
 * canonical object paths for its video and its MotionPacket; this loader
 * fetches only those, caps the packet read at the packet size, and answers
 * `null` for anything it cannot serve so a reel degrades instead of failing.
 * Bucket rules and uploads belong to the backend lane.
 */
const MOTION_PATH = /^reels\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{8,64}\/motion\.v1\.bin$/;
const VIDEO_PATH = /^reels\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{8,64}\/video\.mp4$/;

export type ReelMediaLoader = {
  fetchMotionPacket(objectPath: string): Promise<Uint8Array | null>;
  resolveVideoUri(objectPath: string): Promise<string | null>;
};

export function createReelMediaLoader({ app }: { app: FirebaseApp | null }): ReelMediaLoader {
  return {
    async fetchMotionPacket(objectPath) {
      if (!app || !MOTION_PATH.test(objectPath)) return null;
      try {
        const buffer = await getBytes(ref(getStorage(app), objectPath), MOTION_PACKET_V1_BYTES);
        return new Uint8Array(buffer);
      } catch {
        return null;
      }
    },
    async resolveVideoUri(objectPath) {
      if (!app || !VIDEO_PATH.test(objectPath)) return null;
      try {
        return await getDownloadURL(ref(getStorage(app), objectPath));
      } catch {
        return null;
      }
    },
  };
}
