import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { SchemeColors, ThemeColors, tokens, type TokenName } from "@/constants/tokens";

const SEMANTIC_TOKENS: readonly TokenName[] = [
  "background", "surface", "elevatedSurface", "foreground", "mutedForeground", "border",
  "primary", "primaryForeground", "primarySoft",
  "skeletonPrimary", "skeletonSecondary", "skeletonDerived", "stage", "stageForeground",
  "positive", "positiveSoft", "warning", "warningSoft", "destructive", "destructiveSoft",
  "analysisLowConfidence", "analysisHighConfidence", "focusRing",
];

const HEX = /^#[0-9A-F]{6}([0-9A-F]{2})?$/;

function luminance(hex: string): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|js)$/.test(entry) ? [path] : [];
  });
}

const COLOR_LITERAL = /#[0-9A-Fa-f]{3,8}\b|rgba?\(/;

describe("semantic colour tokens", () => {
  it("defines every semantic token in both schemes as a hex colour", () => {
    for (const name of SEMANTIC_TOKENS) {
      expect(ThemeColors[name], name).toBeDefined();
      for (const scheme of ["light", "dark"] as const) {
        expect(SchemeColors[scheme][name], `${scheme}.${name}`).toMatch(HEX);
      }
    }
  });

  it("ships Direction A (Graphite / Volt) as the dark scheme and paints screens with it", () => {
    expect(SchemeColors.dark).toMatchObject({
      background: "#0F1012",
      surface: "#17191D",
      foreground: "#F1F1EC",
      primary: "#C9F24B",
      primaryForeground: "#0F1012",
      skeletonPrimary: "#F1F1EC",
      skeletonSecondary: "#C9F24B",
      stage: "#17191D",
    });
    expect(tokens).toBe(SchemeColors.dark);
  });

  it("meets WCAG contrast on the pairs the design rules promise, in both schemes", () => {
    for (const scheme of ["light", "dark"] as const) {
      const t = SchemeColors[scheme];
      expect(contrast(t.foreground, t.background), `${scheme} text`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.foreground, t.surface), `${scheme} text on surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.mutedForeground, t.background), `${scheme} muted text`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.mutedForeground, t.surface), `${scheme} muted on surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.primaryForeground, t.primary), `${scheme} button text`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.primary, t.background), `${scheme} primary as UI element`).toBeGreaterThanOrEqual(3);
      expect(contrast(t.skeletonPrimary, t.stage), `${scheme} skeleton`).toBeGreaterThanOrEqual(3);
      expect(contrast(t.skeletonSecondary, t.stage), `${scheme} shooting arm`).toBeGreaterThanOrEqual(3);
      expect(contrast(t.focusRing, t.background), `${scheme} focus ring`).toBeGreaterThanOrEqual(3);
      expect(contrast(t.warning, t.background), `${scheme} warning`).toBeGreaterThanOrEqual(3);
      expect(contrast(t.destructive, t.background), `${scheme} destructive`).toBeGreaterThanOrEqual(3);
    }
  });

  it("leaves no colour literal in app/ or components/ (every screen paints with tokens)", () => {
    const offenders: string[] = [];
    for (const root of ["app", "components"]) {
      for (const file of sourceFiles(join(process.cwd(), root))) {
        readFileSync(file, "utf8").split("\n").forEach((line, index) => {
          if (COLOR_LITERAL.test(line)) offenders.push(`${relative(process.cwd(), file)}:${index + 1}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("commits the app to the dark scheme", () => {
    const appConfig = readFileSync(join(process.cwd(), "app.config.ts"), "utf8");
    expect(appConfig).toMatch(/userInterfaceStyle:\s*"dark"/);
    const provider = readFileSync(join(process.cwd(), "lib/theme-provider.tsx"), "utf8");
    expect(provider).toMatch(/useState<ColorScheme>\("dark"\)/);
  });
});
