import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";

import { firebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import { syncOwnerProfile, type ProfileSyncOutcome } from "@/lib/firebase-profile-sync";

type FirebaseAuthContextValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  /** Result of the owner-profile upsert for the current session, or null before one ran. */
  profileSync: ProfileSyncOutcome | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const FirebaseAuthContext = createContext<FirebaseAuthContextValue | null>(null);

function requireAuth() {
  if (!firebaseAuth) throw new Error("Firebase 연결 설정이 아직 완료되지 않았습니다.");
  return firebaseAuth;
}

function previewAuthDisabledError() {
  return new Error("Firebase 인증은 공개 미리보기에서 비활성화되어 있습니다.");
}

export function FirebaseAuthProvider({ children, disabled = false }: { children: ReactNode; disabled?: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!disabled);
  const [profileSync, setProfileSync] = useState<ProfileSyncOutcome | null>(null);

  const syncedUidRef = useRef<string | null>(null);

  const runProfileSync = useCallback(async (nextUser: User) => {
    if (disabled) return;
    syncedUidRef.current = nextUser.uid;
    setProfileSync(await syncOwnerProfile(nextUser));
  }, [disabled]);

  // A session restored from storage never passes through signIn, so the repair has
  // to run here as well. Public preview mode explicitly skips this subscription so
  // a persisted browser login can never trigger a real profile-sync write.
  useEffect(() => {
    if (disabled) {
      syncedUidRef.current = null;
      setUser(null);
      setProfileSync(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (!firebaseAuth) { setLoading(false); return; }
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
      if (!nextUser) { syncedUidRef.current = null; setProfileSync(null); return; }
      if (syncedUidRef.current === nextUser.uid) return;
      void runProfileSync(nextUser);
    });
  }, [disabled, runProfileSync]);

  // Sign-in repairs a profile document that a previous sign-up never managed to
  // write. The upsert is idempotent, so running it on every sign-in is safe.
  const signIn = useCallback(async (email: string, password: string) => {
    if (disabled) throw previewAuthDisabledError();
    const credential = await signInWithEmailAndPassword(requireAuth(), email.trim(), password);
    await runProfileSync(credential.user);
  }, [disabled, runProfileSync]);
  // A failed profile write no longer rejects sign-up: the account already exists at
  // that point, so rejecting would strand the user on `email-already-in-use` with no
  // profile. The failure is reported instead, and the next sign-in retries it.
  const signUp = useCallback(async (email: string, password: string) => {
    if (disabled) throw previewAuthDisabledError();
    const credential = await createUserWithEmailAndPassword(requireAuth(), email.trim(), password);
    await runProfileSync(credential.user);
  }, [disabled, runProfileSync]);
  const logout = useCallback(async () => {
    if (disabled) {
      syncedUidRef.current = null;
      setUser(null);
      setProfileSync(null);
      return;
    }
    await signOut(requireAuth());
    syncedUidRef.current = null;
    setProfileSync(null);
  }, [disabled]);
  const value = useMemo(
    () => ({
      user,
      loading,
      configured: disabled ? false : isFirebaseConfigured,
      profileSync,
      signIn,
      signUp,
      logout,
    }),
    [disabled, loading, logout, profileSync, signIn, signUp, user],
  );
  return <FirebaseAuthContext.Provider value={value}>{children}</FirebaseAuthContext.Provider>;
}

export function useFirebaseAuth() {
  const value = useContext(FirebaseAuthContext);
  if (!value) throw new Error("useFirebaseAuth must be used inside FirebaseAuthProvider");
  return value;
}
