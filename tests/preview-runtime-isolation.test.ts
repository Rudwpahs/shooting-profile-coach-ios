import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const GATE = 'process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"';
const read = (path: string) => readFileSync(path, "utf8");
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?)$/.test(entry) ? [path] : [];
  });
}

/** Production files that are allowed to reach the preview runtime, only through the build-time-foldable gate. */
const GATED_PREVIEW_SITES = [
  "app/_layout.tsx",
  "app/private-capture.tsx",
  "lib/feature-flags.ts",
  "lib/firebase-auth.tsx",
  "lib/shooting-profile-source.ts",
];

describe("PreviewRuntime stays isolated from ordinary production", () => {
  it("is reached only through the literal preview-build gate followed by a require, never a static value import", () => {
    for (const file of GATED_PREVIEW_SITES) {
      const source = withoutComments(read(file));
      const gateIndex = source.indexOf(GATE);
      const requireIndex = source.indexOf('require("@/lib/preview/');
      expect(gateIndex, `${file} must contain the literal gate`).toBeGreaterThan(-1);
      expect(requireIndex, `${file} must load the preview runtime with require`).toBeGreaterThan(gateIndex);
      expect(source, file).not.toMatch(/^import (?!type\b)[^;]*from "@\/lib\/preview\//m);
    }
  });

  it("is never referenced by any other production file", () => {
    const offenders: string[] = [];
    for (const root of ["app", "components", "hooks", "lib"]) {
      for (const file of sourceFiles(root)) {
        const rel = relative(process.cwd(), file).replace(/\\/g, "/");
        if (rel.startsWith("lib/preview/") || GATED_PREVIEW_SITES.includes(rel)) continue;
        if (/@\/lib\/preview\//.test(withoutComments(read(file)))) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the development fixtures reachable only from the demo tree and the preview runtime", () => {
    const offenders: string[] = [];
    for (const root of ["app", "components", "hooks", "lib"]) {
      for (const file of sourceFiles(root)) {
        const rel = relative(process.cwd(), file).replace(/\\/g, "/");
        if (rel.startsWith("lib/dev/") || rel.startsWith("lib/preview/")) continue;
        if (/@\/lib\/dev\/|@\/tests\//.test(withoutComments(read(file)))) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("carries no synthetic shot library: the preview shows the reference and the owner's own footage only", () => {
    expect(existsSync("lib/preview/preview-shot-library.ts")).toBe(false);
    expect(existsSync("lib/preview/preview-explore-motions.ts")).toBe(false);
    for (const file of sourceFiles("lib/preview")) {
      expect(withoutComments(read(file)), file).not.toMatch(/preview-shot|PREVIEW_SHOT|PREVIEW_PROFILE_ID|syntheticLandmarkSession|@\/tests\/|buildUiDemoFixtures/);
    }
    // The analysis route and the explore source no longer need the preview runtime at all.
    for (const file of ["app/private-analysis/[id].tsx", "lib/explore-source.ts", "app/dev/ui-demo.tsx"]) {
      expect(withoutComments(read(file)), file).not.toMatch(/@\/lib\/preview\/|preview-shot|EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD/);
    }
  });

  it("never talks to Firebase, the network or storage from the preview runtime", () => {
    for (const file of sourceFiles("lib/preview")) {
      const source = withoutComments(read(file)).replace(/^import type .*$/gm, "");
      expect(source, file).not.toMatch(/from "firebase\/|from "@\/lib\/firebase|fetch\(|axios|trpc|upload|AsyncStorage|localStorage|sessionStorage|indexedDB/);
      expect(source, file).not.toMatch(/console\.(log|warn|error)/);
    }
  });

  it("swaps only the data source: the auth provider, flags and profile reads keep their production implementation outside the gate", () => {
    const auth = read("lib/firebase-auth.tsx");
    expect(auth).toContain("onAuthStateChanged(firebaseAuth");
    expect(auth).toContain("deleteAccount: (password: string) => Promise<void>");
    expect(auth).toContain("export const FirebaseAuthContext");

    const source = read("lib/shooting-profile-source.ts");
    expect(source).toContain('from "@/lib/firebase-shooting-profiles"');
    expect(source).toContain('from "@/lib/firebase-private-data"');
    for (const name of ["listShootingProfilesV2", "getShootingProfileV2", "deleteShootingProfileV2", "resumePendingShootingProfileDeletionsV2", "saveShootingProfileV2", "listFirebasePrivatePoses", "removeFirebasePrivatePose"]) {
      expect(source, name).toMatch(new RegExp(`export const ${name}\\b`));
    }

    const flags = read("lib/feature-flags.ts");
    expect(flags).toContain("export const FORMPATH_FLAG_RESOLUTION = resolveFormPathFlags(");
    expect(flags).toMatch(/FORMPATH_FLAG_RESOLUTION\.flags/);
    expect(flags).toMatch(/EXPO_PUBLIC_FORMPATH_SHOT_INSPECTION_V1/);
  });

  it("routes every owner-bound read and write through the swappable source, not the Firebase modules directly", () => {
    for (const file of ["app/(tabs)/index.tsx", "app/(tabs)/profile.tsx", "app/private-analysis/[id].tsx", "app/private-capture.tsx", "app/reels.tsx", "hooks/use-latest-representative-profile.ts"]) {
      const source = withoutComments(read(file));
      expect(source, file).not.toMatch(/^import (?!type\b)[^;]*from "@\/lib\/firebase-shooting-profiles"/m);
      expect(source, file).not.toMatch(/^import (?!type\b)[^;]*from "@\/lib\/firebase-private-data"/m);
    }
  });

  it("keeps the ordinary production export free of preview identifiers", () => {
    const workflow = read(".github/workflows/ui-web-preview-pages.yml");
    expect(workflow).toContain('EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD: "0"');
    expect(workflow).toContain("preview-shot-");
    expect(workflow).toContain("demo-fixture-");
  });
});
