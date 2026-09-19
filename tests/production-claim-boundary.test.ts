import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const motion = readFileSync("app/(tabs)/motion.tsx", "utf8");
const workflow = readFileSync(".github/workflows/ui-web-preview-pages.yml", "utf8");
describe("production claim boundary", () => {
  it("redirects the legacy motion route without named-player analysis", () => {
    expect(motion).toContain("Redirect");
    expect(motion).not.toMatch(/PLAYER_|Stephen|Curry|Paul George|Image 3D/);
    expect(motion).not.toContain("player-analysis-evidence");
  });
  it("rejects named-player analysis tokens in ordinary production export", () => {
    for (const token of ["Stephen Curry", "Paul George", "IMAGE-LIFTED 3D ANALYSIS", "PLAYER_MONOCULAR_3D_ANALYSES"]) expect(workflow).toContain(token);
  });
});
