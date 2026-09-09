# Reel social persistence

The social lane stores only public Reel metadata and owner-scoped saved moments.

- `reelPosts/{postId}` contains schema/version, owner, privacy opt-in, duration,
  server timestamps, and exact Storage object references for the optional video
  and MotionPacket V1 objects.
- `users/{uid}/savedReels/{postId}` contains schema/version, source post id,
  bounded `timeMs`, and a server `savedAt` timestamp.

No raw landmarks, masks, covariance, capture evidence, private profile paths, or
arbitrary URLs are accepted. Firestore rules require owner identity, exact keys,
canonical Storage paths, bounded feed queries, and a server timestamp. A public
post may be revoked to private by its owner (and later reopened); public readers
lose access immediately while the owner and existing saved-moment owner retain
their scoped access. Stale saves remain removable after source deletion.

`createReelSocialPersistence` always uses server reads for post visibility and
validates every returned document with the shared Zod contract. Object upload and
deletion remain a separate Storage service boundary.
