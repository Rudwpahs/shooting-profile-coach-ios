import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

/**
 * A like and a memo for one reel, kept on this device only. There are no
 * counts, no sharing and nothing leaves the device; a failed read is shown
 * and can be retried without overwriting what was saved.
 */

const NOTE_LIMIT = 2000;
const REFERENCE_REEL_PREFIX = "reference:";

export function reactionStorageKey(reelId: string, field: "like" | "note"): string {
  return `hoophub:reaction:v1:${reelId}:${field}`;
}

/**
 * The first 참조 동작 screen kept its like and memo under `hoophub:reference:<id>:like|note`.
 * Only a reference reel has such a past; every other reel kind returns null.
 */
export function legacyReactionStorageKey(reelId: string, field: "like" | "note"): string | null {
  if (!reelId.startsWith(REFERENCE_REEL_PREFIX)) return null;
  return `hoophub:reference:${reelId.slice(REFERENCE_REEL_PREFIX.length)}:${field}`;
}

/**
 * The v1 key always wins. When it is absent and the reel is a reference, the
 * legacy value is read and carried forward under the v1 key; a failed
 * migration write never hides the value that was just read.
 */
async function readReaction(reelId: string, field: "like" | "note"): Promise<string | null> {
  const current = await AsyncStorage.getItem(reactionStorageKey(reelId, field));
  if (current !== null) return current;
  const legacyKey = legacyReactionStorageKey(reelId, field);
  if (!legacyKey) return null;
  const legacy = await AsyncStorage.getItem(legacyKey);
  if (legacy === null) return null;
  try {
    await AsyncStorage.setItem(reactionStorageKey(reelId, field), legacy);
  } catch {
    // The legacy entry stays where it is; the next read migrates again.
  }
  return legacy;
}

export type DeviceReactions = Readonly<{
  ready: boolean;
  liked: boolean;
  note: string;
  saving: boolean;
  error: string;
  toggleLike(): Promise<void>;
  saveNote(draft: string): Promise<boolean>;
  retryRead(): void;
  clearError(): void;
}>;

export function useDeviceReactions(reelId: string): DeviceReactions {
  const [ready, setReady] = useState(false);
  const [liked, setLiked] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [readAttempt, setReadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setReady(false);
    void Promise.all([readReaction(reelId, "like"), readReaction(reelId, "note")])
      .then(([storedLike, storedNote]) => {
        if (!active) return;
        setLiked(storedLike === "1");
        setNote(storedNote?.slice(0, NOTE_LIMIT) ?? "");
        setReady(true);
      })
      .catch(() => {
        if (active) setError("기기 저장소를 읽지 못했습니다. 다시 읽기를 눌러 주세요.");
      });
    return () => { active = false; };
  }, [readAttempt, reelId]);

  const toggleLike = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      await AsyncStorage.setItem(reactionStorageKey(reelId, "like"), liked ? "0" : "1");
      setLiked((value) => !value);
    } catch {
      setError("좋아요를 저장하지 못했습니다. 다시 눌러 주세요.");
    } finally {
      setSaving(false);
    }
  }, [liked, reelId]);

  const saveNote = useCallback(async (draft: string) => {
    const trimmed = draft.trim().slice(0, NOTE_LIMIT);
    setSaving(true);
    setError("");
    try {
      await AsyncStorage.setItem(reactionStorageKey(reelId, "note"), trimmed);
      setNote(trimmed);
      return true;
    } catch {
      setError("메모를 저장하지 못했습니다. 다시 시도해 주세요.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [reelId]);

  const retryRead = useCallback(() => {
    setError("");
    setReadAttempt((value) => value + 1);
  }, []);
  const clearError = useCallback(() => setError(""), []);

  return { ready, liked, note, saving, error, toggleLike, saveNote, retryRead, clearError };
}
