import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Firestore private pose rules", () => {
  const rules = readFileSync("firestore.rules", "utf8");

  it("limits user documents to the authenticated matching UID", () => {
    expect(rules).toContain("request.auth.uid == userId");
    expect(rules).toContain("match /users/{userId}");
    expect(rules).not.toContain("allow read, write: if true");
  });

  const posesBlock = rules.slice(
    rules.indexOf("match /poses/{poseId}"),
    rules.indexOf("match /analyses/{analysisId}"),
  );

  it("refuses every new legacy private relative-pose write", () => {
    expect(posesBlock).toContain("match /poses/{poseId}");
    expect(posesBlock).toContain("allow create, update: if false");
    expect(posesBlock).not.toContain("allow create: if signedInOwner");
    expect(rules).not.toContain("request.resource.data.poseJson");
    expect(rules).not.toContain("request.resource.data.qualityJson");
    expect(rules).not.toContain("request.resource.data.correctedMotionJson");
    expect(rules).not.toContain("request.resource.data.correctionJson");
  });

  it("keeps existing legacy documents readable and deletable by their owner", () => {
    expect(posesBlock).toContain("allow read, delete: if signedInOwner(userId)");
  });
});
