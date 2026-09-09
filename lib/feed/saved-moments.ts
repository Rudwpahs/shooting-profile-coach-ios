/**
 * Saved moments, state only. A held-up release on a Reel keeps the yaw the
 * shooter was looking at; the rail bookmark reflects it and toggles it. No
 * persistence lives here: the saved-post boundary belongs to the backend
 * lane, and until it exists this state is per session.
 */
export type SavedMoment = {
  itemId: string;
  yaw: number;
  savedAtMs: number;
};

export function isMomentSaved(list: readonly SavedMoment[], itemId: string): boolean {
  return list.some((item) => item.itemId === itemId);
}

/** Keeps at most one moment per item; a later save replaces the earlier yaw. */
export function saveMoment(list: readonly SavedMoment[], moment: SavedMoment): SavedMoment[] {
  return [...list.filter((item) => item.itemId !== moment.itemId), moment];
}

export function unsaveMoment(list: readonly SavedMoment[], itemId: string): SavedMoment[] {
  return list.filter((item) => item.itemId !== itemId);
}

export function toggleSavedMoment(list: readonly SavedMoment[], moment: SavedMoment): SavedMoment[] {
  return isMomentSaved(list, moment.itemId) ? unsaveMoment(list, moment.itemId) : saveMoment(list, moment);
}
