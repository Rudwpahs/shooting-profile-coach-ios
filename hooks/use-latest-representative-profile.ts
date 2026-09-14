import type { User } from "firebase/auth";
import { useEffect, useRef, useState } from "react";

import { FORMPATH_FLAGS } from "@/lib/feature-flags";
import { isOpaqueShootingProfileIdV2 } from "@/lib/firebase-shooting-profile-contract";
import {
  getShootingProfileV2,
  listShootingProfilesV2,
  resumePendingShootingProfileDeletionsV2,
  type ShootingProfileSummaryV2,
  type ShootingProfileViewerRecordV2,
} from "@/lib/firebase-shooting-profiles";
import { ownerGenerationMatches, valueForExactOwner } from "@/lib/shooting-profile/capture-session-reducer";

export type LatestRepresentativeState =
  | { status: "signed-out" }
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error" }
  | { status: "ready"; summary: ShootingProfileSummaryV2; record: ShootingProfileViewerRecordV2 };

type Envelope = { ownerUid: string; value: LatestRepresentativeState };

/**
 * The owner's newest representative profile for surfaces that show one
 * skeleton (Home). Follows the profile route's rules exactly: only behind the
 * profile flag, deletion resumption before listing, results bound to the
 * exact owner and dropped when a newer load or another owner supersedes them,
 * opaque id checked before any fetch. Read-only.
 */
export function useLatestRepresentativeProfile(user: User | null, authLoading: boolean): LatestRepresentativeState {
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const generationRef = useRef(0);
  const currentOwnerUidRef = useRef<string | null>(null);
  currentOwnerUidRef.current = user?.uid ?? null;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      generationRef.current += 1;
      setEnvelope(null);
      return;
    }
    if (!FORMPATH_FLAGS.profileV2) return;
    const owner = user;
    const ownerUid = owner.uid;
    const generation = ++generationRef.current;
    const current = () => ownerGenerationMatches(currentOwnerUidRef.current, ownerUid, generationRef.current, generation);
    setEnvelope({ ownerUid, value: { status: "loading" } });
    void (async () => {
      try {
        await resumePendingShootingProfileDeletionsV2(owner);
        if (!current()) return;
        const records = await listShootingProfilesV2(owner);
        if (!current()) return;
        const summary = records[0];
        if (!summary || !isOpaqueShootingProfileIdV2(summary.id)) {
          setEnvelope({ ownerUid, value: { status: "empty" } });
          return;
        }
        const record = await getShootingProfileV2(owner, summary.id);
        if (!current()) return;
        setEnvelope({ ownerUid, value: record ? { status: "ready", summary, record } : { status: "empty" } });
      } catch {
        if (current()) setEnvelope({ ownerUid, value: { status: "error" } });
      }
    })();
  }, [authLoading, user]);

  if (!user) return { status: "signed-out" };
  if (!FORMPATH_FLAGS.profileV2) return { status: "disabled" };
  return valueForExactOwner(user.uid, envelope) ?? { status: "loading" };
}
