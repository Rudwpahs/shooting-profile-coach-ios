import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = existsSync("lib/compliance/ios-release-readiness.ts") ? readFileSync("lib/compliance/ios-release-readiness.ts", "utf8") : "";
describe("iOS release readiness contract", () => {
  it("defines five independent archive-time blockers", () => {
    for (const token of ["xcode_privacy_report", "required_reason_apis", "third_party_sdk_manifests", "app_store_privacy_labels", "firestore_region"]) expect(source).toContain(token);
    expect(source).toContain("getIosReleaseBlockers");
  });
});
