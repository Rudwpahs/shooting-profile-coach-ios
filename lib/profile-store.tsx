import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { createDefaultProfile, type UserShotProfile } from "@/lib/recommendation";

const STORAGE_KEY = "@formpath/user-shot-profile/v2";
type ProfileUpdate = Partial<Omit<UserShotProfile, "traits" | "body" | "updatedAt">> & { traits?: Partial<UserShotProfile["traits"]>; body?: Partial<UserShotProfile["body"]> };
type ProfileContextValue = { profile: UserShotProfile; ready: boolean; updateProfile: (update: ProfileUpdate) => Promise<void>; clearProfile: () => Promise<void> };
const ProfileContext = createContext<ProfileContextValue | null>(null);

function hydrateProfile(raw: Partial<UserShotProfile> | null | undefined): UserShotProfile {
  const fallback = createDefaultProfile();
  return { ...fallback, ...raw, traits: { ...fallback.traits, ...(raw?.traits ?? {}) }, body: { ...fallback.body, ...(raw?.body ?? {}) } };
}

export function ProfileProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<UserShotProfile>(createDefaultProfile());
  const [ready, setReady] = useState(false);
  useEffect(() => { AsyncStorage.getItem(STORAGE_KEY).then((value) => { if (value) setProfile(hydrateProfile(JSON.parse(value) as Partial<UserShotProfile>)); }).catch(() => undefined).finally(() => setReady(true)); }, []);
  const updateProfile = useCallback(async (update: ProfileUpdate) => {
    const next = hydrateProfile({ ...profile, ...update, traits: { ...profile.traits, ...update.traits }, body: { ...profile.body, ...update.body }, updatedAt: new Date().toISOString() });
    setProfile(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [profile]);
  const clearProfile = useCallback(async () => { const next = createDefaultProfile(); setProfile(next); await AsyncStorage.removeItem(STORAGE_KEY); }, []);
  const value = useMemo(() => ({ profile, ready, updateProfile, clearProfile }), [profile, ready, updateProfile, clearProfile]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() { const context = useContext(ProfileContext); if (!context) throw new Error("useProfile must be used inside ProfileProvider"); return context; }
