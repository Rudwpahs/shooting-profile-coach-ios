import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Firestore private pose rules", () => {
  const rules = readFileSync("firestore.rules", "utf8");

  it("limits user documents to the authenticated matching UID", () => {
    expect(rules).toContain("request.auth.uid == userId");
    expect(rules).toContain("match /users/{userId}");
    expect(rules).not.toContain("allow read, write: if true");
  });

  it("accepts only bounded private relative-pose documents", () => {
    expect(rules).toContain("match /poses/{poseId}");
    expect(rules).toContain("request.resource.data.poseJson.size() <= 900000");
    expect(rules).toContain("request.resource.data.qualityJson.size() <= 20000");
    expect(rules).toContain("request.resource.data.correctedMotionJson.size() <= 450000");
    expect(rules).toContain("request.resource.data.correctionJson.size() <= 20000");
    expect(rules).toContain("monocular_relative_pose_not_metric_3d");
    expect(rules).toContain("allow update: if false");
  });
});
