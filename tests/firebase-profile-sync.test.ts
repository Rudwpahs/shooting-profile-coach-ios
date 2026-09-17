import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("firebase account data minimization", () => {
  const authSource = readFileSync("lib/firebase-auth.tsx", "utf8");
  const privateDataSource = readFileSync("lib/firebase-private-data.ts", "utf8");
  const profileSource = readFileSync("app/(tabs)/profile.tsx", "utf8");
  const rulesSource = readFileSync("firestore.rules", "utf8");

  it("does not sync a duplicate root owner profile from auth", () => {
    expect(authSource).not.toContain("syncOwnerProfile");
    expect(authSource).not.toContain("profileSync");
    expect(authSource).not.toContain("runProfileSync");
  });

  it("does not keep a root profile upsert or duplicate the auth email in Firestore", () => {
    expect(privateDataSource).not.toContain("ensureFirebaseProfile");
    expect(privateDataSource).not.toContain("PROFILE_EMAIL_REQUIRED");
    expect(privateDataSource).not.toContain("user.email");
    expect(privateDataSource).not.toContain("displayName");
  });

  it("does not surface obsolete profile-sync UI state", () => {
    expect(profileSource).not.toContain("profileSync");
    expect(profileSource).not.toContain("syncWarning");
  });

  it("blocks new root user document create/update while retaining owner read/delete for legacy cleanup", () => {
    const rootBlock = rulesSource.slice(
      rulesSource.indexOf("match /users/{userId}"),
      rulesSource.indexOf("match /poses/{poseId}"),
    );
    expect(rootBlock).toContain("allow read: if signedInOwner(userId)");
    expect(rootBlock).toContain("allow create, update: if false");
    expect(rootBlock).toContain("allow delete: if signedInOwner(userId)");
    expect(rootBlock).not.toContain("request.resource.data.email");
  });
});
