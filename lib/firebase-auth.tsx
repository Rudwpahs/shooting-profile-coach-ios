import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";

import { firebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import { ensureFirebaseProfile } from "@/lib/firebase-private-data";

type FirebaseAuthContextValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const FirebaseAuthContext = createContext<FirebaseAuthContextValue | null>(null);

function requireAuth() {
  if (!firebaseAuth) throw new Error("Firebase 연결 설정이 아직 완료되지 않았습니다.");
  return firebaseAuth;
}

export function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseAuth) { setLoading(false); return; }
    return onAuthStateChanged(firebaseAuth, (nextUser) => { setUser(nextUser); setLoading(false); });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(requireAuth(), email.trim(), password);
  }, []);
  const signUp = useCallback(async (email: string, password: string) => {
    const credential = await createUserWithEmailAndPassword(requireAuth(), email.trim(), password);
    await ensureFirebaseProfile(credential.user);
  }, []);
  const logout = useCallback(async () => { await signOut(requireAuth()); }, []);
  const value = useMemo(() => ({ user, loading, configured: isFirebaseConfigured, signIn, signUp, logout }), [loading, signIn, signUp, user, logout]);
  return <FirebaseAuthContext.Provider value={value}>{children}</FirebaseAuthContext.Provider>;
}

export function useFirebaseAuth() {
  const value = useContext(FirebaseAuthContext);
  if (!value) throw new Error("useFirebaseAuth must be used inside FirebaseAuthProvider");
  return value;
}
