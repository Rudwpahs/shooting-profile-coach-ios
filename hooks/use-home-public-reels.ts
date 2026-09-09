import type { User } from "firebase/auth";
import { useEffect, useRef, useState } from "react";

import { loadPublicReels } from "@/lib/feed/public-reels";
import type { UserReel } from "@/lib/feed/reel-model";
import type { SavedReelStore } from "@/lib/feed/saved-reels-sync";
import { firebaseApp, firebaseAuth, firestore } from "@/lib/firebase";
import { createReelMediaLoader, type ReelMediaLoader } from "@/lib/reels/reel-media";
import { createReelSocialPersistence } from "@/lib/reels/social-persistence";

/**
 * Home's public reels and the saved-post store behind one dependency object,
 * so the screen never builds Firebase clients itself and tests can hand it
 * fakes. Everything degrades to "no public reels" when Firebase is not
 * configured or a read fails; the local composition is the fallback.
 */
export type HomeSocialDependencies = {
  social: (ReturnType<typeof createReelSocialPersistence> & SavedReelStore) | null;
  media: ReelMediaLoader;
};

export function createHomeSocialDependencies(): HomeSocialDependencies {
  return {
    social: firestore ? createReelSocialPersistence({ firestore, auth: firebaseAuth }) : null,
    media: createReelMediaLoader({ app: firebaseApp }),
  };
}

let shared: HomeSocialDependencies | null = null;
export function homeSocialDependencies(): HomeSocialDependencies {
  shared ??= createHomeSocialDependencies();
  return shared;
}

export type HomePublicReelsState = {
  status: "idle" | "loading" | "ready" | "unavailable";
  reels: UserReel[];
  /** Post ids I have saved, from the first page of my saved reels; empty when unavailable. */
  savedPostIds: string[];
};

const PAGE_SIZE = 20;
const IDLE: HomePublicReelsState = { status: "idle", reels: [], savedPostIds: [] };

export function useHomePublicReels(user: User | null, authLoading: boolean, dependencies: HomeSocialDependencies = homeSocialDependencies()): HomePublicReelsState {
  const [state, setState] = useState<HomePublicReelsState>(IDLE);
  const generation = useRef(0);
  const uid = user?.uid ?? null;

  useEffect(() => {
    const current = ++generation.current;
    const live = () => generation.current === current;
    if (authLoading) {
      setState({ status: "loading", reels: [], savedPostIds: [] });
      return;
    }
    const { social, media } = dependencies;
    if (!social) {
      setState({ status: "unavailable", reels: [], savedPostIds: [] });
      return;
    }
    setState({ status: "loading", reels: [], savedPostIds: [] });
    const saved = uid
      ? social.listSavedReels({ pageSize: 25 }).then((page) => page.items.map((item) => item.postId)).catch(() => [] as string[])
      : Promise.resolve([] as string[]);
    Promise.all([loadPublicReels({ source: social, media, excludeOwnerUid: uid, pageSize: PAGE_SIZE }), saved])
      .then(([reels, savedPostIds]) => {
        if (live()) setState({ status: "ready", reels, savedPostIds });
      })
      .catch(() => {
        if (live()) setState({ status: "unavailable", reels: [], savedPostIds: [] });
      });
  }, [authLoading, dependencies, uid]);

  return state;
}
