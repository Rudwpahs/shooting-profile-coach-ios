import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { buildUiDemoFixtures } from "@/lib/dev/ui-demo-fixtures";

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?)$/.test(entry) ? [path] : [];
  });
}

describe("UI demo harness stays isolated from normal production", () => {
  const gate = readFileSync("lib/dev/ui-demo.ts", "utf8");
  const route = readFileSync("app/dev/ui-demo.tsx", "utf8");
  const fixtures = readFileSync("lib/dev/ui-demo-fixtures.ts", "utf8");

  it("is enabled only by the development opt-in or the explicit Pages preview-build opt-in", () => {
    expect(gate).toContain('__DEV__ && process.env.EXPO_PUBLIC_HOOPHUB_UI_DEMO === "1"');
    expect(gate).toContain('process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"');
  });

  it("loads fixtures only behind build-time-foldable demo gates so an ordinary production bundle can drop them", () => {
    expect(route).toContain('__DEV__ && process.env.EXPO_PUBLIC_HOOPHUB_UI_DEMO === "1"');
    expect(route).toContain('process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"');
    expect(route).toContain('require("@/lib/dev/ui-demo-fixtures")');
    // A type-only import is erased at build time; only a value import would pull the fixtures in.
    expect(route).not.toMatch(/^import (?!type\b).*ui-demo-fixtures/m);
    expect(route.indexOf('process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"')).toBeLessThan(
      route.indexOf('require("@/lib/dev/ui-demo-fixtures")'),
    );
    expect(route).toContain("if (!UI_DEMO_ENABLED || !fixtures) return <Redirect");
  });

  it("builds fixtures from the synthetic session only: no network, no account, no real person", () => {
    expect(fixtures).toContain("syntheticLandmarkSession");
    // Type-only imports name the record shapes and are erased at build time; the scan targets runtime access.
    const runtime = fixtures.replace(/^import type .*$/gm, "");
    expect(runtime).not.toMatch(/firebase|fetch\(|axios|trpc|ImagePicker/);
    expect(fixtures).toMatch(/demo|fixture/i);
  });

  it("drives every demo capture state through the unchanged reducer from the synthetic session", () => {
    const demo = buildUiDemoFixtures();
    expect(demo.profile.quality.passed).toBe(true);
    expect(demo.recaptureProfile.quality.passed).toBe(false);
    expect(demo.capture.setup.status).toBe("setup");
    expect(demo.capture.collecting.status).toBe("collecting");
    expect(demo.capture.recapture.status).toBe("collecting");
    expect(demo.capture.recapture.slots[0].status).toBe("rejected");
    expect(demo.capture.recapture.slots[0].rejectionReason).toBeTruthy();
    expect(demo.capture.review.status).toBe("result_review");
    expect(demo.capture.review.slots.every((slot) => slot.status === "accepted")).toBe(true);
    expect(demo.summaries.every((summary) => summary.id.startsWith("demo-fixture-"))).toBe(true);
  });

  it("is never imported by a production path", () => {
    const offenders: string[] = [];
    for (const root of ["app", "components", "hooks", "lib"]) {
      for (const file of sourceFiles(join(process.cwd(), root))) {
        const rel = relative(process.cwd(), file).replace(/\\/g, "/");
        if (rel.startsWith("lib/dev/") || rel === "app/dev/ui-demo.tsx") continue;
        const source = readFileSync(file, "utf8");
        if (/@\/lib\/dev\/|@\/tests\//.test(source)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
