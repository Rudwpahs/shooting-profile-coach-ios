import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setDoc = vi.fn(async (...args: unknown[]): Promise<void> => { void args; });
type ProfileSnapshot = { exists: () => boolean; metadata: { fromCache: boolean } };
const serverMiss: ProfileSnapshot = { exists: () => false, metadata: { fromCache: false } };
const serverHit: ProfileSnapshot = { exists: () => true, metadata: { fromCache: false } };
const cachedMiss: ProfileSnapshot = { exists: () => false, metadata: { fromCache: true } };
const getDoc = vi.fn(async (): Promise<ProfileSnapshot> => serverMiss);
const deleteDoc = vi.fn(async () => undefined);
const getDocs = vi.fn(async () => ({ docs: [] as { id: string; data: () => unknown }[] }));
const doc = vi.fn(() => ({ id: "users-doc" }));
const collection = vi.fn(() => ({}));
const query = vi.fn(() => ({}));
const orderBy = vi.fn(() => ({}));
const serverTimestamp = vi.fn(() => "server-timestamp");

vi.mock("firebase/firestore", () => ({
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
}));

vi.mock("@/lib/firebase", () => ({ firestore: { id: "fake-firestore" } }));

const { PROFILE_EMAIL_REQUIRED, ProfileEmailRequiredError, ensureFirebaseProfile } = await import(
  "@/lib/firebase-private-data"
);
const { syncOwnerProfile } = await import("@/lib/firebase-profile-sync");

const userWithEmail = { uid: "owner-uid", email: "owner@example.com", displayName: "Owner" } as never;
const userWithoutEmail = { uid: "owner-uid", email: null, displayName: null } as never;

describe("owner profile upsert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDoc.mockResolvedValue(serverMiss);
  });

  it("refuses a user without an email before any network request", async () => {
    await expect(ensureFirebaseProfile(userWithoutEmail)).rejects.toBeInstanceOf(
      ProfileEmailRequiredError,
    );
    expect(PROFILE_EMAIL_REQUIRED).toBe("profile_email_required");
    expect(setDoc).not.toHaveBeenCalled();
    expect(getDoc).not.toHaveBeenCalled();
    expect(doc).not.toHaveBeenCalled();
  });

  it("never writes a null email that the security rules would reject", async () => {
    await ensureFirebaseProfile(userWithoutEmail).catch(() => undefined);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("stamps createdAt when the profile document does not exist yet", async () => {
    await ensureFirebaseProfile(userWithEmail);
    expect(setDoc).toHaveBeenCalledTimes(1);
    const written = setDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(written.email).toBe("owner@example.com");
    expect(written).toHaveProperty("createdAt");
  });

  it("is idempotent: a second call does not rewrite createdAt", async () => {
    getDoc.mockResolvedValue(serverHit);
    await ensureFirebaseProfile(userWithEmail);
    const written = setDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(written).not.toHaveProperty("createdAt");
    expect(written.updatedAt).toBeDefined();
  });

  it("does not stamp createdAt from a cache-only miss", async () => {
    getDoc.mockResolvedValue(cachedMiss);
    await ensureFirebaseProfile(userWithEmail);
    expect(setDoc.mock.calls[0][1]).not.toHaveProperty("createdAt");
  });

  it("still writes the profile when the existence read fails outright", async () => {
    getDoc.mockRejectedValueOnce(new Error("unavailable"));
    await ensureFirebaseProfile(userWithEmail);
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc.mock.calls[0][1]).not.toHaveProperty("createdAt");
  });

  it("still merges rather than replacing the stored document", async () => {
    await ensureFirebaseProfile(userWithEmail);
    expect(setDoc.mock.calls[0][2]).toEqual({ merge: true });
  });
});

describe("profile sync outcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDoc.mockResolvedValue(serverMiss);
  });

  it("reports a synced profile after a successful upsert", async () => {
    await expect(syncOwnerProfile(userWithEmail)).resolves.toEqual({ status: "synced" });
  });

  it("reports a failure with the missing-email code instead of throwing", async () => {
    const outcome = await syncOwnerProfile(userWithoutEmail);
    expect(outcome.status).toBe("failed");
    expect(outcome).toMatchObject({ code: "profile_email_required" });
  });

  it("recovers a profile that a failed sign-up never created", async () => {
    setDoc.mockRejectedValueOnce(new Error("network unreachable"));
    const duringSignUp = await syncOwnerProfile(userWithEmail);
    expect(duringSignUp.status).toBe("failed");

    const duringNextSignIn = await syncOwnerProfile(userWithEmail);
    expect(duringNextSignIn).toEqual({ status: "synced" });
    expect(setDoc).toHaveBeenCalledTimes(2);
  });

  it("surfaces an unexpected failure message rather than silently succeeding", async () => {
    setDoc.mockRejectedValueOnce(new Error("permission-denied"));
    const outcome = await syncOwnerProfile(userWithEmail);
    expect(outcome.status).toBe("failed");
    expect(outcome).toMatchObject({ message: expect.stringContaining("permission-denied") });
    expect((outcome as { message: string }).message).toContain("\ud504\ub85c\ud544 \ub3d9\uae30\ud654\uc5d0 \uc2e4\ud328");
  });
});

/** Structural guard: no React Native render-test setup exists in this repository. */
describe("auth provider wiring", () => {
  const auth = readFileSync("lib/firebase-auth.tsx", "utf8");
  const profile = readFileSync("app/(tabs)/profile.tsx", "utf8");

  /** Reads forward from an anchor so the assertions do not depend on declaration order. */
  const bodyAfter = (source: string, anchor: string) => {
    const index = source.indexOf(anchor);
    expect(index, `missing anchor: ${anchor}`).toBeGreaterThan(-1);
    return source.slice(index, index + 420);
  };

  it("repairs the profile on sign-in, on sign-up, and on a restored session", () => {
    expect(bodyAfter(auth, "const signIn =")).toContain("runProfileSync");
    expect(bodyAfter(auth, "const signUp =")).toContain("runProfileSync");
    expect(bodyAfter(auth, "onAuthStateChanged(")).toContain("runProfileSync");
    expect(auth).toContain("syncOwnerProfile");
  });

  it("clears the sync state when the session ends", () => {
    expect(bodyAfter(auth, "const logout =")).toContain("setProfileSync(null)");
  });

  it("exposes the sync failure so a signed-in session cannot hide it", () => {
    expect(auth).toContain("profileSync");
    expect(profile).toContain('profileSync?.status === "failed"');
  });
});
