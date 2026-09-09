import type { UserReel } from "@/lib/feed/reel-model";
import { relativeDayLabel } from "@/lib/format/relative-day";
import { decodeMotionPacketOrNull } from "@/lib/reels/motion-packet-adapter";
import type { MotionPacketV1 } from "@/lib/reels/motion-packet-v1";
import type { ReelMediaLoader } from "@/lib/reels/reel-media";
import type { ReelPost } from "@/lib/reels/social-contract";

/**
 * Public reels of other shooters: `reelPosts` metadata -> video reference ->
 * motion reference -> MotionPacket decode -> Reel item. Only public metadata
 * and public objects are read; the private representative profile is never
 * touched here. Every step degrades on its own: a missing or broken packet
 * only loses Motion Lift, a video the store will not serve only loses the
 * video, and a failing list yields no public reels rather than a broken feed.
 */
export type PublicReelSource = {
  listPublicReels(input: { pageSize: number; afterPostId?: string }): Promise<{ items: ReelPost[]; nextAfterPostId: string | null }>;
};

export type PublicReelMediaLoader = ReelMediaLoader;

export type PublicReelMedia = { packet: MotionPacketV1 | null; videoUri: string | null };

const CAPTION = {
  packet: "공개 게시물 · 4D 추정 · 실측 3D 아님",
  video: "공개 게시물 · 영상",
  none: "공개 게시물 · 미디어 준비 중",
} as const;

export function publicReelFromPost(post: ReelPost, media: PublicReelMedia): UserReel {
  return {
    kind: "user",
    id: `post-${post.postId}`,
    author: "공개 슛폼",
    meta: relativeDayLabel(post.createdAt.toDate()),
    caption: media.packet ? CAPTION.packet : media.videoUri ? CAPTION.video : CAPTION.none,
    motion: {
      source: "public",
      postId: post.postId,
      durationMs: post.durationMs,
      packet: media.packet,
      video: media.videoUri ? { uri: media.videoUri } : null,
    },
  };
}

async function loadPacket(post: ReelPost, media: PublicReelMediaLoader): Promise<MotionPacketV1 | null> {
  if (!post.motion) return null;
  try {
    return decodeMotionPacketOrNull(await media.fetchMotionPacket(post.motion.objectPath));
  } catch {
    return null;
  }
}

async function loadVideo(post: ReelPost, media: PublicReelMediaLoader): Promise<string | null> {
  if (!post.video) return null;
  try {
    return await media.resolveVideoUri(post.video.objectPath);
  } catch {
    return null;
  }
}

export type LoadPublicReelsInput = {
  source: PublicReelSource;
  media: PublicReelMediaLoader;
  /** My own posts already appear as my reel; keep them out of the public list. */
  excludeOwnerUid: string | null;
  pageSize: number;
};

export async function loadPublicReels({ source, media, excludeOwnerUid, pageSize }: LoadPublicReelsInput): Promise<UserReel[]> {
  let posts: ReelPost[];
  try {
    posts = (await source.listPublicReels({ pageSize })).items;
  } catch {
    return [];
  }
  const visible = posts.filter((post) => excludeOwnerUid === null || post.ownerUid !== excludeOwnerUid);
  return Promise.all(visible.map(async (post) => {
    const [packet, videoUri] = await Promise.all([loadPacket(post, media), loadVideo(post, media)]);
    return publicReelFromPost(post, { packet, videoUri });
  }));
}
