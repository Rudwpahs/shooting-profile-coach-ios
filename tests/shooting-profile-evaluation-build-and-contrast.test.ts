import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/** WCAG 2.1 relative luminance for an sRGB hex colour. */
function relativeLuminance(hex: string): number {
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)]
    .map((pair) => Number.parseInt(pair, 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The two surfaces every V2 capture screen paints small text on. */
const CANVAS = "#F5F1E8";
const CARD = "#FFFEFA";

const V2_SURFACES = [
  "app/private-capture.tsx",
  "components/private-pose-capture.tsx",
  "components/shooting-profile/capture-mode-picker.tsx",
  "components/shooting-profile/capture-session.tsx",
  "components/shooting-profile/capture-slot-card.tsx",
  "components/shooting-profile/profile-list.tsx",
  "components/shooting-profile/quality-summary.tsx",
  "components/shooting-profile/real-video-evaluation-panel.tsx",
];

describe("capture surface text contrast", () => {
  it("computes at least 4.5:1 for every small-text colour on both capture surfaces", () => {
    const smallTextColours = ["#5A6B80", "#102235", "#9A3412", "#8A2F14", "#C24122"];
    for (const colour of smallTextColours) {
      expect(contrastRatio(colour, CANVAS), `${colour} on ${CANVAS}`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colour, CARD), `${colour} on ${CARD}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio("#FFFFFF", "#102235")).toBeGreaterThanOrEqual(4.5);
  });

  it("retires the muted colour that failed the small-text ratio", () => {
    // #61738A measured 4.25:1 on the capture canvas, below the 4.5:1 floor.
    expect(contrastRatio("#61738A", CANVAS)).toBeLessThan(4.5);
    for (const file of V2_SURFACES) {
      expect(read(file), file).not.toContain("#61738A");
    }
  });
});

describe("iOS evaluation build configuration", () => {
  const appConfig = read("app.config.ts");
  const packageJson = JSON.parse(read("package.json"));

  it("declares the light interface style the product screens actually paint", () => {
    // Every capture screen uses one fixed light palette. Declaring "automatic"
    // made iOS draw system surfaces dark over those hardcoded light screens.
    expect(appConfig).toContain('userInterfaceStyle: "light"');
    expect(appConfig).not.toContain('userInterfaceStyle: "automatic"');
  });

  it("registers the config plugins Expo expects for this SDK", () => {
    expect(appConfig).toContain('"expo-font"');
    expect(appConfig).toContain('"expo-web-browser"');
  });

  it("keeps native module access on the expo package and installs the required peer", () => {
    expect(packageJson.dependencies["expo-modules-core"]).toBeUndefined();
    expect(packageJson.dependencies["expo-asset"]).toMatch(/^~12\./);
    expect(packageJson.dependencies.expo).toBe("~54.0.37");
  });

  it("anchors the generated native folders so local module sources stay tracked", () => {
    const gitignore = read(".gitignore");
    // Expo Doctor still reports these as gitignored; `git check-ignore` reports
    // nothing and all four modules/formpath-pose/ios files are tracked, so that
    // check is a verified false positive for this layout.
    expect(gitignore).toMatch(/^\/ios$/m);
    expect(gitignore).toMatch(/^\/android$/m);
    expect(gitignore).not.toMatch(/^ios$/m);
    expect(gitignore).not.toMatch(/^android$/m);
    expect(gitignore).not.toMatch(/^modules\//m);
  });
});
