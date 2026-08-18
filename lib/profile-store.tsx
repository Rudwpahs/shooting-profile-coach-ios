import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { createDefaultProfile, type UserShotProfile } from "@/lib/recommendation";

const STORAGE_KEY = "@formpath/user-shot-profile/v1";

type ProfileContextValue = {
  profile: UserShotProfile;
  ready: boolean;
  updateProfile: (update: Partial<Omit<UserShotProfile, "traits" | "updatedAt">> & { traits?: Partial<UserShotProfile["traits"]> }) => Promise<void>;
  clearProfile: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<UserShotProfile>(createDefaultProfile());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!value) return;
        const stored = JSON.parse(value) as UserShotProfile;
        if (stored?.traits && stored.goal && stored.skillLevel) setProfile(stored);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const updateProfile = useCallback(async (update: Partial<Omit<UserShotProfile, "traits" | "updatedAt">> & { traits?: Partial<UserShotProfile["traits"]> }) => {
    const next = {
      ...profile,
      ...update,
      traits: { ...profile.traits, ...update.traits },
      updatedAt: new Date().toISOString(),
    };
    setProfile(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [profile]);

  const clearProfile = useCallback(async () => {
    const next = createDefaultProfile();
    setProfile(next);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(() => ({ profile, ready, updateProfile, clearProfile }), [profile, ready, updateProfile, clearProfile]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) throw new Error("useProfile must be used inside ProfileProvider");
  return context;
}
