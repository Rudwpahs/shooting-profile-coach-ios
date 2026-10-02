import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";

import { deleteFirebaseAccount } from "@/lib/firebase-account-deletion";
import { firebaseAuth, isFirebaseConfigured } from "@/lib/firebase";

export type FirebaseAuthContextValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const FirebaseAuthContext = createContext<FirebaseAuthContextValue | null>(null);

function requireAuth() {
  if (!firebaseAuth) throw new Error("Firebase 연결 설정이 아직 완료되지 않았습니다.");
  return firebaseAuth;
}

/**
 * Production auth. The install-free web preview replaces only the value of
 * this context with a synthetic signed-in user, behind a build-time-foldable
 * gate; the screens that consume `useFirebaseAuth` are untouched.
 */
export function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  if (process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const preview = require("@/lib/preview/preview-auth") as typeof import("@/lib/preview/preview-auth");
    return <FirebaseAuthContext.Provider value={preview.PREVIEW_AUTH_VALUE}>{children}</FirebaseAuthContext.Provider>;
  }
  return <FirebaseBackedAuthProvider>{children}</FirebaseBackedAuthProvider>;
}

function FirebaseBackedAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseAuth) { setLoading(false); return; }
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(requireAuth(), email.trim(), password);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    await createUserWithEmailAndPassword(requireAuth(), email.trim(), password);
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    const currentUser = requireAuth().currentUser;
    if (!currentUser) throw new Error("삭제할 로그인 계정이 없습니다.");
    await deleteFirebaseAccount(currentUser, password);
  }, []);

  const logout = useCallback(async () => {
    await signOut(requireAuth());
  }, []);

  const value = useMemo(
    () => ({ user, loading, configured: isFirebaseConfigured, signIn, signUp, deleteAccount, logout }),
    [deleteAccount, loading, logout, signIn, signUp, user],
  );
  return <FirebaseAuthContext.Provider value={value}>{children}</FirebaseAuthContext.Provider>;
}

export function useFirebaseAuth() {
  const value = useContext(FirebaseAuthContext);
  if (!value) throw new Error("useFirebaseAuth must be used inside FirebaseAuthProvider");
  return value;
}
