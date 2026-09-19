import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => existsSync(path) ? readFileSync(path, "utf8") : "";
const notices = read("THIRD_PARTY_NOTICES.md");
const inventory = read("docs/compliance/shipping-asset-license-inventory.md");
describe("shipping asset license inventory", () => {
  it("covers verified shipping families and evidence", () => {
    for (const token of ["Barlow", "Barlow Condensed", "MaterialCommunityIcons", "MediaPipeTasksVision", "CMU Graphics Lab Motion Capture Database"]) {
      expect(notices + inventory).toContain(token);
    }
    expect(inventory).toContain("VERIFIED");
    expect(inventory).toContain("BLOCKED");
    expect(inventory).toMatch(/https:\/\//);
  });
});
