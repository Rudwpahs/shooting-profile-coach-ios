import { themeColors } from "@/theme.config";

/**
 * Semantic colour tokens, pure and importable anywhere (no React Native import),
 * so contract tests and scripts can read them without a native runtime.
 */
export type ColorScheme = "light" | "dark";
export const ThemeColors = themeColors;

export type TokenName = keyof typeof ThemeColors;
export type SchemePalette = Record<ColorScheme, Record<TokenName, string>>;

function buildSchemePalette(colors: typeof ThemeColors): SchemePalette {
  const palette: SchemePalette = {
    light: {} as SchemePalette["light"],
    dark: {} as SchemePalette["dark"],
  };
  (Object.keys(colors) as TokenName[]).forEach((name) => {
    palette.light[name] = colors[name].light;
    palette.dark[name] = colors[name].dark;
  });
  return palette;
}

export const SchemeColors = buildSchemePalette(ThemeColors);

/**
 * The colour tokens product screens paint with.
 *
 * Hoop Hub ships one visual world, Direction A (Graphite / Volt), so screens read
 * the dark scheme directly at module scope and can use these values inside
 * `StyleSheet.create`. Every screen colour must come from here; the contract
 * test in `tests/ui-tokens.test.ts` refuses colour literals in `app/` and
 * `components/`.
 */
export const tokens = SchemeColors.dark;
