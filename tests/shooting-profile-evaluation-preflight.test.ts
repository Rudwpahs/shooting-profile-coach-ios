import { describe, expect, it } from "vitest";

import {
  CONSENT_RECORD_ENV_V1,
  EVALUATION_PREFLIGHT_VERSION,
  evaluatePreflight,
  formatPreflight,
  parseEnvFile,
  REQUIRED_EVALUATION_FLAGS_V1,
  type PreflightEnvironmentV1,
} from "@/lib/shooting-profile/evaluation-preflight";

const READY_ENV = Object.freeze({
  EXPO_PUBLIC_FORMPATH_CAPTURE_V2: "1",
  EXPO_PUBLIC_FORMPATH_PROFILE_V2: "1",
  EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D: "1",
  EXPO_PUBLIC_FORMPATH_REAL_VIDEO_EVAL: "1",
  [CONSENT_RECORD_ENV_V1]: "local-consent-20260902-001",
});

const MAC: PreflightEnvironmentV1 = {
  envFile: READY_ENV,
  envFileIgnored: true,
  tools: { node: true, xcodebuild: true, pod: true, java: true },
};

const failed = (environment: PreflightEnvironmentV1) => evaluatePreflight(environment)
  .checks.filter((check) => !check.passed).map((check) => check.id);

describe("evaluation preflight", () => {
  it("passes a fully prepared build machine", () => {
    const result = evaluatePreflight(MAC);

    expect(result.version).toBe(EVALUATION_PREFLIGHT_VERSION);
    expect(result.ready).toBe(true);
    expect(failed(MAC)).toEqual([]);
  });

  it("treats a missing or non-exact flag as a blocker", () => {
    for (const flag of REQUIRED_EVALUATION_FLAGS_V1) {
      for (const value of [undefined, "", "0", "true", "yes", " 1"]) {
        const envFile = { ...READY_ENV, ...(value === undefined ? {} : { [flag]: value }) };
        if (value === undefined) delete (envFile as Record<string, string>)[flag];
        const result = evaluatePreflight({ ...MAC, envFile });
        expect(result.ready, `${flag}=${String(value)}`).toBe(false);
        expect(failed({ ...MAC, envFile })).toContain(`flag_${flag}`);
      }
    }
  });

  it("requires the documented consent record form", () => {
    for (const value of ["", "hyunjun-lee-1990", "abcd1234", "local-consent-2026-001"]) {
      const environment = { ...MAC, envFile: { ...READY_ENV, [CONSENT_RECORD_ENV_V1]: value } };
      expect(failed(environment), value).toContain("consent_record_id");
    }
    expect(failed({
      ...MAC,
      envFile: { ...READY_ENV, [CONSENT_RECORD_ENV_V1]: "local-consent-19991231-999" },
    })).toEqual([]);
  });

  it("blocks a missing or committed env file", () => {
    const absent = { ...MAC, envFile: undefined, envFileIgnored: true };
    expect(failed(absent)).toContain("env_file_present");
    expect(failed({ ...MAC, envFileIgnored: false })).toContain("env_file_gitignored");
  });

  it("blocks a machine without the iOS build tools but only warns about Java", () => {
    const windows: PreflightEnvironmentV1 = {
      ...MAC,
      tools: { node: true, xcodebuild: false, pod: false, java: false },
    };
    const result = evaluatePreflight(windows);

    expect(result.ready).toBe(false);
    expect(failed(windows)).toEqual(["tool_xcodebuild", "tool_pod", "tool_java"]);
    expect(result.checks.find((check) => check.id === "tool_java")?.severity).toBe("warning");

    // Java alone must not block: CI runs the emulator suite.
    const javaOnly: PreflightEnvironmentV1 = {
      ...MAC,
      tools: { node: true, xcodebuild: true, pod: true, java: false },
    };
    expect(evaluatePreflight(javaOnly).ready).toBe(true);
  });

  it("never echoes an environment value in a check detail or the printed report", () => {
    const secretish = "local-consent-20260902-001";
    const environment: PreflightEnvironmentV1 = {
      ...MAC,
      envFile: { ...READY_ENV, [CONSENT_RECORD_ENV_V1]: secretish, UNRELATED_TOKEN: "sk-should-never-print" },
    };
    const printed = formatPreflight(evaluatePreflight(environment));

    expect(printed).not.toContain(secretish);
    expect(printed).not.toContain("sk-should-never-print");
    for (const check of evaluatePreflight(environment).checks) {
      expect(check.detail).not.toContain(secretish);
    }
  });

  it("parses a dotenv file without executing or reordering it", () => {
    const parsed = parseEnvFile([
      "# a comment",
      "",
      'EXPO_PUBLIC_FORMPATH_CAPTURE_V2="1"',
      "EXPO_PUBLIC_FORMPATH_PROFILE_V2 = 1 ",
      "MALFORMED",
      "=nokey",
      "WITH_EQUALS=a=b",
    ].join("\n"));

    expect(parsed).toEqual({
      EXPO_PUBLIC_FORMPATH_CAPTURE_V2: "1",
      EXPO_PUBLIC_FORMPATH_PROFILE_V2: "1",
      WITH_EQUALS: "a=b",
    });
  });
});
