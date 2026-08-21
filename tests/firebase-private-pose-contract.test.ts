import { describe, expect, it } from "vitest";

import { validateFirebasePrivatePoseInput } from "@/lib/firebase-private-pose-contract";

const base = { sourceLabel: "개인 슈팅", poseJson: "{}", qualityJson: "{}" };

describe("Firebase private pose contract", () => {
  it("accepts a bounded legacy pose record and a complete corrected motion pair", () => {
    expect(validateFirebasePrivatePoseInput(base)).toEqual([]);
    expect(validateFirebasePrivatePoseInput({ ...base, correctedMotionJson: "{}", correctionJson: "{}" })).toEqual([]);
  });

  it("rejects malformed JSON and a partial corrected motion pair before Firestore", () => {
    expect(validateFirebasePrivatePoseInput({ ...base, poseJson: "not-json" })).toContain("invalid_pose_json");
    expect(validateFirebasePrivatePoseInput({ ...base, correctedMotionJson: "{}" })).toContain("incomplete_corrected_motion_pair");
  });
});
