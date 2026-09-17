import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { GLASS_PRESETS } from "@/lib/glass/glass-tokens";

const read = (path: string) => readFileSync(path, "utf8");

describe("Hoop Hub GlassSurface contract", () => {
  it("keeps the approved medium-strength optical preset restrained", () => {
    expect(GLASS_PRESETS.chip.refraction).toBeLessThanOrEqual(0.18);
    expect(GLASS_PRESETS.chip.glareOpacity).toBeLessThanOrEqual(0.28);
    expect(GLASS_PRESETS.button.refraction).toBeLessThanOrEqual(0.18);
    expect(GLASS_PRESETS.bar.blurRadius).toBeGreaterThan(GLASS_PRESETS.chip.blurRadius);
  });

  it("defines one semantic surface API and platform-specific implementations", () => {
    const shared = read("components/glass/glass-surface.tsx");
    expect(shared).toContain('"bar" | "chip" | "button" | "panel"');
    expect(shared).toContain('"neutral" | "volt"');
    expect(shared).toContain("interactive?: boolean");
    expect(read("components/glass/glass-surface.ios.tsx")).toContain("GlassView");
    expect(read("components/glass/glass-surface.web.tsx")).toContain("GlassSurface");
    expect(read("components/glass/glass-surface.native.tsx")).toContain("GlassSurface");
  });

  it("keeps platform fallbacks behind the product abstraction", () => {
    const ios = read("components/glass/glass-surface.ios.tsx");
    expect(ios).toContain("isLiquidGlassAvailable()");
    expect(ios).toContain("glassEffectStyle");
    expect(ios).toContain("isInteractive");
    expect(ios).toContain("GraphiteGlassFallback");
  });
});
