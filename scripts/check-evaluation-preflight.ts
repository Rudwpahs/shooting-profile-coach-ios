/**
 * Preflight for the private real-video evaluation build.
 *
 *   corepack pnpm preflight:evaluation
 *
 * Prints only check names and outcomes. No environment value is ever echoed, so
 * running this in a shared terminal or pasting the output is safe.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import {
  evaluatePreflight,
  formatPreflight,
  parseEnvFile,
} from "@/lib/shooting-profile/evaluation-preflight";

function hasTool(command: string): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isGitIgnored(path: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "--quiet", path], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function main(): number {
  const envPath = resolve(".env.local");
  const present = existsSync(envPath);
  const result = evaluatePreflight({
    ...(present ? { envFile: parseEnvFile(readFileSync(envPath, "utf8")) } : {}),
    envFileIgnored: present ? isGitIgnored(envPath) : isGitIgnored(".env.local"),
    tools: {
      node: true,
      xcodebuild: hasTool("xcodebuild"),
      pod: hasTool("pod"),
      java: hasTool("java"),
    },
  });
  process.stdout.write(`${formatPreflight(result)}\n`);
  return result.ready ? 0 : 1;
}

try {
  process.exitCode = main();
} catch {
  process.stderr.write("preflight failed\n");
  process.exitCode = 2;
}
