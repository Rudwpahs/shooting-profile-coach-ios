import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const appConfig = readFileSync("app.config.ts", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: Record<string, string> };

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) out.push(path);
  }
  return out;
}

const runtimeSource = ["app", "components", "hooks", "lib"]
  .flatMap(sourceFiles)
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

describe("native capability minimization", () => {
  it("does not request unused audio or notification capabilities", () => {
    expect(appConfig).not.toContain("microphonePermission");
    expect(appConfig).not.toContain("POST_NOTIFICATIONS");
    expect(pkg.dependencies).not.toHaveProperty("expo-audio");
    expect(pkg.dependencies).not.toHaveProperty("expo-notifications");
  });

  it("has no runtime import of removed capability packages", () => {
    expect(runtimeSource).not.toMatch(/from ["']expo-audio["']|require\(["']expo-audio["']\)/);
    expect(runtimeSource).not.toMatch(/from ["']expo-notifications["']|require\(["']expo-notifications["']\)/);
  });
});
