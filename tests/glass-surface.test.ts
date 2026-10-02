import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { GLASS_PRESETS } from "@/lib/glass/glass-tokens";

const read = (path: string) => readFileSync(path, "utf8");

describe("Hoop Hub GlassSurface", () => {
  it("keeps the medium-strength optical presets restrained and centralized", () => {
    expect(GLASS_PRESETS.chip.refraction).toBeLessThanOrEqual(0.18);
    expect(GLASS_PRESETS.chip.glareOpacity).toBeLessThanOrEqual(0.28);
    expect(GLASS_PRESETS.button.refraction).toBeLessThanOrEqual(0.18);
    expect(GLASS_PRESETS.bar.blurRadius).toBeGreaterThan(GLASS_PRESETS.chip.blurRadius);
  });

  it("defines one semantic API with iOS, web and native implementations", () => {
    const shared = read("components/glass/glass-surface.tsx");
    expect(shared).toContain("GlassVariant");
    expect(shared).toContain("GlassTint");
    expect(shared).toContain("interactive?: boolean");
    expect(read("components/glass/glass-surface.ios.tsx")).toContain("GlassView");
    expect(read("components/glass/glass-surface.web.tsx")).toContain("supportsBackdropFilter");
    expect(read("components/glass/glass-surface.native.tsx")).toContain("GlassSurface");
  });

  it("uses an opaque token fallback when native or web glass is unavailable", () => {
    for (const path of [
      "components/glass/glass-surface.tsx",
      "components/glass/glass-surface.native.tsx",
      "components/glass/glass-surface.ios.tsx",
      "components/glass/glass-surface.web.tsx",
    ]) {
      const source = read(path);
      expect(source, path).toContain("tokens.surface");
      expect(source, path).toContain("tokens.elevatedSurface");
    }
    const ios = read("components/glass/glass-surface.ios.tsx");
    const fallback = ios.slice(ios.indexOf("function GraphiteGlassFallback"), ios.indexOf("export function GlassSurface"));
    expect(fallback).not.toContain("tokens.primarySoft");
    expect(ios).toContain("isLiquidGlassAvailable()");
    expect(ios).toContain("GraphiteGlassFallback");
  });

  it("keeps the web tint decorative so it cannot steal pointer or accessibility interaction", () => {
    const web = read("components/glass/glass-surface.web.tsx");
    expect(web).toContain('aria-hidden');
    expect(web).toContain('pointerEvents="none"');
    expect(web).toContain('backend === "web-css"');
  });
});
