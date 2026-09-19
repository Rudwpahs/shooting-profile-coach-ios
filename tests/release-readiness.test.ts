import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = existsSync("lib/compliance/release-readiness.ts") ? readFileSync("lib/compliance/release-readiness.ts", "utf8") : "";
const matrix = existsSync("docs/release/hoophub-compliance-matrix.md") ? readFileSync("docs/release/hoophub-compliance-matrix.md", "utf8") : "";
describe("manual release readiness contract", () => {
  it("defines stable manual blocker codes", () => {
    for (const token of ["operator_facts", "privacy_policy_url", "voiceover_qa", "keyboard_qa", "text_scaling_qa", "ios_privacy_gate", "shipping_licenses"]) expect(source).toContain(token);
    expect(source).toContain("getManualReleaseBlockers");
  });
  it("contains all twenty original compliance items", () => {
    for (let i = 1; i <= 20; i += 1) expect(matrix).toContain(`| ${i} |`);
  });
});
