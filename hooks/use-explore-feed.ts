import { useEffect, useRef, useState } from "react";

import type { ExploreMotionV1 } from "@/lib/explore-source";
import { createExploreFeedState, exploreFeedTarget, loadExploreFeed, type ExploreFeedState } from "@/lib/explore-feed";

/**
 * Owns the progressive Explore feed: the reels built so far and the active
 * index the feed reports. Each time the active index or the built set
 * changes, it builds up to the window ahead, one load at a time; a result
 * that lands after unmount is dropped.
 */
export function useExploreFeed(motions: readonly ExploreMotionV1[]) {
  const [state, setState] = useState<ExploreFeedState>(createExploreFeedState);
  const [activeIndex, setActiveIndex] = useState(0);
  const loading = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const target = exploreFeedTarget(activeIndex, motions.length);
    if (target <= state.cursor || loading.current) return;
    loading.current = true;
    void loadExploreFeed(motions, state, target).then((next) => {
      loading.current = false;
      if (mounted.current) setState(next);
    });
  }, [activeIndex, motions, state]);

  return { items: state.items, total: motions.length, onActiveIndex: setActiveIndex };
}
