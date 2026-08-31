import { describe, expect, it } from "vitest";

import { LegacyCloudSaveDisabledError } from "@/lib/firebase-private-data";
import { describeLegacySaveFailure } from "@/lib/legacy-capture-status";

describe("legacy capture status messaging", () => {
  it("reports a blocked save, never a successful one, when cloud writes are disabled", () => {
    const outcome = describeLegacySaveFailure(new LegacyCloudSaveDisabledError());
    expect(outcome.state).toBe("blocked");
    expect(outcome.detail).toContain("클라우드 저장");
    expect(outcome.detail).not.toContain("저장했습니다");
  });

  it("keeps ordinary failures on the error path with their own message", () => {
    const outcome = describeLegacySaveFailure(new Error("network unreachable"));
    expect(outcome.state).toBe("error");
    expect(outcome.detail).toContain("network unreachable");
  });

  it("falls back to a readable message for a non-Error rejection", () => {
    const outcome = describeLegacySaveFailure("boom");
    expect(outcome.state).toBe("error");
    expect(outcome.detail.length).toBeGreaterThan(0);
  });
});
