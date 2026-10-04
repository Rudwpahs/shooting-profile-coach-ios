import type { User } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";

import { filmShotCloudSource } from "@/lib/film-shot-cloud-source";
import { listCloudFilmShotsForOwner } from "@/lib/film-space/film-shot-cloud-actions";
import type { CloudFilmShotHeadSummaryV1 } from "@/lib/firebase-film-shots";

export type CloudFilmShotsStatus = "off" | "loading" | "ready" | "error";

export type CloudFilmShotsState = Readonly<{
  /** False in a build that cannot keep footage in the cloud, and while signed out. */
  available: boolean;
  status: CloudFilmShotsStatus;
  /** The owner's kept shots, or null when nothing is known about the cloud. */
  shots: readonly CloudFilmShotHeadSummaryV1[] | null;
  reload: () => void;
}>;

/**
 * The signed-in owner's cloud film shots. In a build that did not opt in, or
 * signed out, it reads nothing and reports `off`. A stale result for a
 * previous owner is dropped.
 */
export function useCloudFilmShots(user: User | null): CloudFilmShotsState {
  const available = filmShotCloudSource.available && user !== null;
  const [state, setState] = useState<{ status: CloudFilmShotsStatus; shots: readonly CloudFilmShotHeadSummaryV1[] | null }>({ status: available ? "loading" : "off", shots: null });
  const generationRef = useRef(0);

  const load = useCallback(() => {
    const generation = ++generationRef.current;
    if (!filmShotCloudSource.available || !user) {
      setState({ status: "off", shots: null });
      return;
    }
    setState((current) => ({ status: "loading", shots: current.shots }));
    void (async () => {
      try {
        const shots = await listCloudFilmShotsForOwner(user);
        if (generation !== generationRef.current) return;
        setState({ status: "ready", shots });
      } catch {
        if (generation !== generationRef.current) return;
        setState({ status: "error", shots: null });
      }
    })();
  }, [user]);

  useEffect(() => {
    load();
    return () => { generationRef.current += 1; };
  }, [load]);

  return { available, status: state.status, shots: state.shots, reload: load };
}
