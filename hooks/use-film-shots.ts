import { useCallback, useEffect, useRef, useState } from "react";

import { listFilmShots, restoreFilmShot, subscribeFilmShots, type FilmShotV1 } from "@/lib/film-space/film-shots";

export type FilmShotsStatus = "loading" | "ready" | "error";

export type FilmShotsState = Readonly<{
  status: FilmShotsStatus;
  /** Newest first, each shot's clips re-opened for this session. Empty until the first read finishes. */
  shots: readonly FilmShotV1[];
  reload: () => void;
}>;

const NONE: readonly FilmShotV1[] = Object.freeze([]);

/**
 * Every film shot on this device (the owner's own footage, kept without pose
 * analysis), with its clips restored for this session so the Film viewer can
 * open them. Reads on mount, again whenever a shot is saved or deleted
 * anywhere in the app, and on demand. `enabled` false reads nothing, for a
 * screen that already received its items from a handoff.
 */
export function useFilmShots(enabled = true): FilmShotsState {
  const [state, setState] = useState<{ status: FilmShotsStatus; shots: readonly FilmShotV1[] }>({
    status: enabled ? "loading" : "ready",
    shots: NONE,
  });
  const generationRef = useRef(0);

  const load = useCallback(() => {
    const generation = ++generationRef.current;
    void (async () => {
      try {
        const listed = await listFilmShots();
        const restored = await Promise.all(listed.map((shot) => restoreFilmShot(shot)));
        if (generation !== generationRef.current) return;
        setState({ status: "ready", shots: restored });
      } catch {
        if (generation !== generationRef.current) return;
        setState({ status: "error", shots: NONE });
      }
    })();
  }, []);

  useEffect(() => {
    if (!enabled) {
      generationRef.current += 1;
      setState({ status: "ready", shots: NONE });
      return;
    }
    load();
    const unsubscribe = subscribeFilmShots(load);
    return () => {
      unsubscribe();
      generationRef.current += 1;
    };
  }, [enabled, load]);

  return { status: state.status, shots: state.shots, reload: load };
}
