import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync("app.config.ts", "utf8");
describe("iOS privacy manifest config", () => {
  it("declares no tracking and enables CocoaPods manifest aggregation", () => {
    expect(source).toContain("privacyManifests");
    expect(source).toContain("NSPrivacyTracking: false");
    expect(source).toContain("NSPrivacyTrackingDomains: []");
    expect(source).toContain("privacyManifestAggregationEnabled: true");
    expect(source).not.toContain("NSPrivacyAccessedAPITypes");
  });
});
