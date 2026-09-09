import type { Auth } from "firebase/auth";
import {
  collection, deleteDoc, doc, documentId, getDocFromServer, getDocsFromServer,
  limit, orderBy, query, runTransaction, serverTimestamp, setDoc, startAfter, where,
  type Firestore, type QueryConstraint,
} from "firebase/firestore";

import {
  parsePublishReelInput, parseReelOwnerUid, parseReelPageInput, parseReelPost,
  parseReelPostId, parseReelPrivacyInput, parseSavedReel, parseSaveReelInput,
  type ReelPageInput, type ReelPost, type SavedReel,
} from "@/lib/reels/social-contract";

export type ReelSocialDependencies = { firestore: Firestore | null; auth: Pick<Auth, "currentUser"> | null };
export type ReelPage<T> = { items: T[]; nextAfterPostId: string | null };

/** Uses server reads so a locally cached post cannot bypass a later privacy revoke. */
export function createReelSocialPersistence(dependencies: ReelSocialDependencies) {
  function database(): Firestore {
    if (!dependencies.firestore) throw new Error("not_configured");
    return dependencies.firestore;
  }
  function owner(): { db: Firestore; uid: string } {
    const db = database();
    const user = dependencies.auth?.currentUser;
    if (!user) throw new Error("unauthenticated");
    return { db, uid: parseReelOwnerUid(user.uid) };
  }
  const readable = (post: ReelPost, uid: string | undefined) => post.privacy === "public" || post.ownerUid === uid;
  function pageConstraints(input: ReelPageInput) {
    const options = parseReelPageInput(input);
    const constraints: QueryConstraint[] = [orderBy(documentId())];
    if (options.afterPostId) constraints.push(startAfter(options.afterPostId));
    constraints.push(limit(options.pageSize));
    return { options, constraints };
  }
  function page<T extends { postId: string }>(items: T[], pageSize: number): ReelPage<T> {
    return { items, nextAfterPostId: items.length === pageSize ? items.at(-1)!.postId : null };
  }

  async function getReel(postId: string): Promise<ReelPost | null> {
    const db = database();
    const id = parseReelPostId(postId);
    try {
      const snapshot = await getDocFromServer(doc(db, "reelPosts", id));
      if (!snapshot.exists()) return null;
      const post = parseReelPost(id, snapshot.data());
      return readable(post, dependencies.auth?.currentUser?.uid) ? post : null;
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "permission-denied") return null;
      throw error;
    }
  }

  return {
    async publishReel(input: unknown): Promise<string> {
      const { db, uid } = owner();
      const data = parsePublishReelInput(uid, input);
      await setDoc(doc(db, "reelPosts", data.postId), {
        ...data, schemaVersion: 1, ownerUid: uid, privacy: "public",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      return data.postId;
    },
    async setReelPrivacy(input: unknown): Promise<void> {
      const { db, uid } = owner();
      const data = parseReelPrivacyInput(input);
      const ref = doc(db, "reelPosts", data.postId);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error("post_unavailable");
        const post = parseReelPost(data.postId, snapshot.data());
        if (post.ownerUid !== uid) throw new Error("not_owner");
        transaction.update(ref, { privacy: data.privacy, publicOptIn: data.publicOptIn, updatedAt: serverTimestamp() });
      });
    },
    async deleteReel(postId: string): Promise<void> {
      const { db, uid } = owner();
      const id = parseReelPostId(postId);
      const ref = doc(db, "reelPosts", id);
      const snapshot = await getDocFromServer(ref);
      if (!snapshot.exists()) return;
      if (parseReelPost(id, snapshot.data()).ownerUid !== uid) throw new Error("not_owner");
      // Firestore rules recheck ownership at commit. Object deletion is a separate service boundary.
      await deleteDoc(ref);
    },
    getReel,
    async listPublicReels(input: ReelPageInput = {}): Promise<ReelPage<ReelPost>> {
      const db = database();
      const { options, constraints } = pageConstraints(input);
      const snapshot = await getDocsFromServer(query(collection(db, "reelPosts"), where("privacy", "==", "public"), ...constraints));
      const items = snapshot.docs.map((item) => parseReelPost(item.id, item.data()));
      if (items.some((item) => item.privacy !== "public")) throw new Error("invalid_public_query_result");
      return page(items, options.pageSize);
    },
    async saveReelMoment(input: unknown): Promise<void> {
      const { db, uid } = owner();
      const data = parseSaveReelInput(input);
      await runTransaction(db, async (transaction) => {
        const source = await transaction.get(doc(db, "reelPosts", data.postId));
        if (!source.exists()) throw new Error("post_unavailable");
        const post = parseReelPost(data.postId, source.data());
        if (!readable(post, uid)) throw new Error("post_unavailable");
        if (data.timeMs > post.durationMs) throw new Error("moment_out_of_range");
        transaction.set(doc(db, "users", uid, "savedReels", data.postId), {
          schemaVersion: 1, postId: data.postId, timeMs: data.timeMs, savedAt: serverTimestamp(),
        });
      });
    },
    async unsaveReel(postId: string): Promise<void> {
      const { db, uid } = owner();
      await deleteDoc(doc(db, "users", uid, "savedReels", parseReelPostId(postId)));
    },
    async listSavedReels(input: ReelPageInput = {}): Promise<ReelPage<SavedReel>> {
      const { db, uid } = owner();
      const { options, constraints } = pageConstraints(input);
      const snapshot = await getDocsFromServer(query(collection(db, "users", uid, "savedReels"), ...constraints));
      return page(snapshot.docs.map((item) => parseSavedReel(item.id, item.data())), options.pageSize);
    },
    async resolveSavedReel(postId: string): Promise<{ saved: SavedReel; post: ReelPost | null } | null> {
      const { db, uid } = owner();
      const id = parseReelPostId(postId);
      const snapshot = await getDocFromServer(doc(db, "users", uid, "savedReels", id));
      if (!snapshot.exists()) return null;
      const saved = parseSavedReel(id, snapshot.data());
      return { saved, post: await getReel(id) };
    },
  };
}
