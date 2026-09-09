import { Timestamp } from "firebase/firestore";
import { z } from "zod";

/** Public metadata only. Storage object contents require a separate admission boundary. */
export const REEL_MAX_DURATION_MS = 180_000;
export const REEL_MAX_PAGE_SIZE = 25;
const postIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const ownerUidSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const timeMsSchema = z.number().int().min(0).max(REEL_MAX_DURATION_MS);
const timestampSchema = z.instanceof(Timestamp).refine((value) => value.toMillis() >= 0);
const videoSchema = z.strictObject({ objectPath: z.string().max(256), contentType: z.literal("video/mp4") });
const motionSchema = z.strictObject({ objectPath: z.string().max(256), format: z.literal("motion_packet_v1") });
const mediaFields = {
  postId: postIdSchema,
  durationMs: z.number().int().min(1).max(REEL_MAX_DURATION_MS),
  video: videoSchema.nullable(),
  motion: motionSchema.nullable(),
};
const publishSchema = z.strictObject({ ...mediaFields, publicOptIn: z.literal(true) });
const postSchema = z.strictObject({
  ...mediaFields, schemaVersion: z.literal(1), ownerUid: ownerUidSchema,
  privacy: z.enum(["public", "private"]), publicOptIn: z.boolean(),
  createdAt: timestampSchema, updatedAt: timestampSchema,
}).refine((value) => value.publicOptIn === (value.privacy === "public"), "privacy_opt_in_mismatch")
  .refine((value) => value.updatedAt.toMillis() >= value.createdAt.toMillis(), "timestamp_order");
const saveSchema = z.strictObject({ postId: postIdSchema, timeMs: timeMsSchema });
const savedSchema = z.strictObject({ schemaVersion: z.literal(1), postId: postIdSchema, timeMs: timeMsSchema, savedAt: timestampSchema });
const privacySchema = z.strictObject({ postId: postIdSchema, privacy: z.enum(["public", "private"]), publicOptIn: z.boolean() })
  .refine((value) => value.publicOptIn === (value.privacy === "public"), "privacy_opt_in_mismatch");
const pageSchema = z.strictObject({ pageSize: z.number().int().min(1).max(REEL_MAX_PAGE_SIZE).default(20), afterPostId: postIdSchema.optional() });

export type PublishReelInput = z.infer<typeof publishSchema>;
export type ReelPost = z.infer<typeof postSchema>;
export type SaveReelInput = z.infer<typeof saveSchema>;
export type SavedReel = z.infer<typeof savedSchema>;
export type ReelPrivacyInput = z.infer<typeof privacySchema>;
export type ReelPageInput = z.input<typeof pageSchema>;

export function parseReelPostId(value: unknown): string { return postIdSchema.parse(value); }
export function parseReelOwnerUid(value: unknown): string { return ownerUidSchema.parse(value); }

function validateMediaOwner(ownerUid: string, data: Pick<ReelPost, "postId" | "video" | "motion">): void {
  if (!data.video && !data.motion) throw new Error("reel_media_required");
  const prefix = `reels/${ownerUid}/${data.postId}`;
  if (data.video && data.video.objectPath !== `${prefix}/video.mp4`) throw new Error("invalid_video_reference");
  if (data.motion && data.motion.objectPath !== `${prefix}/motion.v1.bin`) throw new Error("invalid_motion_reference");
}

export function parsePublishReelInput(ownerUid: string, value: unknown): PublishReelInput {
  const owner = parseReelOwnerUid(ownerUid);
  const parsed = publishSchema.parse(value);
  validateMediaOwner(owner, parsed);
  return parsed;
}

export function parseReelPost(postId: string, value: unknown): ReelPost {
  const parsed = postSchema.parse(value);
  if (parsed.postId !== parseReelPostId(postId)) throw new Error("post_identity_mismatch");
  validateMediaOwner(parsed.ownerUid, parsed);
  return parsed;
}

export function parseSaveReelInput(value: unknown): SaveReelInput { return saveSchema.parse(value); }
export function parseReelPrivacyInput(value: unknown): ReelPrivacyInput { return privacySchema.parse(value); }
export function parseReelPageInput(value: unknown = {}): z.infer<typeof pageSchema> { return pageSchema.parse(value); }

export function parseSavedReel(postId: string, value: unknown): SavedReel {
  const parsed = savedSchema.parse(value);
  if (parsed.postId !== parseReelPostId(postId)) throw new Error("post_identity_mismatch");
  return parsed;
}
