import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firestore: Firestore | null = null;

if (isFirebaseConfigured) {
  firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  // Firebase v12 resolves its Auth persistence implementation by platform.
  // `getAuth` uses browser local persistence on web and the React Native
  // persistence implementation under Metro, without importing an unstable
  // RN-only symbol through the Firebase wrapper's browser type entrypoint.
  firebaseAuth = getAuth(firebaseApp);
  firestore = getFirestore(firebaseApp);
}

export { firebaseApp, firebaseAuth, firestore };
