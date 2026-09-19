import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const productLibrary = readFileSync("lib/anonymous-pose-library.ts", "utf8");
function files(root: string): string[] { const out: string[] = []; for (const entry of readdirSync(root)) { const path = join(root, entry); const stat = statSync(path); if (stat.isDirectory()) out.push(...files(path)); else if (/\.(ts|tsx)$/.test(entry)) out.push(path); } return out; }
const productionSource = ["app", "components", "hooks", "lib/reels"].flatMap((root) => files(root)).map((path) => readFileSync(path, "utf8")).join("\n");
describe("production player identity boundary", () => {
  it("keeps named-player evidence out of the product reference library", () => {
    expect(productLibrary).not.toMatch(/Stephen Curry|Paul George|curry-|paul-george-/i);
    expect(productLibrary).not.toContain("PLAYER_MONOCULAR_3D_ANALYSES");
  });
  it("has no production importer of the research-only player module", () => {
    expect(productionSource).not.toContain("@/lib/research/player-analysis-evidence");
  });
});
