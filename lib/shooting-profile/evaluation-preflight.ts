import { CONSENT_RECORD_ID_PATTERN_V1 } from "@/lib/shooting-profile/evaluation-report";

/**
 * Checks the environment a private real-video evaluation build needs, before
 * anyone spends a session filming. It reads names and shapes only - it never
 * prints a value back, so a mistyped identifier cannot leak into a terminal
 * transcript or CI log.
 */
export const EVALUATION_PREFLIGHT_VERSION = "real_video_evaluation_preflight_v1" as const;

export type PreflightSeverityV1 = "blocker" | "warning";

export type PreflightCheckV1 = Readonly<{
  id: string;
  passed: boolean;
  severity: PreflightSeverityV1;
  /** Stable, non-identifying explanation. Never contains an environment value. */
  detail: string;
}>;

export type PreflightResultV1 = Readonly<{
  version: typeof EVALUATION_PREFLIGHT_VERSION;
  ready: boolean;
  checks: readonly PreflightCheckV1[];
}>;

/** Every flag the evaluation panel needs, each of which must be exactly "1". */
export const REQUIRED_EVALUATION_FLAGS_V1 = Object.freeze([
  "EXPO_PUBLIC_FORMPATH_CAPTURE_V2",
  "EXPO_PUBLIC_FORMPATH_PROFILE_V2",
  "EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D",
  "EXPO_PUBLIC_FORMPATH_REAL_VIDEO_EVAL",
] as const);

export const CONSENT_RECORD_ENV_V1 = "EXPO_PUBLIC_FORMPATH_CONSENT_RECORD_ID" as const;

export type PreflightEnvironmentV1 = Readonly<{
  /** The parsed `.env.local`, or undefined when the file is absent. */
  envFile?: Readonly<Record<string, string>>;
  /** Whether `git check-ignore` reports the env file as ignored. */
  envFileIgnored?: boolean;
  /** Present platform tools, by name. */
  tools: Readonly<Record<string, boolean>>;
}>;

/** Parses a dotenv-style file. Values are kept only to check their shape. */
export function parseEnvFile(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key.length > 0) parsed[key] = value;
  }
  return parsed;
}

function check(id: string, passed: boolean, severity: PreflightSeverityV1, detail: string): PreflightCheckV1 {
  return Object.freeze({ id, passed, severity, detail });
}

export function evaluatePreflight(environment: PreflightEnvironmentV1): PreflightResultV1 {
  const checks: PreflightCheckV1[] = [];
  const env = environment.envFile;

  checks.push(check(
    "env_file_present",
    env !== undefined,
    "blocker",
    ".env.local must exist at the repository root",
  ));
  checks.push(check(
    "env_file_gitignored",
    environment.envFileIgnored === true,
    "blocker",
    ".env.local must be ignored by git so flags and the consent id are never committed",
  ));

  for (const flag of REQUIRED_EVALUATION_FLAGS_V1) {
    checks.push(check(
      `flag_${flag}`,
      env?.[flag] === "1",
      "blocker",
      `${flag} must be exactly "1"`,
    ));
  }

  checks.push(check(
    "consent_record_id",
    CONSENT_RECORD_ID_PATTERN_V1.test(env?.[CONSENT_RECORD_ENV_V1] ?? ""),
    "blocker",
    `${CONSENT_RECORD_ENV_V1} must match local-consent-YYYYMMDD-NNN`,
  ));

  // A development build is required for the panel; these are the tools that
  // produce one. Missing tools are blockers on the machine that builds.
  for (const [tool, detail] of [
    ["node", "Node must be available"],
    ["xcodebuild", "Xcode command line tools are required to build for a device"],
    ["pod", "CocoaPods is required to install the native pose module"],
  ] as const) {
    checks.push(check(`tool_${tool}`, environment.tools[tool] === true, "blocker", detail));
  }
  checks.push(check(
    "tool_java",
    environment.tools.java === true,
    "warning",
    "Java is only needed for the local Firestore emulator; CI covers it otherwise",
  ));

  return Object.freeze({
    version: EVALUATION_PREFLIGHT_VERSION,
    ready: checks.every((entry) => entry.passed || entry.severity === "warning"),
    checks: Object.freeze(checks),
  });
}

export function formatPreflight(result: PreflightResultV1): string {
  const lines = result.checks.map((entry) => {
    const mark = entry.passed ? "PASS" : entry.severity === "blocker" ? "FAIL" : "WARN";
    return `  [${mark}] ${entry.id} - ${entry.detail}`;
  });
  const blockers = result.checks.filter((entry) => !entry.passed && entry.severity === "blocker").length;
  return [
    `${EVALUATION_PREFLIGHT_VERSION}`,
    ...lines,
    result.ready
      ? "ready: this machine can build and run the private evaluation path"
      : `not ready: ${blockers} blocker(s) above must be fixed first`,
  ].join("\n");
}
